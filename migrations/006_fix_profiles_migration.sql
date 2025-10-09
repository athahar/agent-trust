-- migrations/006_fix_profiles_migration.sql
-- Fix: Populate atd_profiles from users table and drop empty atd_users
-- Created: 2025-10-09

-- ========================================
-- SECTION 1: Drop empty atd_users table
-- ========================================

DROP TABLE IF EXISTS atd_users CASCADE;

-- ========================================
-- SECTION 2: Populate atd_profiles from users
-- ========================================

-- Copy data from users table to atd_profiles
-- Note: This will create profiles for existing users
-- The id must match auth.users.id for the FK constraint
INSERT INTO atd_profiles (id, username, email, bio, website_url, avatar_url, role, created_at)
SELECT
  id,
  username,
  email,
  bio,
  website_url,
  avatar_url,
  role,
  created_at
FROM users
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  bio = EXCLUDED.bio,
  website_url = EXCLUDED.website_url,
  avatar_url = EXCLUDED.avatar_url,
  role = EXCLUDED.role,
  updated_at = NOW();

-- ========================================
-- SECTION 3: Verification
-- ========================================

DO $$
DECLARE
  users_count INTEGER;
  profiles_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO users_count FROM users;
  SELECT COUNT(*) INTO profiles_count FROM atd_profiles;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Profiles migration fixed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Results:';
  RAISE NOTICE '  - users table: % rows (preserved)', users_count;
  RAISE NOTICE '  - atd_users table: dropped (was empty)';
  RAISE NOTICE '  - atd_profiles table: % rows (migrated)', profiles_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Update code to use atd_profiles instead of atd_users';
  RAISE NOTICE '';
END $$;
