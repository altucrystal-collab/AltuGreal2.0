-- PerexPastil Database Schema Update v3 - Multi-Product Sales Support
-- Run this SQL in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/uwhinxqsgwwvwnvdxqvp/sql
-- 
-- IMPORTANT: Run this AFTER the initial schema (supabase-schema.sql) and v2 update (schema-update-v2.sql)

-- ============================================
-- ADD transaction_id TO SALES TABLE
-- ============================================
-- This column groups multiple products sold in a single transaction/purchase

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS transaction_id UUID;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_transaction_id ON sales(transaction_id);

-- For existing sales without transaction_id, generate unique transaction_id for each sale
-- This ensures backward compatibility
UPDATE sales 
SET transaction_id = id 
WHERE transaction_id IS NULL;

-- Set default to generate new UUID for new transactions
-- Note: We'll generate transaction_id in the application code for multi-product sales

