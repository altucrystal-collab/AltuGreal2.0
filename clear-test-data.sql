-- PerexPastil: Clear Test Data
-- Run this in Supabase SQL Editor to remove all test data
-- https://supabase.com/dashboard/project/uwhinxqsgwwvwnvdxqvp/sql

-- Clear sales data
TRUNCATE TABLE sales CASCADE;

-- Clear products data (this will also delete product images references)
TRUNCATE TABLE products CASCADE;

-- Optional: Reset payment methods and customer types to defaults
-- Uncomment if you want to reset these too:

-- DELETE FROM payment_methods;
-- INSERT INTO payment_methods (name, color) VALUES
--   ('Cash', '#22c55e'),
--   ('Card', '#3b82f6'),
--   ('GCash', '#0ea5e9');

-- DELETE FROM customer_types;
-- INSERT INTO customer_types (name, color) VALUES
--   ('Regular', '#6366f1'),
--   ('Student', '#f59e0b'),
--   ('Senior', '#ec4899');

-- Confirm deletion
SELECT 'Data cleared successfully!' as status;
SELECT 'Products remaining: ' || COUNT(*) as products FROM products;
SELECT 'Sales remaining: ' || COUNT(*) as sales FROM sales;


