-- ============================================================================
-- Disable Row Level Security (RLS) for Projects Table
-- ============================================================================
-- Since we removed user_id, we don't need RLS
-- This allows all users to insert/view/update/delete all projects
--
-- Usage:
--   1. Go to Supabase Dashboard > SQL Editor
--   2. Click "New query"
--   3. Paste this file
--   4. Click "Run"
-- ============================================================================

-- Disable Row Level Security on projects table
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;

-- Drop any existing RLS policies (if they exist)
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Enable read access for all users" ON projects;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON projects;
DROP POLICY IF EXISTS "Enable update for users based on email" ON projects;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON projects;

-- Verify RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'projects';
-- rowsecurity should be false
