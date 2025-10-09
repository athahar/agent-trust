-- migrations/009_add_fields_to_profiles.sql
-- Add missing fields to atd_profiles (user_id, name, risk_profile)
-- Created: 2025-10-09

-- Add user_id as text (copy of UUID id as text)
ALTER TABLE atd_profiles ADD COLUMN IF NOT EXISTS user_id TEXT UNIQUE;

-- Add name (alias for username)
ALTER TABLE atd_profiles ADD COLUMN IF NOT EXISTS name TEXT;

-- Add risk_profile (integer score)
ALTER TABLE atd_profiles ADD COLUMN IF NOT EXISTS risk_profile INTEGER DEFAULT 50;

-- Backfill user_id and name from existing data
UPDATE atd_profiles 
SET 
  user_id = id::text,
  name = username
WHERE user_id IS NULL OR name IS NULL;

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_atd_profiles_user_id ON atd_profiles(user_id);

-- Verification
DO $$
DECLARE
  profile_count INTEGER;
  with_user_id_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM atd_profiles;
  SELECT COUNT(*) INTO with_user_id_count FROM atd_profiles WHERE user_id IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE '✅ atd_profiles fields added!';
  RAISE NOTICE '';
  RAISE NOTICE 'Results:';
  RAISE NOTICE '  - Total profiles: %', profile_count;
  RAISE NOTICE '  - Profiles with user_id: %', with_user_id_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New fields:';
  RAISE NOTICE '  - user_id (TEXT, unique)';
  RAISE NOTICE '  - name (TEXT)';
  RAISE NOTICE '  - risk_profile (INTEGER, default 50)';
  RAISE NOTICE '';
END $$;
