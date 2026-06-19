-- TasmiqAI — Student Settings Schema Setup
-- Run this in: https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new

CREATE TABLE IF NOT EXISTS public.student_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notify_announcement BOOLEAN DEFAULT TRUE,
  notify_feedback     BOOLEAN DEFAULT TRUE,
  notify_nudge        BOOLEAN DEFAULT TRUE,
  notify_tasmiq       BOOLEAN DEFAULT TRUE,
  notify_murajaah     BOOLEAN DEFAULT TRUE,
  language            TEXT DEFAULT 'en',
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.student_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow open read/write access (matching existing policies)
CREATE POLICY "open_all" ON public.student_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Verify table creation
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'student_settings'
ORDER BY ordinal_position;
