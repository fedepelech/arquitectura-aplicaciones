// scripts/seed-data.js (versión corregida)
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_poc',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

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
      { name: 'Hamburguesa Clásica', category: 'comida', stock: 0, min: 5, cost: 8.00 }, // Sin stock
      { name: 'Papas Fritas', category: 'comida', stock: 25, min: 10, cost: 3.50 },
      { name: 'Servilletas', category: 'insumos', stock: 100, min: 50, cost: 0.10 },
      { name: 'Cerveza Quilmes', category: 'bebidas', stock: 15, min: 30, cost: 4.00 } // Bajo stock
    ];
    
    for (const item of inventoryItems) {
      await client.query(`
        INSERT INTO inventory (item_name, category, current_stock, min_stock, unit_cost, requires_daily_count)
        VALUES ($1, $2, $3, $4, $5, true)
      `, [item.name, item.category, item.stock, item.min, item.cost]);
    }
    
    // 3. Crear POS (algunas con problemas)
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
    
    // 4. Crear turnos (algunos con problemas)
    const shiftsData = [
      { pos: 1, shift: 1, employee: 'Juan Pérez', emp_id: 'EMP001', opening_cash: 100.00 },
      { pos: 1, shift: 2, employee: 'María García', emp_id: 'EMP002', opening_cash: 150.00 },
      { pos: 2, shift: 1, employee: 'Carlos López', emp_id: 'EMP003', opening_cash: 75.00 },
      // POS 4 no tiene turnos (problema)
    ];
    
    const shiftIds = {};
    for (const shift of shiftsData) {
      if (posIds[shift.pos]) {
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
          new Date(Date.now() - Math.random() * 8 * 60 * 60 * 1000), // Hace 0-8 horas
          shift.opening_cash,
          shift.opening_cash // expected_cash inicial igual al opening_cash
        ]);
        
        shiftIds[`${shift.pos}-${shift.shift}`] = result.rows[0].id;
      }
    }
    
    // 5. Crear ventas (algunas con problemas)
    let transactionCounter = 1;
    
    for (const [key, shiftId] of Object.entries(shiftIds)) {
      const [posNum, shiftNum] = key.split('-');
      const posId = posIds[parseInt(posNum)];
      
      // Ventas normales
      for (let i = 0; i < 15; i++) {
        const amount = 25.00 + Math.random() * 75.00;
        const paymentMethod = Math.random() > 0.7 ? 'card' : 'cash';
        const isVoided = Math.random() < 0.05; // 5% ventas anuladas
        const processed = Math.random() > 0.1; // 10% sin procesar (problema)
        
        await client.query(`
          INSERT INTO sales (
            tld_id, shift_id, pos_id, transaction_id, sale_time,
            customer_count, subtotal, tax_amount, total_amount,
            payment_method, cash_received, card_amount, is_voided, processed, employee_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          tldId, shiftId, posId, `TXN-${String(transactionCounter).padStart(6, '0')}`,
          new Date(Date.now() - Math.random() * 6 * 60 * 60 * 1000), // Últimas 6 horas
          Math.ceil(Math.random() * 4), // 1-4 personas
          amount, // subtotal
          amount * 0.1, // tax_amount
          amount * 1.1, // total_amount
          paymentMethod,
          paymentMethod === 'cash' ? amount * 1.1 : 0,
          paymentMethod === 'card' ? amount * 1.1 : 0,
          isVoided,
          processed,
          `EMP00${posNum}`
        ]);
        
        transactionCounter++;
      }
      
      // PROBLEMA: Ventas con datos faltantes (CORREGIDO)
      if (Math.random() > 0.5) {
        const amount = 45.75;
        await client.query(`
          INSERT INTO sales (
            tld_id, shift_id, pos_id, transaction_id, sale_time,
            customer_count, subtotal, tax_amount, total_amount,
            payment_method, cash_received, card_amount, processed, employee_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          tldId, shiftId, posId, `TXN-${String(transactionCounter).padStart(6, '0')}`,
          new Date(),
          1,           // customer_count
          amount,      // subtotal ← CAMPO CORREGIDO
          amount * 0.1, // tax_amount  
          amount * 1.1, // total_amount
          'cash',      // payment_method
          amount * 1.1, // cash_received
          0,           // card_amount
          true,        // processed
          null         // employee_id (dato faltante simulado)
        ]);
        transactionCounter++;
      }
    }
    
    // 6. Crear cierres de turno con diferencias de caja
    for (const [key, shiftId] of Object.entries(shiftIds)) {
      if (Math.random() > 0.3) { // 70% de turnos ya cerrados
        const shift = await client.query('SELECT * FROM shifts WHERE id = $1', [shiftId]);
        const shiftData = shift.rows[0];
        
        const salesTotal = await client.query(
          'SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE shift_id = $1 AND is_voided = false',
          [shiftId]
        );
        
        const expectedCash = shiftData.opening_cash + (parseFloat(salesTotal.rows[0].total) || 0);
        
        // Actualizar expected_cash en el turno
        await client.query('UPDATE shifts SET expected_cash = $1 WHERE id = $2', [expectedCash, shiftId]);
        
        // Simular diferencias de caja
        let cashDifference = (Math.random() - 0.5) * 20; // ±$10 normal
        if (Math.random() < 0.2) { // 20% con diferencias grandes
          cashDifference = (Math.random() - 0.5) * 100; // ±$50 problemático
        }
        
        const actualCash = expectedCash + cashDifference;
        
        await client.query('UPDATE shifts SET status = $1, end_time = $2 WHERE id = $3', 
          ['closed', new Date(), shiftId]);
        
        await client.query(`
          INSERT INTO shift_close (shift_id, closing_cash, cash_difference, transaction_count, total_sales, closed_by)
          VALUES ($1, $2, $3, $4, $5, 'SYSTEM')
        `, [shiftId, actualCash, cashDifference, 15, parseFloat(salesTotal.rows[0].total) || 0]);
      }
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Database seeded successfully with problematic data!');
    console.log('🔍 Test the following issues:');
    console.log('   - Unprocessed transactions');
    console.log('   - POS without shifts');  
    console.log('   - Open shifts');
    console.log('   - Excessive cash differences');
    console.log('   - Uncounted inventory');
    console.log('   - Sales with missing data');
    console.log('');
    console.log('🧪 Test endpoints:');
    console.log(`   GET /api/closure-status/today`);
    console.log(`   GET /api/sales/today`);
    console.log(`   GET /api/logs/closure`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seedData();
