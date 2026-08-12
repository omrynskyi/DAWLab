-- ============================================================================
-- Remove Email Column from public.users Table
-- ============================================================================
-- Security Enhancement: Remove PII (email) from public.users table
-- Email should only exist in auth.users (private schema)
-- This ensures email is not exposed through public queries
--
-- Usage:
--   1. Go to Supabase Dashboard > SQL Editor
--   2. Click "New query"
--   3. Paste this file
--   4. Click "Run"
--
-- ⚠️ WARNING: This will permanently delete the email column from public.users
-- Make sure you have a backup if needed!
-- ============================================================================

-- Step 1: Drop the email column from public.users
ALTER TABLE public.users 
DROP COLUMN IF EXISTS email;

-- Step 2: Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'users';

-- Expected result: Only 'id' and 'username' columns should remain

-- Step 3: Add comment to table for documentation
COMMENT ON TABLE public.users IS 
  'Public user profiles. Links to auth.users via id (UUID). 
   Email is NOT stored here - fetch from auth.users if needed.
   Schema: (id uuid, username text)';
