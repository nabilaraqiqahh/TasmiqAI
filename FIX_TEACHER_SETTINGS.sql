-- TasmiqAI — Teacher Settings Schema Extension
-- Run this in: https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new
-- Adds missing preference columns to teacher_settings

ALTER TABLE public.teacher_settings ADD COLUMN IF NOT EXISTS notify_announcement BOOLEAN DEFAULT TRUE;
ALTER TABLE public.teacher_settings ADD COLUMN IF NOT EXISTS notify_messages     BOOLEAN DEFAULT FALSE;
ALTER TABLE public.teacher_settings ADD COLUMN IF NOT EXISTS notify_system       BOOLEAN DEFAULT TRUE;
ALTER TABLE public.teacher_settings ADD COLUMN IF NOT EXISTS language            TEXT    DEFAULT 'en';
ALTER TABLE public.teacher_settings ADD COLUMN IF NOT EXISTS theme               TEXT    DEFAULT 'light';

-- Remove test row if it was inserted during development
DELETE FROM public.teacher_settings WHERE id = 'b722d32a-01a8-4bcf-b0d1-4c1464125256';

-- Verify columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'teacher_settings'
ORDER BY ordinal_position;
