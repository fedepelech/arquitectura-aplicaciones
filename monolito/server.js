const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_poc',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de autenticación simple
app.use((req, res, next) => {
  const apiKey = req.headers['authorization'];
  if (!apiKey || apiKey !== `Bearer ${process.env.LOCAL_API_KEY || 'local-key-123'}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// =============================================================================
// ENDPOINTS PRINCIPALES PARA MCP TOOLS
// =============================================================================

// 1. CLOSURE STATUS - Verifica si el día se puede cerrar
app.get('/api/closure-status/:date', async (req, res) => {
  const { date } = req.params;
  
  try {
    console.log(`[CLOSURE-API] Checking closure status for date: ${date}`);
    const startTime = Date.now();
    
    // Buscar día de negocio
    const tldResult = await pool.query(
      'SELECT * FROM tld WHERE business_date = $1',
      [date === 'today' ? new Date().toISOString().split('T')[0] : date]
    );
    
    if (tldResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Business day not found',
        date: date
      });
    }
    
    const businessDay = tldResult.rows[0];
    const errors = [];
    const warnings = [];
    let canClose = true;
    
    // CHECK 1: Transacciones sin procesar
    const unprocessedResult = await pool.query(
      'SELECT COUNT(*) as count, SUM(total_amount) as amount FROM sales WHERE tld_id = $1 AND processed = false',
      [businessDay.id]
    );
    
    if (parseInt(unprocessedResult.rows[0].count) > 0) {
      errors.push({
        type: 'unprocessed_transactions',
        message: `${unprocessedResult.rows[0].count} transacciones sin procesar`,
        count: parseInt(unprocessedResult.rows[0].count),
        amount: parseFloat(unprocessedResult.rows[0].amount || 0),
        severity: 'high'
      });
      canClose = false;
    }
    
    // CHECK 2: POS sin turnos activos
    const posWithoutShiftsResult = await pool.query(`
      SELECT tlp.pos_number, tlp.pos_name 
      FROM tld_list_pos tlp 
      LEFT JOIN shifts s ON s.pos_id = tlp.id 
      WHERE tlp.tld_id = $1 AND tlp.is_enabled = true AND s.id IS NULL
    `, [businessDay.id]);
    
    if (posWithoutShiftsResult.rows.length > 0) {
      errors.push({
        type: 'pos_without_shifts',
        message: `${posWithoutShiftsResult.rows.length} POS habilitadas sin turnos`,
        posList: posWithoutShiftsResult.rows,
        severity: 'high'
      });
      canClose = false;
    }
    
    // CHECK 3: Turnos no cerrados
    const openShiftsResult = await pool.query(
      'SELECT COUNT(*) as count FROM shifts WHERE tld_id = $1 AND status = $2',
      [businessDay.id, 'active']
    );
    
    if (parseInt(openShiftsResult.rows[0].count) > 0) {
      errors.push({
        type: 'open_shifts',
        message: `${openShiftsResult.rows[0].count} turnos aún abiertos`,
        count: parseInt(openShiftsResult.rows[0].count),
        severity: 'high'
      });
      canClose = false;
    }
    
    // CHECK 4: Diferencias de caja excesivas
    const cashDifferenceResult = await pool.query(`
      SELECT 
        SUM(ABS(sc.cash_difference)) as total_difference,
        COUNT(CASE WHEN ABS(sc.cash_difference) > 25.00 THEN 1 END) as excessive_differences,
        array_agg(
          CASE WHEN ABS(sc.cash_difference) > 25.00 
          THEN json_build_object('shift_id', sc.shift_id, 'difference', sc.cash_difference)
          END
        ) FILTER (WHERE ABS(sc.cash_difference) > 25.00) as problem_shifts
      FROM shift_close sc
      JOIN shifts s ON s.id = sc.shift_id
      WHERE s.tld_id = $1
    `, [businessDay.id]);
    
    const cashData = cashDifferenceResult.rows[0];
    if (parseInt(cashData.excessive_differences) > 0) {
      errors.push({
        type: 'excessive_cash_differences',
        message: `${cashData.excessive_differences} turnos con diferencias de caja > $25`,
        count: parseInt(cashData.excessive_differences),
        totalDifference: parseFloat(cashData.total_difference || 0),
        problemShifts: cashData.problem_shifts,
        severity: 'high'
      });
      canClose = false;
    }
    
    // CHECK 5: Inventario sin contar
    const uncountedInventoryResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM inventory 
      WHERE requires_daily_count = true 
      AND (last_counted_at IS NULL OR DATE(last_counted_at) < $1)
    `, [businessDay.business_date]);
    
    if (parseInt(uncountedInventoryResult.rows[0].count) > 0) {
      warnings.push({
        type: 'uncounted_inventory',
        message: `${uncountedInventoryResult.rows[0].count} items de inventario sin contar hoy`,
        count: parseInt(uncountedInventoryResult.rows[0].count),
        severity: 'medium'
      });
    }
    
    // CHECK 6: Ventas con datos faltantes
    const incompleteSalesResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM sales 
      WHERE tld_id = $1 AND (
        employee_id IS NULL OR 
        customer_count IS NULL OR 
        payment_method IS NULL OR
        (payment_method = 'cash' AND cash_received = 0) OR
        (payment_method = 'card' AND card_amount = 0)
      )
    `, [businessDay.id]);
    
    if (parseInt(incompleteSalesResult.rows[0].count) > 0) {
      warnings.push({
        type: 'incomplete_sales_data',
        message: `${incompleteSalesResult.rows[0].count} ventas con datos faltantes`,
        count: parseInt(incompleteSalesResult.rows[0].count),
        severity: 'medium'
      });
    }
    
    const responseTime = Date.now() - startTime;
    
    const response = {
      localId: process.env.LOCAL_ID || 'RESTO_001',
      businessDate: businessDay.business_date,
      canClose: canClose,
      closureBlocked: !canClose,
      summary: {
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        currentStatus: businessDay.status
      },
      details: {
        businessDay: businessDay,
        errors: errors,
        warnings: warnings
      },
      metadata: {
        queryTime: responseTime,
        timestamp: new Date().toISOString(),
        source: 'local-database'
      }
    };
    
    console.log(`[CLOSURE-API] Status check completed in ${responseTime}ms - Can close: ${canClose}`);
    res.json(response);
    
  } catch (error) {
    console.error('[CLOSURE-API] Error:', error);
    res.status(500).json({
      error: 'Database error',
      message: error.message,
      localId: process.env.LOCAL_ID
    });
  }
});

// 2. SALES DATA - Obtiene datos de ventas
app.get('/api/sales/:date', async (req, res) => {
  const { date } = req.params;
  
  try {
    console.log(`[SALES-API] Getting sales data for date: ${date}`);
    
    const actualDate = date === 'today' ? new Date().toISOString().split('T')[0] : date;
    
    const salesResult = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(total_amount) as total_sales,
        AVG(total_amount) as average_ticket,
        SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN is_voided = true THEN total_amount ELSE 0 END) as voided_amount,
        COUNT(CASE WHEN is_voided = true THEN 1 END) as voided_count,
        COUNT(CASE WHEN processed = false THEN 1 END) as unprocessed_count
      FROM sales s
      JOIN tld t ON t.id = s.tld_id
      WHERE t.business_date = $1
    `, [actualDate]);
    
    const categorySalesResult = await pool.query(`
      SELECT 
        p.pos_name,
        COUNT(s.id) as transactions,
        SUM(s.total_amount) as sales
      FROM sales s
      JOIN tld_list_pos p ON p.id = s.pos_id
      JOIN tld t ON t.id = s.tld_id
      WHERE t.business_date = $1
      GROUP BY p.pos_number, p.pos_name
      ORDER BY sales DESC
    `, [actualDate]);
    
    const salesData = salesResult.rows[0];
    
    res.json({
      localId: process.env.LOCAL_ID || 'RESTO_001',
      businessDate: actualDate,
      summary: {
        totalTransactions: parseInt(salesData.total_transactions) || 0,
        totalSales: parseFloat(salesData.total_sales) || 0,
        averageTicket: parseFloat(salesData.average_ticket) || 0,
        cashSales: parseFloat(salesData.cash_sales) || 0,
        cardSales: parseFloat(salesData.card_sales) || 0,
        voidedAmount: parseFloat(salesData.voided_amount) || 0,
        voidedCount: parseInt(salesData.voided_count) || 0,
        unprocessedCount: parseInt(salesData.unprocessed_count) || 0
      },
      byPos: categorySalesResult.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[SALES-API] Error:', error);
    res.status(500).json({
      error: 'Database error',
      message: error.message
    });
  }
});

