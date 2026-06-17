-- ================================================================
-- PASTE THIS ENTIRE SCRIPT INTO SUPABASE SQL EDITOR AND CLICK RUN
-- URL: https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new
-- ================================================================

-- Step 1: Remove all existing RLS policies from users table
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename='users' AND schemaname='public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END $$;

-- Step 2: Add open policies so anon key can read and write
CREATE POLICY "allow_read"   ON public.users FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update" ON public.users FOR UPDATE USING (true);

-- Step 3: Do the same for all other tables
DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOR tbl IN VALUES ('classes'),('recitations'),('announcements'),('class_enrollments'),('class_members'),('join_requests'),('assessments'),('feedback'),('murajaah_sessions'),('progress_tracking'),('class_invites')
  LOOP
    BEGIN
      FOR pol IN SELECT policyname FROM pg_policies WHERE tablename=tbl AND schemaname='public'
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;
      EXECUTE format('CREATE POLICY "allow_all" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- Step 4: Show what's in users table so you can verify
SELECT uid, email, role, password_hash, full_name FROM public.users ORDER BY role, email;
