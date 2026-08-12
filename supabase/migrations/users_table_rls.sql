-- ============================================================================
-- Row Level Security (RLS) for Users Table
-- ============================================================================
-- This allows authenticated users to:
--   1. INSERT their own user record (when id matches auth.uid())
--   2. SELECT their own user record
--   3. UPDATE their own user record
--   4. SELECT other users' public information (for username lookups)
--
-- Usage:
--   1. Go to Supabase Dashboard > SQL Editor
--   2. Click "New query"
--   3. Paste this file
--   4. Click "Run"
-- ============================================================================

-- Enable Row Level Security on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Users can view all users" ON users;
DROP POLICY IF EXISTS "Users can insert own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;

-- Policy 1: Allow authenticated users to view all users (for username lookups, profiles, etc.)
CREATE POLICY "Users can view all users"
ON users
FOR SELECT
TO authenticated
USING (true);

-- Policy 2: Allow authenticated users to INSERT their own user record
-- This is critical for the signUp flow and legacy user creation
CREATE POLICY "Users can insert own record"
ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Policy 3: Allow authenticated users to UPDATE their own user record
CREATE POLICY "Users can update own record"
ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'users';
-- rowsecurity should be true

-- View all policies on users table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'users';
