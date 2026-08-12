-- ============================================================================
-- Cascading Delete Migration
-- ============================================================================
-- This migration updates foreign keys to CASCADE on delete, ensuring that
-- when a user is deleted, all their associated data (projects, commits, etc.)
-- is also removed. It also adds an RPC function to allow users to delete themselves.

-- 1. Projects: Owner -> User
ALTER TABLE public.projects 
DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;

ALTER TABLE public.projects 
ADD CONSTRAINT projects_owner_id_fkey 
FOREIGN KEY (owner_id) 
REFERENCES public.users(id) 
ON DELETE CASCADE;

-- 2. Collaborators: Project -> Project (Cascade deletion of project deletes collaborators)
ALTER TABLE public.collaborators 
DROP CONSTRAINT IF EXISTS collaborators_proj_id_fkey;

ALTER TABLE public.collaborators 
ADD CONSTRAINT collaborators_proj_id_fkey 
FOREIGN KEY (proj_id) 
REFERENCES public.projects(id) 
ON DELETE CASCADE;

-- 3. Collaborators: User -> User (If a collaborator user is deleted, remove them from projects)
ALTER TABLE public.collaborators 
DROP CONSTRAINT IF EXISTS collaborators_user_id_fkey;

ALTER TABLE public.collaborators 
ADD CONSTRAINT collaborators_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.users(id) 
ON DELETE CASCADE;

-- 4. Commits: Project -> Project
ALTER TABLE public.commits 
DROP CONSTRAINT IF EXISTS commits_project_id_fkey;

ALTER TABLE public.commits 
ADD CONSTRAINT commits_project_id_fkey 
FOREIGN KEY (project_id) 
REFERENCES public.projects(id) 
ON DELETE CASCADE;

-- 5. Commits: Owner -> User
ALTER TABLE public.commits 
DROP CONSTRAINT IF EXISTS commits_owner_id_fkey;

ALTER TABLE public.commits 
ADD CONSTRAINT commits_owner_id_fkey 
FOREIGN KEY (owner_id) 
REFERENCES public.users(id) 
ON DELETE CASCADE;

-- 6. Branches: Project -> Project
ALTER TABLE public.branches 
DROP CONSTRAINT IF EXISTS branches_project_id_fkey;

ALTER TABLE public.branches 
ADD CONSTRAINT branches_project_id_fkey 
FOREIGN KEY (project_id) 
REFERENCES public.projects(id) 
ON DELETE CASCADE;

-- 7. Branches: User Created -> User
ALTER TABLE public.branches 
DROP CONSTRAINT IF EXISTS branches_user_created_fkey;

ALTER TABLE public.branches 
ADD CONSTRAINT branches_user_created_fkey 
FOREIGN KEY (user_created) 
REFERENCES public.users(id) 
ON DELETE CASCADE;


-- ============================================================================
-- RPC Function: Delete User Account
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the user is deleting their own account (redundant with auth.uid() check but safe)
  -- The DELETE on auth.users will only succeed if the user has permissions, 
  -- but since we are using SECURITY DEFINER, we become the owner of the function (postgres/admin).
  -- So we MUST strictly limit it to deleting the calling user.
  
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;
