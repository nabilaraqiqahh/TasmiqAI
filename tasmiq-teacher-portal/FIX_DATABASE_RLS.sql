-- ============================================================
-- RUN THIS IN SUPABASE SQL EDITOR
-- This fixes the RLS policies so the portal can query users
-- ============================================================

-- STEP 1: Drop old restrictive policies that require auth session
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Enable update for own profile" ON public.users;
DROP POLICY IF EXISTS "Enable all for classes" ON public.classes;
DROP POLICY IF EXISTS "Enable all for enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Enable all for recitations" ON public.recitations;
DROP POLICY IF EXISTS "Enable all for announcements" ON public.announcements;
DROP POLICY IF EXISTS "Enable all for sessions" ON public.murajaah_sessions;
DROP POLICY IF EXISTS "Enable all for progress" ON public.progress_tracking;

-- Also drop any policies on tables from the actual DB
DROP POLICY IF EXISTS "Enable all for join_requests" ON public.join_requests;
DROP POLICY IF EXISTS "Enable all for assessments" ON public.assessments;
DROP POLICY IF EXISTS "Enable all for class_invites" ON public.class_invites;
DROP POLICY IF EXISTS "Enable all for class_members" ON public.class_members;
DROP POLICY IF EXISTS "Enable all for feedback" ON public.feedback;

-- STEP 2: Allow anon role to do everything (open policies for dev)
-- This is safe for development; tighten later for production

CREATE POLICY "anon_all_users" ON public.users
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_classes" ON public.classes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_recitations" ON public.recitations
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_announcements" ON public.announcements
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- For tables that exist in your actual DB
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'join_requests') THEN
    EXECUTE 'CREATE POLICY "anon_all_join_requests" ON public.join_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'class_enrollments') THEN
    EXECUTE 'CREATE POLICY "anon_all_enrollments" ON public.class_enrollments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'class_members') THEN
    EXECUTE 'CREATE POLICY "anon_all_class_members" ON public.class_members FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'class_invites') THEN
    EXECUTE 'CREATE POLICY "anon_all_class_invites" ON public.class_invites FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'assessments') THEN
    EXECUTE 'CREATE POLICY "anon_all_assessments" ON public.assessments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'feedback') THEN
    EXECUTE 'CREATE POLICY "anon_all_feedback" ON public.feedback FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'murajaah_sessions') THEN
    EXECUTE 'CREATE POLICY "anon_all_murajaah" ON public.murajaah_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'progress_tracking') THEN
    EXECUTE 'CREATE POLICY "anon_all_progress" ON public.progress_tracking FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- STEP 3: Verify your users table has the right columns
-- Run this to check what columns actually exist:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;
