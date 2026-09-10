-- ================================================================
-- TASMIQAI DATABASE SCHEMA FIX
-- Run this script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new
-- ================================================================

-- 1. Add attempt_number column (INTEGER)
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;

-- 2. Add recording_mode column (TEXT: 'beginner' or 'advanced')
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS recording_mode TEXT DEFAULT 'beginner';

-- 3. Add indexes for query performance
CREATE INDEX IF NOT EXISTS idx_rec_attempt_number ON public.recitations(attempt_number);
CREATE INDEX IF NOT EXISTS idx_rec_recording_mode ON public.recitations(recording_mode);

-- 4. Verify columns in recitations table
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'recitations'
  AND column_name IN ('attempt_number', 'recording_mode');