// 3. LOGS SIMULATOR - Simula lectura de logs
app.get('/api/logs/:type', async (req, res) => {
  const { type } = req.params;
  const lines = parseInt(req.query.lines) || 50;
  
  try {
    // Simular logs basados en el estado actual de la DB
    const logs = await generateSimulatedLogs(type, lines);
    
    res.json({
      localId: process.env.LOCAL_ID || 'RESTO_001',
      logType: type,
      lines: logs,
      totalLines: logs.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Log read error',
      message: error.message
    });
  }
});

async function generateSimulatedLogs(type, lines) {
  const logs = [];
  const now = new Date();
  
  if (type === 'closure') {
    // Simular logs de cierre basados en problemas reales
    const openShifts = await pool.query(
      'SELECT COUNT(*) as count FROM shifts WHERE status = $1 AND DATE(start_time) = CURRENT_DATE',
      ['active']
    );
    
    if (parseInt(openShifts.rows[0].count) > 0) {
      logs.push(`${now.toISOString()} [ERROR] Daily closure blocked: ${openShifts.rows[0].count} shifts still open`);
      logs.push(`${now.toISOString()} [WARN] Attempting to close day with active shifts`);
    }
    
    logs.push(`${now.toISOString()} [INFO] Starting daily closure process`);
    logs.push(`${now.toISOString()} [INFO] Validating cash balances...`);
    logs.push(`${now.toISOString()} [INFO] Checking inventory counts...`);
    
  } else if (type === 'system') {
    logs.push(`${now.toISOString()} [INFO] System status: Online`);
    logs.push(`${now.toISOString()} [INFO] Database connections: Active`);
    logs.push(`${now.toISOString()} [WARN] High memory usage detected: 78%`);
    
  } else if (type === 'error') {
    logs.push(`${now.toISOString()} [ERROR] POS #3 connection timeout`);
    logs.push(`${now.toISOString()} [ERROR] Failed to process transaction TXN-001234`);
    logs.push(`${now.toISOString()} [ERROR] Inventory count mismatch for item: Coca Cola 500ml`);
  }
  
  return logs.slice(0, lines);
}

