-- migrations/000_atd_migrate_existing.sql
-- Migrate EXISTING tables to ATD (Agent Trust Demo) prefix
-- Renames tables while preserving all data, indexes, and constraints
--
-- IMPORTANT: This is a ONE-WAY migration. Back up your data first!
-- To backup: pg_dump $DATABASE_URL > backup_before_atd_migration.sql

-- ========================================
-- PRE-FLIGHT CHECKS
-- ========================================

DO $$
DECLARE
  existing_tables TEXT[];
  missing_tables TEXT[];
BEGIN
  -- Check which tables exist
  SELECT ARRAY_AGG(table_name)
  INTO existing_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'users',
      'risk_users',
      'fraud_rules',
      'transactions',
      'sample_transactions',
      'rule_trigger_counts'
    );

  -- Check for already-migrated tables
  SELECT ARRAY_AGG(table_name)
  INTO missing_tables
  FROM (VALUES
    ('users'),
    ('risk_users'),
    ('fraud_rules'),
    ('transactions'),
    ('sample_transactions'),
    ('rule_trigger_counts')
  ) AS t(table_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t.table_name
  );

  IF missing_tables IS NOT NULL AND array_length(missing_tables, 1) > 0 THEN
    RAISE WARNING 'Missing expected tables: %. They may already be migrated or never existed.', missing_tables;
  END IF;

  IF existing_tables IS NULL OR array_length(existing_tables, 1) = 0 THEN
    RAISE EXCEPTION 'No tables found to migrate. Use 000_atd_setup_fresh.sql instead.';
  END IF;

  RAISE NOTICE 'Found % tables to migrate: %', array_length(existing_tables, 1), existing_tables;
END $$;

-- ========================================
-- SECTION 1: Rename Existing Tables
-- ========================================

-- Users table (app users)
ALTER TABLE IF EXISTS users RENAME TO atd_users;

-- Risk users table (fraud analysts)
ALTER TABLE IF EXISTS risk_users RENAME TO atd_risk_users;

-- Fraud rules table
ALTER TABLE IF EXISTS fraud_rules RENAME TO atd_fraud_rules;

-- Transactions table (main)
ALTER TABLE IF EXISTS transactions RENAME TO atd_transactions;

-- Sample transactions
ALTER TABLE IF EXISTS sample_transactions RENAME TO atd_sample_transactions;

-- Rule trigger counts (analytics)
ALTER TABLE IF EXISTS rule_trigger_counts RENAME TO atd_rule_trigger_counts;

-- ========================================
-- SECTION 2: Update Foreign Key References
-- ========================================

-- Update FK constraints in atd_fraud_rules to point to atd_risk_users
DO $$
BEGIN
  -- Drop old FKs if they exist
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'atd_fraud_rules' AND constraint_name = 'fk_created_by'
  ) THEN
    ALTER TABLE atd_fraud_rules DROP CONSTRAINT fk_created_by;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'atd_fraud_rules' AND constraint_name = 'fk_approved_by'
  ) THEN
    ALTER TABLE atd_fraud_rules DROP CONSTRAINT fk_approved_by;
  END IF;

  -- Recreate FKs with new table names
  ALTER TABLE atd_fraud_rules
    ADD CONSTRAINT fk_created_by
    FOREIGN KEY (created_by) REFERENCES atd_risk_users(id) ON DELETE SET NULL;

  ALTER TABLE atd_fraud_rules
    ADD CONSTRAINT fk_approved_by
    FOREIGN KEY (approved_by) REFERENCES atd_risk_users(id) ON DELETE SET NULL;

  RAISE NOTICE '✅ Updated foreign key constraints';
END $$;

-- ========================================
-- SECTION 3: Add Missing Columns (if needed)
-- ========================================

-- Add is_first_transaction to atd_transactions if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atd_transactions' AND column_name = 'is_first_transaction'
  ) THEN
    ALTER TABLE atd_transactions ADD COLUMN is_first_transaction BOOLEAN DEFAULT false;
    RAISE NOTICE '✅ Added is_first_transaction column to atd_transactions';
  END IF;
END $$;

-- ========================================
-- SECTION 4: Create New Sprint 2 Tables
-- ========================================

