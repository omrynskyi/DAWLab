-- ============================================================================
-- DAWLab Projects Table Schema
-- ============================================================================
-- This creates a simple projects table for storing music project metadata
-- without file storage, user authentication, or thumbnails.
--
-- Usage:
--   1. Go to Supabase Dashboard > SQL Editor
--   2. Click "New query"
--   3. Paste this entire file
--   4. Click "Run"
-- ============================================================================

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  genre TEXT,
  daw TEXT,
  public BOOLEAN DEFAULT TRUE,
  description TEXT,
  bpm INTEGER CHECK (bpm > 0 AND bpm <= 999),
  key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_genre ON projects(genre) WHERE genre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(public) WHERE public = TRUE;

-- ============================================================================
-- Migration for Existing Tables
-- ============================================================================
-- If you already have a projects table, use this section to add missing columns

-- Add name column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'name'
  ) THEN
    ALTER TABLE projects ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled';
  END IF;
END $$;

-- Add description column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'description'
  ) THEN
    ALTER TABLE projects ADD COLUMN description TEXT;
  END IF;
END $$;

-- Add genre column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'genre'
  ) THEN
    ALTER TABLE projects ADD COLUMN genre TEXT;
  END IF;
END $$;

-- Add daw column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'daw'
  ) THEN
    ALTER TABLE projects ADD COLUMN daw TEXT;
  END IF;
END $$;

-- Add public column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'public'
  ) THEN
    ALTER TABLE projects ADD COLUMN public BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- Add bpm column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'bpm'
  ) THEN
    ALTER TABLE projects ADD COLUMN bpm INTEGER CHECK (bpm > 0 AND bpm <= 999);
  END IF;
END $$;

-- Add key column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'key'
  ) THEN
    ALTER TABLE projects ADD COLUMN key TEXT;
  END IF;
END $$;

-- Add created_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE projects ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================================================
-- Cleanup - Remove deprecated columns if they exist
-- ============================================================================
-- WARNING: This will delete data in these columns!
-- Comment out any columns you want to keep

-- Remove user_id column (no user authentication)
ALTER TABLE projects DROP COLUMN IF EXISTS user_id CASCADE;

-- Remove file storage columns
ALTER TABLE projects DROP COLUMN IF EXISTS file_url CASCADE;
ALTER TABLE projects DROP COLUMN IF EXISTS file_path CASCADE;

-- Remove thumbnail column
ALTER TABLE projects DROP COLUMN IF EXISTS src CASCADE;

-- Remove CTA text column
ALTER TABLE projects DROP COLUMN IF EXISTS ctaText CASCADE;

-- Remove owner_id if it exists (alias for user_id)
ALTER TABLE projects DROP COLUMN IF EXISTS owner_id CASCADE;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the table structure

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'projects'
ORDER BY ordinal_position;

