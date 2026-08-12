-- ============================================================================
-- Auth Schema Username & Display Name Helpers
-- ============================================================================
-- Since we cannot modify auth.users table structure (managed by Supabase),
-- we store username and display name in raw_user_meta_data JSON field.
-- This script provides helper views and functions to work with this data.
--
-- Usage:
--   1. Go to Supabase Dashboard > SQL Editor
--   2. Click "New query"
--   3. Paste this file
--   4. Click "Run"
-- ============================================================================

-- ============================================================================
-- PART 1: View Auth Users with Username (Read-Only)
-- ============================================================================
-- Note: We can query auth.users but cannot modify the auth schema
-- This provides queries to view username data

-- Query to view all users with usernames extracted from metadata
-- Copy and paste this query in Supabase SQL Editor:

/*
SELECT 
  id,
  email,
  raw_user_meta_data->>'username' as username,
  raw_user_meta_data->>'full_name' as display_name,
  raw_user_meta_data->>'firstName' as first_name,
  raw_user_meta_data->>'lastName' as last_name,
  email_confirmed_at,
  created_at,
  updated_at,
  last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;
*/


-- ============================================================================
-- PART 2: Verification Queries
-- ============================================================================
-- Use these queries to verify username data in auth.users

-- View all users with username data
SELECT 
  email,
  raw_user_meta_data->>'username' as username,
  raw_user_meta_data->>'full_name' as display_name,
  created_at
FROM auth.users
ORDER BY created_at DESC;

-- Count users with vs without usernames
SELECT 
  COUNT(*) FILTER (WHERE raw_user_meta_data->>'username' IS NOT NULL) as users_with_username,
  COUNT(*) FILTER (WHERE raw_user_meta_data->>'username' IS NULL) as users_without_username,
  COUNT(*) as total_users
FROM auth.users;

-- Find users where display_name doesn't match username
SELECT 
  email,
  raw_user_meta_data->>'username' as username,
  raw_user_meta_data->>'full_name' as display_name
FROM auth.users
WHERE raw_user_meta_data->>'username' IS NOT NULL
  AND (raw_user_meta_data->>'full_name' IS NULL 
       OR raw_user_meta_data->>'full_name' != raw_user_meta_data->>'username')
ORDER BY created_at DESC;


-- ============================================================================
-- PART 3: Helper Function in Public Schema
-- ============================================================================
-- Since we can't modify auth schema, create helper in public schema

-- Function to get username by looking up in public.users table
CREATE OR REPLACE FUNCTION public.get_user_info(user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  email text
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    u.id,
    u.username,
    au.email
  FROM public.users u
  LEFT JOIN auth.users au ON u.id = au.id
  WHERE u.id = user_id;
$$;

-- Usage: SELECT * FROM public.get_user_info('user-uuid-here');


-- ============================================================================
-- PART 4: Combined View (Public + Auth Data)
-- ============================================================================
-- Create a view in public schema that joins both tables

CREATE OR REPLACE VIEW public.users_with_auth AS
SELECT 
  u.id,
  u.username,
  au.email,
  au.raw_user_meta_data->>'full_name' as display_name,
  au.created_at,
  au.last_sign_in_at,
  au.email_confirmed_at
FROM public.users u
LEFT JOIN auth.users au ON u.id = au.id;

-- Query to view all users with both username and auth data
-- SELECT * FROM public.users_with_auth ORDER BY created_at DESC;


-- ============================================================================
-- PART 5: Comments for Documentation
-- ============================================================================
COMMENT ON FUNCTION public.get_user_info IS 
  'Returns user info (id, username, email) by joining public.users and auth.users tables.';

COMMENT ON VIEW public.users_with_auth IS 
  'Combined view of public.users and auth.users data. 
   Shows username from public.users and email/auth data from auth.users.';
