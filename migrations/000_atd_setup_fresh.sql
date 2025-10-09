-- migrations/000_atd_setup_fresh.sql
-- Complete ATD (Agent Trust Demo) table setup with atd_ prefix
-- For FRESH INSTALLS (no existing data)
-- If you have existing data, use 000_atd_migrate_existing.sql instead

-- ========================================
-- SECTION 1: Users & Risk Analysts
-- ========================================

-- App users table
CREATE TABLE IF NOT EXISTS atd_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  bio TEXT,
  website_url VARCHAR(500),
  avatar_url VARCHAR(500),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atd_users_email ON atd_users(email);
CREATE INDEX IF NOT EXISTS idx_atd_users_username ON atd_users(username);

COMMENT ON TABLE atd_users IS 'Application users (end users of the agent platform)';

-- Risk analysts/operators table
CREATE TABLE IF NOT EXISTS atd_risk_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atd_risk_users_email ON atd_risk_users(email);

COMMENT ON TABLE atd_risk_users IS 'Risk analysts and fraud operators who manage rules';

-- ========================================
-- SECTION 2: Fraud Rules
-- ========================================

CREATE TABLE IF NOT EXISTS atd_fraud_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  condition JSONB NOT NULL, -- NOTE: singular "condition" for backward compatibility
  action TEXT NOT NULL,
  priority INTEGER NOT NULL,
  classification TEXT DEFAULT 'AI Agent Fraud',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES atd_risk_users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES atd_risk_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  applies_to TEXT DEFAULT 'both',
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_atd_fraud_rules_enabled ON atd_fraud_rules(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_atd_fraud_rules_priority ON atd_fraud_rules(priority);
CREATE INDEX IF NOT EXISTS idx_atd_fraud_rules_created_by ON atd_fraud_rules(created_by);
CREATE INDEX IF NOT EXISTS idx_atd_fraud_rules_classification ON atd_fraud_rules(classification);

COMMENT ON TABLE atd_fraud_rules IS 'Fraud detection rules (legacy schema with singular "condition")';
COMMENT ON COLUMN atd_fraud_rules.condition IS 'JSONB array of conditions (despite singular name)';

-- ========================================
-- SECTION 3: Transactions
-- ========================================

CREATE TABLE IF NOT EXISTS atd_transactions (
  txn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  partner TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  intent TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_token TEXT,
  flagged BOOLEAN DEFAULT false,
  to_review BOOLEAN DEFAULT false,
  declined BOOLEAN DEFAULT false,
  disputed BOOLEAN DEFAULT false,
  seller_name TEXT,
  seller_url TEXT,
  delegation_time TIMESTAMPTZ,
  delegated BOOLEAN DEFAULT false,
  device TEXT,
  trust_score INTEGER,
  triggered_rules JSONB,
  trust_decision TEXT,
  account_age_days INTEGER,
  checkout_time_seconds INTEGER,
  currency TEXT,
  delegation_duration_hours INTEGER,
  hour INTEGER,
  fraud_engine_output JSONB,
  rule_id TEXT,
  rule_name TEXT,
  rule_version TEXT,
  fraud_decision TEXT,
  fraud_severity TEXT,
  fraud_explanation TEXT,
  matched_conditions JSONB,
  fraud_engine_version TEXT,
  manual_review_required BOOLEAN,
  status TEXT,
  risk_score DOUBLE PRECISION,
  risk_tags JSONB,
  triggered_rule_ids JSONB,
  rule_actions_taken JSONB
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_atd_txns_user_id ON atd_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_atd_txns_agent_id ON atd_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_atd_txns_partner ON atd_transactions(partner);
CREATE INDEX IF NOT EXISTS idx_atd_txns_timestamp ON atd_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_atd_txns_flagged ON atd_transactions(flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_atd_txns_to_review ON atd_transactions(to_review) WHERE to_review = true;
CREATE INDEX IF NOT EXISTS idx_atd_txns_declined ON atd_transactions(declined) WHERE declined = true;
CREATE INDEX IF NOT EXISTS idx_atd_txns_device ON atd_transactions(device);
CREATE INDEX IF NOT EXISTS idx_atd_txns_amount ON atd_transactions(amount);
CREATE INDEX IF NOT EXISTS idx_atd_txns_intent ON atd_transactions(intent);
CREATE INDEX IF NOT EXISTS idx_atd_txns_status ON atd_transactions(status);
CREATE INDEX IF NOT EXISTS idx_atd_txns_triggered_rule_ids ON atd_transactions USING GIN (triggered_rule_ids);

COMMENT ON TABLE atd_transactions IS 'All agent-delegated transactions with fraud detection results';
COMMENT ON COLUMN atd_transactions.user_id IS 'User ID (stored as TEXT for flexibility)';
COMMENT ON COLUMN atd_transactions.fraud_engine_output IS 'Complete output from fraud detection engine';
COMMENT ON COLUMN atd_transactions.triggered_rule_ids IS 'Array of rule IDs that matched this transaction';

-- ========================================
-- SECTION 4: Transactions Projection (Fast Queries)
-- ========================================

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

-- Optimized indexes for dry-run queries
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

-- ========================================
-- SECTION 5: Sample Transactions
-- ========================================

CREATE TABLE IF NOT EXISTS atd_sample_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  txn JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atd_sample_txns_name ON atd_sample_transactions(name);
CREATE INDEX IF NOT EXISTS idx_atd_sample_txns_created_at ON atd_sample_transactions(created_at DESC);

COMMENT ON TABLE atd_sample_transactions IS 'Sample/test transactions for rule testing';

-- ========================================
-- SECTION 6: Rule Analytics
-- ========================================

-- Note: This may be a VIEW in production, creating as table for now
CREATE TABLE IF NOT EXISTS atd_rule_trigger_counts (
  rule_id UUID,
  rule_name TEXT,
  match_count BIGINT DEFAULT 0,
  last_triggered TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_atd_rule_counts_rule_id ON atd_rule_trigger_counts(rule_id);
CREATE INDEX IF NOT EXISTS idx_atd_rule_counts_last_triggered ON atd_rule_trigger_counts(last_triggered DESC);

COMMENT ON TABLE atd_rule_trigger_counts IS 'Analytics: how often each rule triggers';

-- ========================================
-- SECTION 7: Governance Tables (Sprint 2)
-- ========================================

-- AI-generated rule suggestions awaiting approval
CREATE TABLE IF NOT EXISTS atd_rule_suggestions (
  id TEXT PRIMARY KEY DEFAULT ('sugg_' || substr(md5(random()::text), 1, 20)),
  rule_id TEXT, -- NULL for new rules, set for modifications
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

COMMENT ON TABLE atd_rule_suggestions IS 'AI-generated rule suggestions awaiting human review (Sprint 2)';

-- Rule version history
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

COMMENT ON TABLE atd_rule_versions IS 'Complete version history of all rule changes (Sprint 2)';

-- Comprehensive audit trail
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

COMMENT ON TABLE atd_rule_audits IS 'Comprehensive audit trail for compliance (7-year retention) (Sprint 2)';

-- Dry-run results cache
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

COMMENT ON TABLE atd_dryrun_cache IS 'Cache for expensive dry-run computations (Sprint 2)';

-- ========================================
-- SUCCESS MESSAGE
-- ========================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ ATD (Agent Trust Demo) tables created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created with atd_ prefix:';
  RAISE NOTICE '  - atd_users (app users)';
  RAISE NOTICE '  - atd_risk_users (fraud analysts)';
  RAISE NOTICE '  - atd_fraud_rules (detection rules)';
  RAISE NOTICE '  - atd_transactions (main transaction table)';
  RAISE NOTICE '  - atd_transactions_proj (fast query projection)';
  RAISE NOTICE '  - atd_sample_transactions (test samples)';
  RAISE NOTICE '  - atd_rule_trigger_counts (analytics)';
  RAISE NOTICE '  - atd_rule_suggestions (AI suggestions - Sprint 2)';
  RAISE NOTICE '  - atd_rule_versions (version history - Sprint 2)';
  RAISE NOTICE '  - atd_rule_audits (audit trail - Sprint 2)';
  RAISE NOTICE '  - atd_dryrun_cache (dry-run cache - Sprint 2)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Update .env with new table names (if needed)';
  RAISE NOTICE '  2. Run code updates to reference atd_* tables';
  RAISE NOTICE '  3. Seed initial data (risk users, sample transactions)';
  RAISE NOTICE '  4. Backfill projection table: node migrations/003_atd_backfill_projection.js';
  RAISE NOTICE '';
END $$;
