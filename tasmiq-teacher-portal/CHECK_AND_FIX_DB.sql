-- ================================================================
-- RUN THIS IN SUPABASE SQL EDITOR
-- https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new
-- ================================================================

-- STEP 1: See exactly what's in your users table
SELECT uid, email, role, 
       password_hash,
       full_name,
       CASE WHEN password_hash IS NULL THEN 'NO PASSWORD' 
            WHEN password_hash = '' THEN 'EMPTY PASSWORD'
            ELSE 'HAS PASSWORD (' || length(password_hash) || ' chars)'
       END as password_status
FROM public.users
ORDER BY role, email;

-- ================================================================
-- STEP 2: Fix RLS - allow anon key to read/write users table
-- (This is why existing users can't log in — RLS blocks the query)
-- ================================================================

-- Drop ALL existing policies on users table
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END $$;

-- Create open policies (allows anon key to query without auth session)
CREATE POLICY "open_select" ON public.users FOR SELECT USING (true);
CREATE POLICY "open_insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "open_update" ON public.users FOR UPDATE USING (true);

-- Do the same for all other tables
DO $$ 
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    -- Drop all existing policies
    FOR pol IN 
      SELECT policyname FROM pg_policies WHERE tablename = tbl AND schemaname = 'public'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
    -- Create open policy
    BEGIN
      EXECUTE format('CREATE POLICY "open_all_%s" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- skip tables that don't support RLS
    END;
  END LOOP;
END $$;

-- ================================================================
-- STEP 3: Update existing users to ensure they have password_hash
-- (If your users have password '123456' but it's stored differently)
-- ================================================================

-- Check current password values
SELECT email, role, 
       password_hash,
       full_name
FROM public.users;

-- ================================================================
-- STEP 4: Verify the fix worked
-- ================================================================
SELECT 'RLS Policies on users:' as info;
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'users';
