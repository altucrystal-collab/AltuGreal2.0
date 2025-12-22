-- PerexPastil Database Schema Update v4 - System Redesign
-- Run this SQL in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/uwhinxqsgwwvwnvdxqvp/sql
-- 
-- IMPORTANT: Run this AFTER all previous schema updates

-- ============================================
-- 1. ADD customer_payment TO SALES TABLE
-- ============================================
-- Stores how much the customer paid (for change calculation)

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS customer_payment DECIMAL(10, 2);

-- ============================================
-- 2. RENAME store_sale_datetime TO earnings_datetime
-- ============================================
-- More descriptive name for the editable earnings tracking date

-- First check if old column exists and new doesn't
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'store_sale_datetime'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'earnings_datetime'
  ) THEN
    ALTER TABLE sales RENAME COLUMN store_sale_datetime TO earnings_datetime;
  END IF;
END $$;

-- If earnings_datetime doesn't exist, create it
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS earnings_datetime TIMESTAMP WITH TIME ZONE;

-- Set default for existing records
UPDATE sales 
SET earnings_datetime = created_at 
WHERE earnings_datetime IS NULL;

-- Set default for new records
ALTER TABLE sales 
ALTER COLUMN earnings_datetime SET DEFAULT NOW();

-- Update trigger for earnings_datetime
CREATE OR REPLACE FUNCTION set_earnings_datetime()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.earnings_datetime IS NULL THEN
    NEW.earnings_datetime = NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_earnings_datetime_trigger ON sales;
CREATE TRIGGER set_earnings_datetime_trigger
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION set_earnings_datetime();

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS set_store_sale_datetime_trigger ON sales;

-- ============================================
-- 3. MAKE dine_in_takeout REQUIRED
-- ============================================
-- Update constraint to not allow NULL (always required)

-- First set any NULL values to 'takeout' as default
UPDATE sales 
SET dine_in_takeout = 'takeout' 
WHERE dine_in_takeout IS NULL;

-- ============================================
-- 4. REMOVE DINE IN/TAKEOUT SETTING
-- ============================================
-- This setting is no longer needed as it's always required

DELETE FROM settings WHERE key = 'dine_in_takeout_enabled';

-- ============================================
-- 5. CREATE INDEX FOR BETTER PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_sales_earnings_datetime ON sales(earnings_datetime);
DROP INDEX IF EXISTS idx_sales_store_sale_datetime;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

SELECT 'Schema update v4 completed!' as status;

-- Check sales table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'sales'
ORDER BY ordinal_position;

