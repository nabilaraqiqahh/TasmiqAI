-- ================================================================
-- NEW FEATURES SCHEMA — Run in Supabase SQL Editor
-- ================================================================

-- ── 1. NUDGES TABLE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nudges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_id    UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  type        TEXT DEFAULT 'murajaah' CHECK (type IN ('murajaah','tasmiq','general')),
  message     TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nudges_receiver ON public.nudges(receiver_id);
CREATE INDEX IF NOT EXISTS idx_nudges_sender   ON public.nudges(sender_id);

-- ── 2. TEACHER SETTINGS TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id                  UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Notification settings
  notify_enrollment           BOOLEAN DEFAULT TRUE,
  notify_recitation           BOOLEAN DEFAULT TRUE,
  notify_weekly_report        BOOLEAN DEFAULT TRUE,
  notify_student_inactive     BOOLEAN DEFAULT TRUE,
  -- Assessment settings
  min_passing_score           INT DEFAULT 70,
  warning_threshold           INT DEFAULT 60,
  ai_confidence_threshold     INT DEFAULT 75,
  require_teacher_review      BOOLEAN DEFAULT TRUE,
  -- Report settings
  default_report_period       TEXT DEFAULT 'monthly' CHECK (default_report_period IN ('weekly','monthly','quarterly')),
  default_pdf_format          TEXT DEFAULT 'portrait' CHECK (default_pdf_format IN ('portrait','landscape')),
  -- Class settings
  enrollment_enabled          BOOLEAN DEFAULT TRUE,
  qr_enrollment_enabled       BOOLEAN DEFAULT TRUE,
  created_at                  TIMESTAMP DEFAULT NOW(),
  updated_at                  TIMESTAMP DEFAULT NOW()
);

-- ── 3. ADD display_name COLUMN TO classes (for teacher name) ─────
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS teacher_display_name TEXT;

-- ── 4. OPEN RLS POLICIES FOR NEW TABLES ─────────────────────────
ALTER TABLE public.nudges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all" ON public.nudges
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_all" ON public.teacher_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 5. VERIFY ────────────────────────────────────────────────────
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
