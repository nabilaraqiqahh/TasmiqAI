-- ============================================
-- TasmiqAI Teacher Portal - Database Schema
-- ============================================

-- STEP 1: CREATE ALL TABLES
-- ============================================

-- 1. USERS TABLE (Teachers, Students, Admin)
CREATE TABLE IF NOT EXISTS public.users (
  uid UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'admin', 'staff')),
  avg_score FLOAT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. CLASSES TABLE
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  code TEXT UNIQUE NOT NULL,
  level TEXT CHECK (level IN ('Beginner', 'Intermediate', 'Advanced')),
  total_students INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. CLASS ENROLLMENTS
CREATE TABLE IF NOT EXISTS public.class_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(class_id, student_id)
);

-- 4. RECITATIONS TABLE (Student audio submissions)
CREATE TABLE IF NOT EXISTS public.recitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  surah INT NOT NULL,
  ayah INT NOT NULL,
  audio_url TEXT,
  score INT,
  transcription TEXT,
  errors TEXT,
  feedback TEXT,
  teacher_grade INT,
  reviewed BOOLEAN DEFAULT FALSE,
  recorded_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  student_name TEXT
);

-- 5. ANNOUNCEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. MURAJAAH_SESSIONS TABLE (Review sessions)
CREATE TABLE IF NOT EXISTS public.murajaah_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  surah INT NOT NULL,
  start_ayah INT NOT NULL,
  end_ayah INT NOT NULL,
  completed_ayahs INT DEFAULT 0,
  progress_percentage INT DEFAULT 0,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'paused')),
  session_date TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. PROGRESS_TRACKING TABLE
CREATE TABLE IF NOT EXISTS public.progress_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  surah INT NOT NULL,
  ayah INT NOT NULL,
  completed_date TIMESTAMP,
  grade INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- STEP 2: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id ON public.class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_id ON public.class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_recitations_student_id ON public.recitations(student_id);
CREATE INDEX IF NOT EXISTS idx_recitations_class_id ON public.recitations(class_id);
CREATE INDEX IF NOT EXISTS idx_recitations_reviewed ON public.recitations(reviewed);
CREATE INDEX IF NOT EXISTS idx_announcements_teacher_id ON public.announcements(teacher_id);
CREATE INDEX IF NOT EXISTS idx_announcements_class_id ON public.announcements(class_id);
CREATE INDEX IF NOT EXISTS idx_murajaah_class_id ON public.murajaah_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_murajaah_student_id ON public.murajaah_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_student_id ON public.progress_tracking(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_class_id ON public.progress_tracking(class_id);

-- STEP 3: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.murajaah_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_tracking ENABLE ROW LEVEL SECURITY;

-- STEP 4: CREATE RLS POLICIES (SIMPLIFIED - PERMISSIVE FOR NOW)
-- ============================================

-- Allow all authenticated users to read from users table
CREATE POLICY "Enable read access for all users" ON public.users
  FOR SELECT TO authenticated USING (TRUE);

-- Allow users to update their own profile
CREATE POLICY "Enable update for own profile" ON public.users
  FOR UPDATE TO authenticated USING (auth.uid() = uid) WITH CHECK (auth.uid() = uid);

-- Classes: Allow teachers to manage their classes
CREATE POLICY "Enable all for classes" ON public.classes
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Allow all class enrollments to be read
CREATE POLICY "Enable all for enrollments" ON public.class_enrollments
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Allow all recitations to be read
CREATE POLICY "Enable all for recitations" ON public.recitations
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Allow all announcements to be read
CREATE POLICY "Enable all for announcements" ON public.announcements
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Allow all murajaah sessions to be read
CREATE POLICY "Enable all for sessions" ON public.murajaah_sessions
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Allow all progress tracking to be read
CREATE POLICY "Enable all for progress" ON public.progress_tracking
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ============================================
-- SAMPLE DATA (for testing)
-- ============================================

-- Insert 8 test users (3 teachers, 5 students)
INSERT INTO public.users (uid, email, display_name, role, avg_score, created_at)
VALUES 
  -- Teachers
  (gen_random_uuid(), 'teacher1@tasmiq.ai', 'Mr. Ahmed Hassan', 'teacher', NULL, NOW()),
  (gen_random_uuid(), 'teacher2@tasmiq.ai', 'Mrs. Fatima Khan', 'teacher', NULL, NOW()),
  (gen_random_uuid(), 'admin@tasmiq.ai', 'Admin User', 'admin', NULL, NOW()),
  -- Students
  (gen_random_uuid(), 'student1@tasmiq.ai', 'Ali Mohamed', 'student', 85.5, NOW()),
  (gen_random_uuid(), 'student2@tasmiq.ai', 'Zainab Ahmed', 'student', 92.0, NOW()),
  (gen_random_uuid(), 'student3@tasmiq.ai', 'Omar Hassan', 'student', 78.3, NOW()),
  (gen_random_uuid(), 'student4@tasmiq.ai', 'Leila Mahmoud', 'student', 88.7, NOW()),
  (gen_random_uuid(), 'student5@tasmiq.ai', 'Hassan Ibrahim', 'student', 81.2, NOW())
ON CONFLICT DO NOTHING;
