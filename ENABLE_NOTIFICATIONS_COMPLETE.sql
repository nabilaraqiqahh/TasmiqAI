-- ================================================================
-- TASMIQAI — ENABLE NOTIFICATIONS COMPLETE
-- Run once in: Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new
--
-- This script is fully idempotent (safe to run multiple times).
-- It covers:
--   1. Ensure notifications table exists with ALL required columns
--   2. Add missing columns to notifications (type, teacher_id,
--      recitation_id, meta, is_read index)
--   3. Ensure recitations table has teacher evaluation columns
--   4. Enable Supabase Realtime publication on notifications
--   5. Open RLS policies
--   6. Performance indexes
--   7. Verification queries
-- ================================================================

-- ── 1. CREATE notifications table if not already there ───────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  body           TEXT,
  type           TEXT        NOT NULL DEFAULT 'info',
  is_read        BOOLEAN     NOT NULL DEFAULT FALSE,
  teacher_id     UUID        REFERENCES public.users(id)       ON DELETE SET NULL,
  recitation_id  UUID        REFERENCES public.recitations(id) ON DELETE SET NULL,
  meta           JSONB       DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. ADD any missing columns (safe on existing table) ──────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type          TEXT        NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS is_read       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS teacher_id    UUID        REFERENCES public.users(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recitation_id UUID        REFERENCES public.recitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta          JSONB       DEFAULT '{}'::jsonb;

-- ── 3. ADD teacher evaluation columns to recitations ─────────────
ALTER TABLE public.recitations
  ADD COLUMN IF NOT EXISTS teacher_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_status  TEXT CHECK (teacher_status IN ('PASS','REPEAT') OR teacher_status IS NULL),
  ADD COLUMN IF NOT EXISTS teacher_feedback TEXT;

-- ── 4. ADD recording_mode and attempt_number to recitations ──────
--    (some devices may still fail without these — safe fallback)
ALTER TABLE public.recitations
  ADD COLUMN IF NOT EXISTS recording_mode  TEXT DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS attempt_number  INT;

-- ── 5. ENABLE Supabase Realtime on notifications ─────────────────
--    This allows subscribeToNotifications() to fire immediately
--    when a teacher inserts a row — no polling needed.
DO $$
BEGIN
  -- Add notifications to the supabase_realtime publication
  -- The publication is always named 'supabase_realtime' in managed Supabase projects.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    RAISE NOTICE 'notifications added to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'notifications already in supabase_realtime publication — skipped';
  END IF;
END $$;

-- ── 6. ROW-LEVEL SECURITY (open policy — matches project pattern) ─
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'notifications' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all" ON public.notifications
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── 7. PERFORMANCE INDEXES ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notif_user        ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_is_read     ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_type        ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notif_teacher     ON public.notifications(teacher_id);
CREATE INDEX IF NOT EXISTS idx_notif_recitation  ON public.notifications(recitation_id);
CREATE INDEX IF NOT EXISTS idx_notif_created     ON public.notifications(created_at DESC);

-- ── 8. VERIFY: show final notifications schema ───────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ── 9. VERIFY: confirm Realtime is enabled ───────────────────────
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'notifications';

-- ── 10. VERIFY: check RLS policies ───────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'notifications';
