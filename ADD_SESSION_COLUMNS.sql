-- ================================================================
-- ADD IS_EXERCISE, STATUS, AND SESSION_ID TO RECITATIONS
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new
-- ================================================================

-- Step 1: Add columns to recitations
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS is_exercise BOOLEAN DEFAULT FALSE;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Step 2: Ensure index for performance
CREATE INDEX IF NOT EXISTS idx_rec_session_id ON public.recitations(session_id);
CREATE INDEX IF NOT EXISTS idx_rec_is_exercise ON public.recitations(is_exercise);
CREATE INDEX IF NOT EXISTS idx_rec_status ON public.recitations(status);

-- Step 3: Verify the table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'recitations';
