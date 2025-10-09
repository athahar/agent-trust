-- migrations/008_cleanup_atd_users.sql
-- Cleanup: Drop leftover atd_users table
DROP TABLE IF EXISTS atd_users CASCADE;
