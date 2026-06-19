-- ══════════════════════════════════════════════════════════════════════════════
-- TASMIQAI — Supabase Storage Setup for Audio Recitations
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Step 1: Create the storage bucket (if it doesn't already exist) ──────────
-- NOTE: You can also create this in the UI:
--   Storage → New Bucket → Name: recitations → ✅ Public → Save
INSERT INTO storage.buckets (id, name, public)
VALUES ('recitations', 'recitations', true)
ON CONFLICT (id) DO UPDATE SET public = true;


-- ── Step 2: Allow authenticated students to upload their recordings ───────────
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recitations');


-- ── Step 3: Allow anyone (including the Teacher Portal web app) to read/play ──
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
CREATE POLICY "Allow public reads"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'recitations');


-- ── Step 4: Allow students to update/replace their own files ──────────────────
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
CREATE POLICY "Allow authenticated updates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'recitations');


-- ── Verify: check that the bucket exists and is public ────────────────────────
SELECT id, name, public, created_at
FROM storage.buckets
WHERE id = 'recitations';
