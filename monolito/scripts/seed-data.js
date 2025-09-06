// scripts/seed-data.js - Versión completamente depurada
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_poc',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Función helper para garantizar que siempre sea número
function toNumber(value) {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return 0;
}

// Función helper para redondear correctamente
function roundTo2Decimals(value) {
  const num = toNumber(value);
  return Math.round(num * 100) / 100;
}

async function seedData() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Seeding database with test data...');
    
    await client.query('BEGIN');
    
    // Limpiar datos existentes
    await client.query('TRUNCATE TABLE sales, shift_close, shifts, tld_list_pos, inventory, tld RESTART IDENTITY CASCADE');
    
    // 1. Crear día de negocio de hoy
    const today = new Date().toISOString().split('T')[0];
    const tldResult = await client.query(`
      INSERT INTO tld (business_date, status, max_allowed_difference) 
      VALUES ($1, 'open', 50.00) 
      RETURNING id
    `, [today]);
    const tldId = tldResult.rows[0].id;
    
    // 2. Crear inventario básico
    const inventoryItems = [
      { name: 'Coca Cola 500ml', category: 'bebidas', stock: 45, min: 20, cost: 2.50 },
      { name: 'Hamburguesa Clásica', category: 'comida', stock: 0, min: 5, cost: 8.00 },
      { name: 'Papas Fritas', category: 'comida', stock: 25, min: 10, cost: 3.50 },
      { name: 'Servilletas', category: 'insumos', stock: 100, min: 50, cost: 0.10 },
      { name: 'Cerveza Quilmes', category: 'bebidas', stock: 15, min: 30, cost: 4.00 }
    ];
    
    for (const item of inventoryItems) {
      await client.query(`
        INSERT INTO inventory (item_name, category, current_stock, min_stock, unit_cost, requires_daily_count)
        VALUES ($1, $2, $3, $4, $5, true)
      `, [item.name, item.category, item.stock, item.min, item.cost]);
    }
    
    // 3. Crear POS
    const posData = [
      { number: 1, name: 'POS Principal', enabled: true },
      { number: 2, name: 'POS Delivery', enabled: true },
      { number: 3, name: 'POS Terraza', enabled: false, reason: 'Falla en impresora' },
      { number: 4, name: 'POS Barra', enabled: true }
    ];
    
    const posIds = {};
    for (const pos of posData) {
      const result = await client.query(`
        INSERT INTO tld_list_pos (tld_id, pos_number, pos_name, is_enabled, reason_disabled)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [tldId, pos.number, pos.name, pos.enabled, pos.reason || null]);
      
      posIds[pos.number] = result.rows[0].id;
    }
    
    // 4. Crear turnos - NÚMEROS EXPLÍCITOS
    const shiftsData = [
      { pos: 1, shift: 1, employee: 'Juan Pérez', emp_id: 'EMP001', opening_cash: 100.00 },
      { pos: 1, shift: 2, employee: 'María García', emp_id: 'EMP002', opening_cash: 150.00 },
      { pos: 2, shift: 1, employee: 'Carlos López', emp_id: 'EMP003', opening_cash: 75.00 },
    ];
    
    const shiftIds = {};
    for (const shift of shiftsData) {
      if (posIds[shift.pos]) {
        // Garantizar que opening_cash sea número
        const openingCash = roundTo2Decimals(shift.opening_cash);
        
        const result = await client.query(`
          INSERT INTO shifts (tld_id, pos_id, shift_number, employee_name, employee_id, start_time, status, opening_cash, expected_cash)
          VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
          RETURNING id
        `, [
          tldId, 
          posIds[shift.pos], 
          shift.shift, 
          shift.employee, 
          shift.emp_id,
          new Date(Date.now() - Math.random() * 8 * 60 * 60 * 1000),
          openingCash,      // NÚMERO
          openingCash       // NÚMERO
        ]);
        
        shiftIds[`${shift.pos}-${shift.shift}`] = result.rows[0].id;
      }
    }
    
    // 5. Crear ventas - NÚMEROS SEGUROS
    let transactionCounter = 1;
    
    for (const [key, shiftId] of Object.entries(shiftIds)) {
      const [posNum, shiftNum] = key.split('-');
      const posId = posIds[parseInt(posNum)];
      
      // Ventas normales
      for (let i = 0; i < 10; i++) { // Reducido para debug
        const baseAmount = 25.00 + (Math.random() * 75.00);
        const subtotal = roundTo2Decimals(baseAmount);
        const taxAmount = roundTo2Decimals(subtotal * 0.1);
        const totalAmount = roundTo2Decimals(subtotal + taxAmount);
        
        const paymentMethod = Math.random() > 0.7 ? 'card' : 'cash';
        const isVoided = Math.random() < 0.05;
        const processed = Math.random() > 0.1;
        
        const cashReceived = paymentMethod === 'cash' ? totalAmount : 0;
        const cardAmount = paymentMethod === 'card' ? totalAmount : 0;
        
        // DEBUG: Verificar tipos
        console.log(`Creating sale ${transactionCounter}: subtotal=${subtotal} (${typeof subtotal}), total=${totalAmount} (${typeof totalAmount})`);
        
        await client.query(`
          INSERT INTO sales (
            tld_id, shift_id, pos_id, transaction_id, sale_time,
            customer_count, subtotal, tax_amount, total_amount,
            payment_method, cash_received, card_amount, is_voided, processed, employee_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          tldId,                                                    // 1
          shiftId,                                                  // 2
          posId,                                                    // 3
          `TXN-${String(transactionCounter).padStart(6, '0')}`,     // 4
          new Date(Date.now() - Math.random() * 6 * 60 * 60 * 1000), // 5
          Math.ceil(Math.random() * 4),                             // 6
          subtotal,                                                 // 7 - NÚMERO
          taxAmount,                                                // 8 - NÚMERO
          totalAmount,                                              // 9 - NÚMERO
          paymentMethod,                                            // 10
          cashReceived,                                             // 11 - NÚMERO
          cardAmount,                                               // 12 - NÚMERO
          isVoided,                                                 // 13
          processed,                                                // 14
          `EMP00${posNum}`                                          // 15
        ]);
        
        transactionCounter++;
      }
    }
    
    // 6. AQUÍ ESTÁ EL PROBLEMA PROBABLE - Crear cierres de turno
    for (const [key, shiftId] of Object.entries(shiftIds)) {
      if (Math.random() > 0.3) {
        console.log(`Processing shift close for shift ${shiftId}...`);
        
        // Obtener datos del turno
        const shiftResult = await client.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
        const shiftData = shiftResult.rows[0];
        
        // DEBUG: Ver qué tipo de datos tenemos
        console.log(`Shift data - opening_cash: ${shiftData.opening_cash} (${typeof shiftData.opening_cash})`);
        
        // Calcular ventas del turno
        const salesResult = await client.query(
          'SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE shift_id = $1 AND is_voided = false',
          [shiftId]
        );
        
        console.log(`Sales result - total: ${salesResult.rows[0].total} (${typeof salesResult.rows[0].total})`);
        
        // NÚMEROS EXPLÍCITOS Y SEGUROS
        const openingCash = roundTo2Decimals(shiftData.opening_cash);
        const totalSales = roundTo2Decimals(salesResult.rows[0].total);
        const expectedCash = roundTo2Decimals(openingCash + totalSales);
        
        console.log(`Calculated - openingCash: ${openingCash}, totalSales: ${totalSales}, expectedCash: ${expectedCash}`);
        
        // Actualizar expected_cash en el turno
        await client.query('UPDATE shifts SET expected_cash = $1 WHERE id = $2', [expectedCash, shiftId]);
        
        // Diferencia de caja segura
        const cashDifferenceRaw = (Math.random() - 0.5) * (Math.random() < 0.2 ? 100 : 20);
        const cashDifference = roundTo2Decimals(cashDifferenceRaw);
        const actualCash = roundTo2Decimals(expectedCash + cashDifference);
        
        console.log(`Final values - actualCash: ${actualCash} (${typeof actualCash}), cashDifference: ${cashDifference} (${typeof cashDifference})`);
        
        // Cerrar turno
        await client.query('UPDATE shifts SET status = $1, end_time = $2 WHERE id = $3', 
          ['closed', new Date(), shiftId]);
        
        // INSERTAR CON VALORES VERIFICADOS
        await client.query(`
          INSERT INTO shift_close (shift_id, closing_cash, cash_difference, transaction_count, total_sales, closed_by)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          shiftId,        // 1 - número
          actualCash,     // 2 - NÚMERO VERIFICADO
          cashDifference, // 3 - NÚMERO VERIFICADO
          10,             // 4 - número literal
          totalSales,     // 5 - NÚMERO VERIFICADO
          'SYSTEM'        // 6 - string
        ]);
        
        console.log(`✅ Shift ${shiftId} closed successfully`);
      }
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Database seeded successfully with problematic data!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

seedData();
