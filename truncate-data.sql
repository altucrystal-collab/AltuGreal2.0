-- PerexPastil - Truncate All Data
-- Run this SQL in your Supabase SQL Editor to clear all stored data
-- https://supabase.com/dashboard/project/uwhinxqsgwwvwnvdxqvp/sql
-- 
-- ⚠️ WARNING: This will DELETE ALL DATA from the following tables:
-- - sales
-- - finished_products
-- - product_ingredients
-- - products (inventory)
-- - payment_methods
-- - customer_types
-- - settings
--
-- This action CANNOT be undone!

-- ============================================
-- TRUNCATE ALL TABLES
-- ============================================

-- First, delete from tables with foreign key dependencies
TRUNCATE TABLE product_ingredients CASCADE;
TRUNCATE TABLE sales CASCADE;

-- Then delete from main tables
TRUNCATE TABLE finished_products CASCADE;
TRUNCATE TABLE products CASCADE;

-- Delete from reference tables
TRUNCATE TABLE payment_methods CASCADE;
TRUNCATE TABLE customer_types CASCADE;

-- Delete settings
TRUNCATE TABLE settings CASCADE;

-- ============================================
-- RE-INSERT DEFAULT DATA (optional)
-- ============================================
-- Uncomment the section below if you want to restore default data after truncating

-- Insert default payment methods
INSERT INTO payment_methods (name, color) VALUES
  ('Cash', '#22c55e'),
  ('Card', '#3b82f6'),
  ('GCash', '#0ea5e9')
ON CONFLICT (name) DO NOTHING;

-- Insert default customer types
INSERT INTO customer_types (name, color) VALUES
  ('Regular', '#6366f1'),
  ('Student', '#f59e0b'),
  ('Senior', '#ec4899')
ON CONFLICT (name) DO NOTHING;

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('dine_in_takeout_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Data truncation completed!' as status;

-- Show counts for all tables (should all be 0 or default values)
SELECT 'sales' as table_name, COUNT(*) as row_count FROM sales
UNION ALL
SELECT 'finished_products', COUNT(*) FROM finished_products
UNION ALL
SELECT 'product_ingredients', COUNT(*) FROM product_ingredients
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'payment_methods', COUNT(*) FROM payment_methods
UNION ALL
SELECT 'customer_types', COUNT(*) FROM customer_types
UNION ALL
SELECT 'settings', COUNT(*) FROM settings;

