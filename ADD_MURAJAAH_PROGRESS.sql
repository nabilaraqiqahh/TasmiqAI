-- Add ayah_progress column to murajaah_sessions for progress persistence
ALTER TABLE public.murajaah_sessions ADD COLUMN IF NOT EXISTS ayah_reps JSONB DEFAULT '{}';
ALTER TABLE public.murajaah_sessions ADD COLUMN IF NOT EXISTS total_reps INT DEFAULT 0;
ALTER TABLE public.murajaah_sessions ADD COLUMN IF NOT EXISTS class_id_ref UUID REFERENCES public.classes(id) ON DELETE SET NULL;

-- Open policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='murajaah_sessions' AND policyname='open_all') THEN
    CREATE POLICY "open_all" ON public.murajaah_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='murajaah_sessions' AND table_schema='public' ORDER BY ordinal_position;
