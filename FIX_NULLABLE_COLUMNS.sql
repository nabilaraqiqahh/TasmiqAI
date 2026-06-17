-- Fix NOT NULL constraints on optional columns that the mobile app may not send
ALTER TABLE public.recitations ALTER COLUMN duration_seconds SET DEFAULT 0;
ALTER TABLE public.recitations ALTER COLUMN duration_seconds DROP NOT NULL;

-- Also make device_info nullable (same issue)
ALTER TABLE public.recitations ALTER COLUMN device_info DROP NOT NULL;

-- Verify
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'recitations' AND table_schema = 'public'
ORDER BY ordinal_position;
