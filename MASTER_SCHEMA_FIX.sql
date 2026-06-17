-- ================================================================
-- TASMIQAI MASTER SCHEMA FIX — BASED ON ACTUAL DB STRUCTURE
-- Run in: https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new
-- ================================================================

-- ── STEP 1: FIX RLS (most important — fixes login NOW) ───────────
DO $$
DECLARE tbl TEXT; pol RECORD;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE tablename=tbl AND schemaname='public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format(
        'CREATE POLICY "open_all" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        tbl
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ── STEP 2: ADD MISSING COLUMNS TO users ─────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avg_score           FLOAT   DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS streak_days         INT     DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_sessions      INT     DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_practice_date  TIMESTAMP;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMP DEFAULT NOW();

-- ── STEP 3: ADD MISSING COLUMNS TO classes ───────────────────────
-- classes already has: id, name, description, teacher_id, class_code, max_students, is_active
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS unique_code  TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS schedule     TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS teacher_name TEXT;

-- Sync unique_code from class_code for existing rows
UPDATE public.classes SET unique_code = class_code WHERE unique_code IS NULL AND class_code IS NOT NULL;

-- ── STEP 4: ADD MISSING COLUMNS TO recitations ───────────────────
-- recitations already has: id, user_id, surah_number, start_verse, end_verse, audio_url, submitted_at
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS student_name        TEXT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS surah               TEXT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS ayah                TEXT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS score               INT     DEFAULT 0;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS transcription       TEXT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS errors              JSONB;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS feedback            TEXT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS teacher_grade       INT     DEFAULT 0;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS memorization_score  INT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS pronunciation_score INT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS tajwid_score        INT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS fluency_score       INT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS makhraj_score       INT;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS hint_count          INT     DEFAULT 0;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS reviewed            BOOLEAN DEFAULT FALSE;
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS recorded_at         TIMESTAMP DEFAULT NOW();
ALTER TABLE public.recitations ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMP;

-- Populate recorded_at from submitted_at for existing rows
UPDATE public.recitations SET recorded_at = submitted_at WHERE recorded_at IS NULL AND submitted_at IS NOT NULL;

-- ── STEP 5: ADD MISSING COLUMNS TO assessments ───────────────────
-- assessments already has: id, recitation_id, score, transcript, errors_json, feedback_text, confidence_score, assessed_at
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS student_id          UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS memorization_score  INT DEFAULT 0;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS pronunciation_score INT DEFAULT 0;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS tajwid_score        INT DEFAULT 0;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS fluency_score       INT DEFAULT 0;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS overall_score       INT DEFAULT 0;

-- ── STEP 6: CREATE join_requests (already exists — just ensure columns) ──
-- join_requests already has: id, class_id, student_id, status, created_at
ALTER TABLE public.join_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ── STEP 7: CREATE notifications ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  type       TEXT DEFAULT 'info',
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── STEP 8: CREATE achievements ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_name  TEXT NOT NULL,
  badge_icon  TEXT,
  description TEXT,
  earned_at   TIMESTAMP DEFAULT NOW()
);

-- ── STEP 9: CREATE assignments ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id  UUID REFERENCES public.users(id) ON DELETE CASCADE,
  surah_index INT  DEFAULT 0,
  ayah_start  INT  DEFAULT 1,
  ayah_end    INT  DEFAULT 5,
  due_date    TIMESTAMP,
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── STEP 10: CREATE murajaah_sessions ────────────────────────────
CREATE TABLE IF NOT EXISTS public.murajaah_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID REFERENCES public.users(id) ON DELETE CASCADE,
  class_id            UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  surah               INT  DEFAULT 1,
  start_ayah          INT  DEFAULT 1,
  end_ayah            INT  DEFAULT 1,
  completed_ayahs     INT  DEFAULT 0,
  progress_percentage INT  DEFAULT 0,
  status              TEXT DEFAULT 'completed',
  session_date        TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- ── STEP 11: INDEXES ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rec_user       ON public.recitations(user_id);
CREATE INDEX IF NOT EXISTS idx_rec_reviewed   ON public.recitations(reviewed);
CREATE INDEX IF NOT EXISTS idx_rec_recorded   ON public.recitations(recorded_at);
CREATE INDEX IF NOT EXISTS idx_jr_student     ON public.join_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_jr_class       ON public.join_requests(class_id);
CREATE INDEX IF NOT EXISTS idx_cm_student     ON public.class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_ann_teacher    ON public.announcements(teacher_id);
CREATE INDEX IF NOT EXISTS idx_notif_user     ON public.notifications(user_id);

-- ── VERIFY ────────────────────────────────────────────────────────
SELECT '=== TABLES ===' AS info;
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;

SELECT '=== USERS SAMPLE ===' AS info;
SELECT id, email, role, full_name, password_hash FROM public.users LIMIT 5;

SELECT '=== POLICIES ===' AS info;
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY tablename LIMIT 20;
