-- migrations/007_atd_profiles_standalone.sql
-- Create atd_profiles as standalone table (no FK to auth.users)
-- The users table uses custom auth, not Supabase Auth
-- Created: 2025-10-09

-- ========================================
-- SECTION 1: Drop existing atd_profiles with FK constraint
-- ========================================

DROP TABLE IF EXISTS atd_profiles CASCADE;
DROP TABLE IF EXISTS atd_users CASCADE;

-- ========================================
-- SECTION 2: Create standalone atd_profiles table
-- ========================================

CREATE TABLE atd_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE,
  email VARCHAR(255),
  password_hash TEXT,
  bio TEXT,
  website_url VARCHAR(500),
  avatar_url VARCHAR(500),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX idx_atd_profiles_email ON atd_profiles(email);
CREATE INDEX idx_atd_profiles_username ON atd_profiles(username);
CREATE INDEX idx_atd_profiles_role ON atd_profiles(role);

-- Enable Row Level Security
ALTER TABLE atd_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Public read (for now - adjust based on requirements)
CREATE POLICY "Profiles are viewable by everyone"
  ON atd_profiles FOR SELECT
  USING (true);

-- Policy: Service role can manage all profiles
CREATE POLICY "Service role can manage profiles"
  ON atd_profiles FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE atd_profiles IS 'ATD-specific user profiles (standalone, not linked to auth.users)';

-- ========================================
-- SECTION 3: Migrate data from users to atd_profiles
-- ========================================

INSERT INTO atd_profiles (id, username, email, password_hash, bio, website_url, avatar_url, role, created_at)
SELECT
  id,
  username,
  email,
  password_hash,
  bio,
  website_url,
  avatar_url,
  role,
  created_at
FROM users;

-- ========================================
-- SECTION 4: Verification
-- ========================================

DO $$
DECLARE
  users_count INTEGER;
  profiles_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO users_count FROM users;
  SELECT COUNT(*) INTO profiles_count FROM atd_profiles;

  RAISE NOTICE '';
  RAISE NOTICE '✅ ATD Profiles created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Results:';
  RAISE NOTICE '  - users table: % rows (preserved for other apps)', users_count;
  RAISE NOTICE '  - atd_profiles table: % rows (migrated)', profiles_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Architecture:';
  RAISE NOTICE '  - auth.users: Supabase Auth (25 users - other apps)';
  RAISE NOTICE '  - public.users: Shared custom users (15 users - all apps)';
  RAISE NOTICE '  - public.atd_profiles: ATD-specific profiles (% users - this app)', profiles_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Update code to use atd_profiles instead of atd_users';
  RAISE NOTICE '';
END $$;
