-- Migration: Add inventory_used column to daily_reports
-- Run this once against the database

ALTER TABLE daily_reports 
ADD COLUMN IF NOT EXISTS inventory_used JSONB DEFAULT '{}';

-- Example stored value:
-- {"ribbons": 2, "film": 1, "blank_cards": 500, "filter": 0, "cleaner": 1}
