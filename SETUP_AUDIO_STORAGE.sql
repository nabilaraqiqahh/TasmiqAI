-- ================================================================
-- SETUP SUPABASE STORAGE FOR AUDIO FILES
-- Run in: https://supabase.com/dashboard/project/mrxgwwhbcskcjkgtnrtd/sql/new
-- ================================================================

-- Step 1: Create the 'recitations' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recitations',
  'recitations', 
  true,              -- PUBLIC bucket so audio_url works without auth
  52428800,          -- 50MB max per file
  ARRAY['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Step 2: Allow anyone to upload and read audio files (anon key)
DROP POLICY IF EXISTS "Allow public uploads"  ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads"    ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes"  ON storage.objects;

CREATE POLICY "Allow public uploads" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'recitations');

CREATE POLICY "Allow public reads" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'recitations');

CREATE POLICY "Allow public deletes" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'recitations');

-- Step 3: Verify
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'recitations';
