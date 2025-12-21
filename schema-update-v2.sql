-- PerexPastil Database Schema Update v2
-- Run this SQL in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/uwhinxqsgwwvwnvdxqvp/sql
-- 
-- IMPORTANT: Run this AFTER the initial schema (supabase-schema.sql) is set up

-- ============================================
-- 1. ADD store_sale_datetime TO SALES TABLE
-- ============================================
-- This column allows editing sale datetime for earnings tracking
-- while keeping the original system datetime immutable

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS store_sale_datetime TIMESTAMP WITH TIME ZONE;

-- Set existing records to use created_at as default
UPDATE sales 
SET store_sale_datetime = created_at 
WHERE store_sale_datetime IS NULL;

-- Set default for new records
ALTER TABLE sales 
ALTER COLUMN store_sale_datetime SET DEFAULT NOW();

-- Create trigger to auto-set store_sale_datetime on insert
CREATE OR REPLACE FUNCTION set_store_sale_datetime()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.store_sale_datetime IS NULL THEN
    NEW.store_sale_datetime = NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_store_sale_datetime_trigger ON sales;
CREATE TRIGGER set_store_sale_datetime_trigger
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION set_store_sale_datetime();

-- ============================================
-- 2. CREATE FINISHED_PRODUCTS TABLE
-- ============================================
-- Products made from inventory items (ingredients)

CREATE TABLE IF NOT EXISTS finished_products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_finished_products_updated_at ON finished_products;
CREATE TRIGGER update_finished_products_updated_at
  BEFORE UPDATE ON finished_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE finished_products ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on finished_products" ON finished_products
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 3. CREATE PRODUCT_INGREDIENTS TABLE
-- ============================================
-- Junction table linking products to inventory items

CREATE TABLE IF NOT EXISTS product_ingredients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES finished_products(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Allow all operations on product_ingredients" ON product_ingredients
  FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_ingredients_product_id ON product_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_product_ingredients_item_id ON product_ingredients(item_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_sale_datetime ON sales(store_sale_datetime);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the schema update was successful

SELECT 'Schema update completed!' as status;

-- Check sales table has new column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sales' AND column_name = 'store_sale_datetime';

-- Check finished_products table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'finished_products'
) as finished_products_exists;

-- Check product_ingredients table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'product_ingredients'
) as product_ingredients_exists;

