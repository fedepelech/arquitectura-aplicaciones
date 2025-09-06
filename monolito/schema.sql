-- schema.sql (versión corregida)
CREATE DATABASE restaurant_poc;

\c restaurant_poc;

-- Tabla: Días de negocio del local
CREATE TABLE tld (
    id SERIAL PRIMARY KEY,
    business_date DATE NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    total_expected_sales DECIMAL(10,2) DEFAULT 0.00,
    total_actual_sales DECIMAL(10,2) DEFAULT 0.00,
    cash_difference DECIMAL(10,2) DEFAULT 0.00,
    max_allowed_difference DECIMAL(10,2) DEFAULT 50.00,
    notes TEXT
);

-- Tabla: Inventario simplificado
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    unit_cost DECIMAL(8,2) NOT NULL,
    last_counted_at TIMESTAMP NULL,
    requires_daily_count BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active'
);

-- Tabla: POS habilitadas por día
CREATE TABLE tld_list_pos (
    id SERIAL PRIMARY KEY,
    tld_id INTEGER REFERENCES tld(id) ON DELETE CASCADE,
    pos_number INTEGER NOT NULL,
    pos_name VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    enabled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    disabled_at TIMESTAMP NULL,
    reason_disabled TEXT NULL
);

-- Tabla: Turnos por POS
CREATE TABLE shifts (
    id SERIAL PRIMARY KEY,
    tld_id INTEGER REFERENCES tld(id) ON DELETE CASCADE,
    pos_id INTEGER REFERENCES tld_list_pos(id) ON DELETE CASCADE,
    shift_number INTEGER NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    employee_id VARCHAR(20),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NULL,
    status VARCHAR(20) DEFAULT 'active',
    opening_cash DECIMAL(10,2) DEFAULT 0.00,
    expected_cash DECIMAL(10,2) DEFAULT 0.00,
    notes TEXT
);

-- Tabla: Cierre de turno (CORREGIDA)
CREATE TABLE shift_close (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE,
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closing_cash DECIMAL(10,2) NOT NULL,
    cash_difference DECIMAL(10,2) DEFAULT 0.00,  -- ← SIN GENERATED
    transaction_count INTEGER DEFAULT 0,
    total_sales DECIMAL(10,2) DEFAULT 0.00,
    cash_tips DECIMAL(10,2) DEFAULT 0.00,
    card_sales DECIMAL(10,2) DEFAULT 0.00,
    discounts_applied DECIMAL(10,2) DEFAULT 0.00,
    voided_transactions INTEGER DEFAULT 0,
    is_balanced BOOLEAN DEFAULT false,  -- ← SIN GENERATED
    notes TEXT,
    closed_by VARCHAR(100)
);

-- Tabla: Ventas
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    tld_id INTEGER REFERENCES tld(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE,
    pos_id INTEGER REFERENCES tld_list_pos(id) ON DELETE CASCADE,
    transaction_id VARCHAR(50) NOT NULL,
    sale_time TIMESTAMP NOT NULL,
    customer_count INTEGER DEFAULT 1,
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    cash_received DECIMAL(10,2) DEFAULT 0.00,
    card_amount DECIMAL(10,2) DEFAULT 0.00,
    change_given DECIMAL(10,2) DEFAULT 0.00,
    discount_applied DECIMAL(10,2) DEFAULT 0.00,
    is_voided BOOLEAN DEFAULT false,
    voided_reason TEXT NULL,
    processed BOOLEAN DEFAULT true,
    employee_id VARCHAR(20)
);

-- Índices para performance
CREATE INDEX idx_tld_business_date ON tld(business_date);
CREATE INDEX idx_sales_tld_id ON sales(tld_id);
CREATE INDEX idx_sales_shift_id ON sales(shift_id);
CREATE INDEX idx_shifts_tld_pos ON shifts(tld_id, pos_id);
CREATE INDEX idx_inventory_category ON inventory(category);
