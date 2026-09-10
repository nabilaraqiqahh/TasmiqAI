-- =====================================================================
-- ADD_MISSING_RECITATION_COLUMNS.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Safe to run multiple times — uses IF NOT EXISTS
-- =====================================================================

-- ── TEACHER EVALUATION COLUMNS ────────────────────────────────────────
ALTER TABLE public.recitations
  ADD COLUMN IF NOT EXISTS teacher_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_status TEXT,            -- 'PASS' | 'REPEAT'
  ADD COLUMN IF NOT EXISTS status         TEXT        DEFAULT 'pending';
  -- Note: 'status' values used: 'pending', 'approved', 'repeat'

-- ── MOBILE APP COLUMNS ────────────────────────────────────────────────
ALTER TABLE public.recitations
  ADD COLUMN IF NOT EXISTS is_exercise      BOOLEAN   DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS recording_mode   TEXT      DEFAULT 'beginner',  -- 'beginner' | 'advanced'
  ADD COLUMN IF NOT EXISTS session_id       UUID,
  ADD COLUMN IF NOT EXISTS attempt_number   INT       DEFAULT 1,
  ADD COLUMN IF NOT EXISTS word_alignments  JSONB,
  ADD COLUMN IF NOT EXISTS duration         INT       DEFAULT 0;           -- seconds

-- ── INDEXES for common queries ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rec_status      ON public.recitations(status);
CREATE INDEX IF NOT EXISTS idx_rec_is_exercise ON public.recitations(is_exercise);
CREATE INDEX IF NOT EXISTS idx_rec_teacher_id  ON public.recitations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_rec_session_id  ON public.recitations(session_id);

-- ── Refresh PostgREST schema cache ─────────────────────────────────────
-- This is the KEY step — forces Supabase to reload the column list
NOTIFY pgrst, 'reload schema';

-- ── Verify ─────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'recitations'
ORDER BY ordinal_position;
