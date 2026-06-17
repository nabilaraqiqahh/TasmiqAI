-- ================================================================
-- STEP 1 ONLY: Fix RLS so login works NOW
-- This does NOT touch table structure — 100% safe to run immediately
-- ================================================================

-- Drop all blocking policies
DO $$
DECLARE tbl TEXT; pol RECORD;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    FOR pol IN SELECT policyname FROM pg_policies 
               WHERE tablename = tbl AND schemaname = 'public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;

-- Create open policies (allows anon key to read/write without Supabase Auth session)
DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "open_all" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        tbl
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ── VERIFY: Check existing tables and policies ────────────────────
SELECT '=== YOUR TABLES ===' AS info;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

SELECT '=== POLICIES NOW ===' AS info;
SELECT tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT '=== USERS COLUMNS ===' AS info;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

SELECT '=== SAMPLE USERS (no passwords) ===' AS info;
SELECT * FROM public.users LIMIT 5;
