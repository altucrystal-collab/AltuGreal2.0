-- ============================================
-- ALTU GREAL v2.0 - Complete Database Schema
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- This is the ONLY schema file you need for new instances
--
-- BEFORE RUNNING:
-- 1. Create a new Supabase project
-- 2. Go to Settings > API and copy your URL and anon key
-- 3. Update your .env.local file with these values
-- 4. Create a storage bucket called "product-images" (public)
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================

-- Products table (Inventory Items)
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('weight', 'quantity', 'volume')),
  qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Finished Products table (Products made from inventory items)
CREATE TABLE IF NOT EXISTS finished_products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  opex_cost DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product Ingredients table (Junction table linking products to inventory items)
CREATE TABLE IF NOT EXISTS product_ingredients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES finished_products(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  transaction_id UUID,
  transaction_number TEXT,
  product_id UUID,
  product_name TEXT NOT NULL,
  qty DECIMAL(10, 2) NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('weight', 'quantity', 'volume')),
  cost DECIMAL(10, 2) NOT NULL,
  selling_price DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  customer_type TEXT NOT NULL,
  dine_in_takeout TEXT CHECK (dine_in_takeout IN ('dine_in', 'takeout')),
  customer_payment DECIMAL(10, 2),
  opex_cost DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  earnings_datetime TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Payment methods table
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer types table
CREATE TABLE IF NOT EXISTS customer_types (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#B3855D',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OPEX (Operating Expenses) table
CREATE TABLE IF NOT EXISTS opex (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OPEX Settings table (for legacy support, may not be used)
CREATE TABLE IF NOT EXISTS opex_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  target_monthly_sales INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to set earnings_datetime on insert
CREATE OR REPLACE FUNCTION set_earnings_datetime()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.earnings_datetime IS NULL THEN
    NEW.earnings_datetime = NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to restore inventory (used when cancelling sales)
CREATE OR REPLACE FUNCTION restore_inventory(p_product_id UUID, p_qty DECIMAL)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET qty = qty + p_qty
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finished_products_updated_at ON finished_products;
CREATE TRIGGER update_finished_products_updated_at
  BEFORE UPDATE ON finished_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_opex_updated_at ON opex;
CREATE TRIGGER update_opex_updated_at
  BEFORE UPDATE ON opex
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_opex_settings_updated_at ON opex_settings;
CREATE TRIGGER update_opex_settings_updated_at
  BEFORE UPDATE ON opex_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_earnings_datetime_trigger ON sales;
CREATE TRIGGER set_earnings_datetime_trigger
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION set_earnings_datetime();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE finished_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE opex ENABLE ROW LEVEL SECURITY;
ALTER TABLE opex_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
-- Note: In production, implement proper authentication

DROP POLICY IF EXISTS "Allow all operations on products" ON products;
CREATE POLICY "Allow all operations on products" ON products
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on finished_products" ON finished_products;
CREATE POLICY "Allow all operations on finished_products" ON finished_products
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on product_ingredients" ON product_ingredients;
CREATE POLICY "Allow all operations on product_ingredients" ON product_ingredients
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on sales" ON sales;
CREATE POLICY "Allow all operations on sales" ON sales
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on payment_methods" ON payment_methods;
CREATE POLICY "Allow all operations on payment_methods" ON payment_methods
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on customer_types" ON customer_types;
CREATE POLICY "Allow all operations on customer_types" ON customer_types
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on settings" ON settings;
CREATE POLICY "Allow all operations on settings" ON settings
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on opex" ON opex;
CREATE POLICY "Allow all operations on opex" ON opex
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on opex_settings" ON opex_settings;
CREATE POLICY "Allow all operations on opex_settings" ON opex_settings
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cancelled ON sales(cancelled);
CREATE INDEX IF NOT EXISTS idx_sales_transaction_id ON sales(transaction_id);
CREATE INDEX IF NOT EXISTS idx_sales_transaction_number ON sales(transaction_number);
CREATE INDEX IF NOT EXISTS idx_sales_earnings_datetime ON sales(earnings_datetime);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_product_ingredients_product_id ON product_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_product_ingredients_item_id ON product_ingredients(item_id);

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default payment methods
INSERT INTO payment_methods (name, color) VALUES
  ('Cash', '#22c55e'),
  ('Card', '#3b82f6'),
  ('GCash', '#0ea5e9')
ON CONFLICT (name) DO NOTHING;

-- Insert default customer types
INSERT INTO customer_types (name, color) VALUES
  ('Regular', '#B3855D'),
  ('Student', '#f59e0b'),
  ('Senior', '#ec4899')
ON CONFLICT (name) DO NOTHING;

-- Insert default OPEX settings
INSERT INTO opex_settings (target_monthly_sales) 
SELECT 100 WHERE NOT EXISTS (SELECT 1 FROM opex_settings);

-- ============================================
-- STORAGE BUCKET SETUP (Manual Step)
-- ============================================
-- 
-- You need to manually create a storage bucket in Supabase:
-- 1. Go to Storage in your Supabase dashboard
-- 2. Create a new bucket called "product-images"
-- 3. Set it as PUBLIC
-- 4. Add policy for public read access:
--    - Policy name: "Public read access"
--    - Allowed operation: SELECT
--    - Policy definition: true
-- 5. Add policy for authenticated upload:
--    - Policy name: "Allow uploads"
--    - Allowed operation: INSERT
--    - Policy definition: true
-- 6. Add policy for authenticated delete:
--    - Policy name: "Allow deletes"
--    - Allowed operation: DELETE
--    - Policy definition: true
--
-- ============================================

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 'Altu Greal v2.0 schema installed successfully!' as status;

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

