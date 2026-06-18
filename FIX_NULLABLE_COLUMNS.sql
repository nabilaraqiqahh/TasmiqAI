-- Fix duration_seconds and device_info constraints
-- Run in: https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new

-- Step 1: Drop the check constraint on duration_seconds
ALTER TABLE public.recitations 
  DROP CONSTRAINT IF EXISTS recitations_duration_seconds_check;

-- Step 2: Make it nullable with default 0
ALTER TABLE public.recitations 
  ALTER COLUMN duration_seconds SET DEFAULT 0;

ALTER TABLE public.recitations 
  ALTER COLUMN duration_seconds DROP NOT NULL;

-- Step 3: Drop device_info NOT NULL too
ALTER TABLE public.recitations 
  ALTER COLUMN device_info DROP NOT NULL;

-- Step 4: Verify
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'recitations' AND table_schema = 'public'
AND column_name IN ('duration_seconds', 'device_info')
ORDER BY ordinal_position;
