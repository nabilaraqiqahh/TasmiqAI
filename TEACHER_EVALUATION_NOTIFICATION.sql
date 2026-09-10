-- ================================================================
-- TEACHER EVALUATION → STUDENT NOTIFICATION SCHEMA UPGRADE
-- Run in: https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new
-- ================================================================

-- ── 1. Extend notifications table with teacher eval fields ───────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type          TEXT    DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS teacher_id    UUID    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recitation_id UUID    REFERENCES public.recitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta          JSONB   DEFAULT '{}'::jsonb;

-- ── 2. Extend recitations table with explicit teacher_id ─────────
-- (reviewed_at already exists; we add teacher_id as the evaluator FK)
ALTER TABLE public.recitations
  ADD COLUMN IF NOT EXISTS teacher_id    UUID    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_status TEXT
    CHECK (teacher_status IN ('PASS', 'REPEAT', NULL)),
  ADD COLUMN IF NOT EXISTS teacher_feedback TEXT;

-- ── 3. Indexes for new FK columns ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notif_teacher    ON public.notifications(teacher_id);
CREATE INDEX IF NOT EXISTS idx_notif_recitation ON public.notifications(recitation_id);
CREATE INDEX IF NOT EXISTS idx_notif_type       ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_rec_teacher      ON public.recitations(teacher_id);

-- ── 4. Ensure RLS policies are open (match existing pattern) ─────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE tablename='notifications' AND schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.notifications
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 5. Verify ────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'notifications' AND table_schema = 'public'
ORDER BY ordinal_position;