-- Transactions projection table (for fast dry-run queries)
CREATE TABLE IF NOT EXISTS atd_transactions_proj (
  txn_id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  hour SMALLINT CHECK (hour >= 0 AND hour <= 23),
  device TEXT,
  agent_id TEXT,
  partner TEXT,
  intent TEXT,
  decision TEXT NOT NULL,
  flagged BOOLEAN DEFAULT false,
  disputed BOOLEAN DEFAULT false,
  declined BOOLEAN DEFAULT false,
  account_age_days INTEGER,
  is_first_transaction BOOLEAN DEFAULT false,
  triggered_rule_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for projection table
CREATE INDEX IF NOT EXISTS idx_atd_proj_decision_ts ON atd_transactions_proj(decision, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_atd_proj_device ON atd_transactions_proj(device) WHERE device IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atd_proj_agent_id ON atd_transactions_proj(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atd_proj_partner ON atd_transactions_proj(partner) WHERE partner IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atd_proj_intent ON atd_transactions_proj(intent) WHERE intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atd_proj_amount ON atd_transactions_proj(amount);
CREATE INDEX IF NOT EXISTS idx_atd_proj_hour ON atd_transactions_proj(hour);
CREATE INDEX IF NOT EXISTS idx_atd_proj_flagged ON atd_transactions_proj(flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_atd_proj_disputed ON atd_transactions_proj(disputed) WHERE disputed = true;
CREATE INDEX IF NOT EXISTS idx_atd_proj_declined ON atd_transactions_proj(declined) WHERE declined = true;
CREATE INDEX IF NOT EXISTS idx_atd_proj_first_txn ON atd_transactions_proj(is_first_transaction) WHERE is_first_transaction = true;
CREATE INDEX IF NOT EXISTS idx_atd_proj_triggered ON atd_transactions_proj USING GIN (triggered_rule_ids);
CREATE INDEX IF NOT EXISTS idx_atd_proj_device_amount ON atd_transactions_proj(device, amount);
CREATE INDEX IF NOT EXISTS idx_atd_proj_flagged_amount ON atd_transactions_proj(flagged, amount) WHERE flagged = true;

COMMENT ON TABLE atd_transactions_proj IS 'Lean projection for fast dry-run queries (Sprint 2)';

-- Rule suggestions table
CREATE TABLE IF NOT EXISTS atd_rule_suggestions (
  id TEXT PRIMARY KEY DEFAULT ('sugg_' || substr(md5(random()::text), 1, 20)),
  rule_id TEXT,
  status TEXT CHECK (status IN ('pending','accepted','rejected','discarded')) DEFAULT 'pending',
  suggestion_type TEXT CHECK (suggestion_type IN ('new_rule','modify_rule','delete_rule')),
  generated_rule JSONB NOT NULL,
  ai_reasoning TEXT,
  llm_model TEXT,
  llm_prompt_sha256 CHAR(64),
  llm_response_sha256 CHAR(64),
  instruction TEXT,
  created_by TEXT,
  reviewed_by TEXT,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_atd_suggestions_status ON atd_rule_suggestions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atd_suggestions_creator ON atd_rule_suggestions(created_by, created_at DESC);

-- Rule versions table
CREATE TABLE IF NOT EXISTS atd_rule_versions (
  id TEXT PRIMARY KEY DEFAULT ('ver_' || substr(md5(random()::text), 1, 20)),
  rule_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  rule_snapshot JSONB NOT NULL,
  diff JSONB,
  expected_impact JSONB,
  overlap_analysis JSONB,
  created_by TEXT,
  approved_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  UNIQUE(rule_id, version)
);

CREATE INDEX IF NOT EXISTS idx_atd_versions_rule ON atd_rule_versions(rule_id, version DESC);

-- Rule audits table
CREATE TABLE IF NOT EXISTS atd_rule_audits (
  id TEXT PRIMARY KEY DEFAULT ('audit_' || substr(md5(random()::text), 1, 20)),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  payload JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atd_audits_actor ON atd_rule_audits(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atd_audits_action ON atd_rule_audits(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atd_audits_resource ON atd_rule_audits(resource_type, resource_id, created_at DESC);

-- Dry-run cache table
CREATE TABLE IF NOT EXISTS atd_dryrun_cache (
  id TEXT PRIMARY KEY DEFAULT ('cache_' || substr(md5(random()::text), 1, 20)),
  rule_hash CHAR(64) NOT NULL,
  sample_hash CHAR(64) NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(rule_hash, sample_hash)
);

CREATE INDEX IF NOT EXISTS idx_atd_dryrun_expires ON atd_dryrun_cache(expires_at) WHERE expires_at IS NOT NULL;

-- ========================================
-- SECTION 5: Verify Migration
-- ========================================

DO $$
DECLARE
  users_count INTEGER;
  risk_users_count INTEGER;
  rules_count INTEGER;
  txns_count INTEGER;
  samples_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO users_count FROM atd_users;
  SELECT COUNT(*) INTO risk_users_count FROM atd_risk_users;
  SELECT COUNT(*) INTO rules_count FROM atd_fraud_rules;
  SELECT COUNT(*) INTO txns_count FROM atd_transactions;
  SELECT COUNT(*) INTO samples_count FROM atd_sample_transactions;

  RAISE NOTICE '';
  RAISE NOTICE '✅ ATD Migration Complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Migrated tables:';
  RAISE NOTICE '  users → atd_users (% rows)', users_count;
  RAISE NOTICE '  risk_users → atd_risk_users (% rows)', risk_users_count;
  RAISE NOTICE '  fraud_rules → atd_fraud_rules (% rows)', rules_count;
  RAISE NOTICE '  transactions → atd_transactions (% rows)', txns_count;
  RAISE NOTICE '  sample_transactions → atd_sample_transactions (% rows)', samples_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New Sprint 2 tables created:';
  RAISE NOTICE '  - atd_transactions_proj (empty, run backfill next)';
  RAISE NOTICE '  - atd_rule_suggestions';
  RAISE NOTICE '  - atd_rule_versions';
  RAISE NOTICE '  - atd_rule_audits';
  RAISE NOTICE '  - atd_dryrun_cache';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Backfill projection table: node migrations/003_atd_backfill_projection.js';
  RAISE NOTICE '  2. Update code to reference atd_* tables (see code updates script)';
  RAISE NOTICE '  3. Update .env if needed';
  RAISE NOTICE '  4. Test application with renamed tables';
  RAISE NOTICE '';
  RAISE NOTICE 'To rollback (if needed within same transaction):';
  RAISE NOTICE '  ROLLBACK;  -- Only works if you ran this in a BEGIN/COMMIT block';
  RAISE NOTICE '';
END $$;
