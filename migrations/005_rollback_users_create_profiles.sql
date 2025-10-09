-- migrations/005_rollback_users_create_profiles.sql
-- Rollback atd_users → users (for other apps)
-- Create new atd_profiles table that references auth.users
-- Created: 2025-10-09

-- ========================================
-- SECTION 1: Rollback users table rename
-- ========================================

-- Rename atd_users back to users for other apps
ALTER TABLE IF EXISTS atd_users RENAME TO users;

COMMENT ON TABLE users IS 'Shared users table for multiple apps (not ATD-specific)';

-- ========================================
-- SECTION 2: Create atd_profiles table
-- ========================================

-- Create ATD-specific profiles table that references auth.users
CREATE TABLE IF NOT EXISTS atd_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE,
  email VARCHAR(255),
  bio TEXT,
  website_url VARCHAR(500),
  avatar_url VARCHAR(500),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_atd_profiles_email ON atd_profiles(email);
CREATE INDEX IF NOT EXISTS idx_atd_profiles_username ON atd_profiles(username);
CREATE INDEX IF NOT EXISTS idx_atd_profiles_role ON atd_profiles(role);

-- Enable Row Level Security (best practice for public schema)
ALTER TABLE atd_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all profiles (public read)
CREATE POLICY "Public profiles are viewable by everyone"
  ON atd_profiles FOR SELECT
  USING (true);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON atd_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON atd_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

COMMENT ON TABLE atd_profiles IS 'ATD-specific user profiles linked to auth.users (Sprint 2)';
COMMENT ON COLUMN atd_profiles.id IS 'References auth.users.id (Supabase Auth)';

-- ========================================
-- SECTION 3: Migrate data from users to atd_profiles
-- ========================================

-- Copy data from users table to atd_profiles
-- Note: Only migrate users that exist in auth.users
INSERT INTO atd_profiles (id, username, email, bio, website_url, avatar_url, role, created_at)
SELECT
  u.id,
  u.username,
  u.email,
  u.bio,
  u.website_url,
  u.avatar_url,
  u.role,
  u.created_at
FROM users u
WHERE EXISTS (
  SELECT 1 FROM auth.users au WHERE au.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- SECTION 4: Verification
-- ========================================

DO $$
DECLARE
  users_count INTEGER;
  profiles_count INTEGER;
  auth_users_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO users_count FROM users;
  SELECT COUNT(*) INTO profiles_count FROM atd_profiles;

  -- Count auth users (approximation - can't directly query auth.users)
  SELECT COUNT(DISTINCT id) INTO auth_users_count FROM atd_profiles;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Users table rollback complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Results:';
  RAISE NOTICE '  - users table restored (% rows)', users_count;
  RAISE NOTICE '  - atd_profiles created (% rows)', profiles_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Architecture:';
  RAISE NOTICE '  - auth.users: Supabase Auth (all apps)';
  RAISE NOTICE '  - public.users: Shared users table (all apps)';
  RAISE NOTICE '  - public.atd_profiles: ATD-specific profiles (this app only)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Update ATD code to use atd_profiles';
  RAISE NOTICE '  2. Test ATD application';
  RAISE NOTICE '  3. Verify other apps still work';
  RAISE NOTICE '';
END $$;