// =============================================================================
// ENDPOINTS DE GESTIÓN PARA PROBLEMAS
// =============================================================================

// 4. FORCE PROCESS TRANSACTIONS - Procesa transacciones pendientes
app.post('/api/admin/process-pending-transactions', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE sales SET processed = true WHERE processed = false RETURNING id, transaction_id, total_amount'
    );
    
    res.json({
      message: `Processed ${result.rows.length} pending transactions`,
      processedTransactions: result.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. FORCE CLOSE SHIFTS - Cierra turnos abiertos
app.post('/api/admin/force-close-shifts', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener turnos abiertos
    const openShiftsResult = await client.query(
      'SELECT * FROM shifts WHERE status = $1',
      ['active']
    );
    
    const closedShifts = [];
    
    for (const shift of openShiftsResult.rows) {
      // Calcular ventas del turno
      const salesResult = await client.query(
        'SELECT SUM(total_amount) as total FROM sales WHERE shift_id = $1',
        [shift.id]
      );
      
      // CORREGIDO: siempre asegúrate de usar números
      const openingCash = parseFloat(shift.opening_cash) || 0;
      const totalSales = parseFloat(salesResult.rows[0].total) || 0;
      const expectedCash = openingCash + totalSales;

      // Simular diferencia de caja numérica y redondear correctamente
      const cashDelta = (Math.random() - 0.5) * 100; // ±$50
      const actualCash = Math.round((expectedCash + cashDelta) * 100) / 100;
      // Diferencia de caja calculada como float
      const difference = Math.round((actualCash - expectedCash) * 100) / 100;

      // Cerrar turno
      await client.query(
        'UPDATE shifts SET status = $1, end_time = $2, expected_cash = $3 WHERE id = $4',
        ['closed', new Date(), expectedCash, shift.id]
      );
      
      // Crear registro de cierre
      await client.query(`
        INSERT INTO shift_close (shift_id, closing_cash, cash_difference, transaction_count, total_sales, closed_by)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [shift.id, actualCash, difference, 1, totalSales, 'ADMIN_FORCE']);
      
      closedShifts.push({
        shiftId: shift.id,
        posNumber: shift.pos_id,
        expectedCash: expectedCash,
        actualCash: actualCash,
        difference: difference
      });
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: `Force closed ${closedShifts.length} shifts`,
      closedShifts: closedShifts,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// 6. ENABLE/DISABLE POS
app.put('/api/admin/pos/:posId/status', async (req, res) => {
  const { posId } = req.params;
  const { enabled, reason } = req.body;
  
  try {
    const result = await pool.query(`
      UPDATE tld_list_pos 
      SET is_enabled = $1, 
          disabled_at = CASE WHEN $1 = false THEN CURRENT_TIMESTAMP ELSE NULL END,
          reason_disabled = $2
      WHERE id = $3
      RETURNING *
    `, [enabled, reason || null, posId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'POS not found' });
    }
    
    res.json({
      message: `POS ${enabled ? 'enabled' : 'disabled'} successfully`,
      pos: result.rows[0],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// ENDPOINT DE CIERRE DE DÍA (SIMULACIÓN REAL)
// =============================================================================

// 7. CLOSE BUSINESS DAY - Intento de cierre que falla con error genérico
app.post('/api/business-day/close/:date', async (req, res) => {
  const { date } = req.params;
  const { forceClosure = false } = req.body;
  
  try {
    console.log(`[CLOSE-DAY] Manager attempting to close business day: ${date}`);
    const startTime = Date.now();
    
    // Buscar día de negocio
    const actualDate = date === 'today' ? new Date().toISOString().split('T')[0] : date;
    const tldResult = await pool.query(
      'SELECT * FROM tld WHERE business_date = $1',
      [actualDate]
    );
    
    if (tldResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Business day not found',
        date: actualDate,
        timestamp: new Date().toISOString()
      });
    }
    
    const businessDay = tldResult.rows[0];
    
    // Si ya está cerrado
    if (businessDay.status === 'closed') {
      return res.status(409).json({
        error: 'Business day already closed',
        closedAt: businessDay.closed_at,
        timestamp: new Date().toISOString()
      });
    }
    
    // VERIFICACIONES CRÍTICAS (pero sin detallar en el error)
    let hasBlockingIssues = false;
    const issues = [];
    
    // Check 1: Transacciones sin procesar
    const unprocessedResult = await pool.query(
      'SELECT COUNT(*) as count FROM sales WHERE tld_id = $1 AND processed = false',
      [businessDay.id]
    );
    if (parseInt(unprocessedResult.rows[0].count) > 0) {
      hasBlockingIssues = true;
      issues.push('unprocessed_transactions');
    }
    
    // Check 2: Turnos abiertos
    const openShiftsResult = await pool.query(
      'SELECT COUNT(*) as count FROM shifts WHERE tld_id = $1 AND status = $2',
      [businessDay.id, 'active']
    );
    if (parseInt(openShiftsResult.rows[0].count) > 0) {
      hasBlockingIssues = true;
      issues.push('open_shifts');
    }
    
    // Check 3: Diferencias de caja excesivas
    const cashDifferenceResult = await pool.query(`
      SELECT COUNT(CASE WHEN ABS(sc.cash_difference) > 25.00 THEN 1 END) as excessive_differences
      FROM shift_close sc
      JOIN shifts s ON s.id = sc.shift_id
      WHERE s.tld_id = $1
    `, [businessDay.id]);
    if (parseInt(cashDifferenceResult.rows[0].excessive_differences) > 0) {
      hasBlockingIssues = true;
      issues.push('cash_differences');
    }
    
    // Check 4: POS habilitadas sin turnos
    const posWithoutShiftsResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM tld_list_pos tlp 
      LEFT JOIN shifts s ON s.pos_id = tlp.id 
      WHERE tlp.tld_id = $1 AND tlp.is_enabled = true AND s.id IS NULL
    `, [businessDay.id]);
    if (parseInt(posWithoutShiftsResult.rows[0].count) > 0) {
      hasBlockingIssues = true;
      issues.push('pos_without_shifts');
    }
    
    // Si hay problemas y no es forzado
    if (hasBlockingIssues && !forceClosure) {
      const responseTime = Date.now() - startTime;
      
      console.log(`[CLOSE-DAY] Closure blocked due to issues:`, issues);
      
      // ERROR GENÉRICO - Como lo haría un sistema real
      return res.status(422).json({
        error: 'Cannot close business day',
        message: 'Day closure failed due to pending operations. Please review system status and try again.',
        errorCode: 'CLOSURE_BLOCKED',
        canRetry: true,
        timestamp: new Date().toISOString(),
        processingTime: responseTime,
        
        // Información MUY limitada (como sistema real)
        hint: 'Check pending transactions, open shifts, and cash balances',
        supportContact: 'Contact system administrator for detailed analysis'
      });
    }
    
    // Si no hay problemas O es forzado, cerrar exitosamente
    await pool.query(
      'UPDATE tld SET status = $1, closed_at = $2 WHERE id = $3',
      ['closed', new Date(), businessDay.id]
    );
    
    const responseTime = Date.now() - startTime;
    
    console.log(`[CLOSE-DAY] Business day closed successfully in ${responseTime}ms`);
    
    res.json({
      success: true,
      message: 'Business day closed successfully',
      businessDate: actualDate,
      closedAt: new Date().toISOString(),
      forced: forceClosure,
      processingTime: responseTime,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[CLOSE-DAY] Error:', error);
    res.status(500).json({
      error: 'Internal system error',
      message: 'An unexpected error occurred while closing the business day. Please contact support.',
      errorCode: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      supportContact: 'support@restaurant-system.com'
    });
  }
});

// 8. GET BUSINESS DAY STATUS - Para que el gerente vea el estado actual
app.get('/api/business-day/:date', async (req, res) => {
  const { date } = req.params;
  
  try {
    const actualDate = date === 'today' ? new Date().toISOString().split('T')[0] : date;
    
    const tldResult = await pool.query(
      'SELECT * FROM tld WHERE business_date = $1',
      [actualDate]
    );
    
    if (tldResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Business day not found',
        date: actualDate
      });
    }
    
    const businessDay = tldResult.rows[0];
    
    res.json({
      localId: process.env.LOCAL_ID || 'RESTO_001',
      businessDate: businessDay.business_date,
      status: businessDay.status,
      createdAt: businessDay.created_at,
      closedAt: businessDay.closed_at,
      canAttemptClosure: businessDay.status === 'open',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[BUSINESS-DAY] Error:', error);
    res.status(500).json({
      error: 'Database error',
      message: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    localId: process.env.LOCAL_ID || 'RESTO_001',
    database: 'connected'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🍽️  Restaurant Monolith PoC running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 API Base URL: http://localhost:${PORT}/api`);
});

module.exports = app;
