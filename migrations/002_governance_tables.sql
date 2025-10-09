-- migrations/002_governance_tables.sql
-- Governance and audit tables for rule lifecycle tracking
-- Created: 2025-02-10 (Sprint 2, Phase 2A)

-- Rule suggestions from AI or analysts (before approval)
CREATE TABLE IF NOT EXISTS rule_suggestions (
  id                VARCHAR(50) PRIMARY KEY,
  rule_id           VARCHAR(50), -- NULL for new rules, set for modifications
  status            VARCHAR(20) CHECK (status IN ('pending','accepted','rejected','discarded')) DEFAULT 'pending',
  suggestion_type   VARCHAR(20) CHECK (suggestion_type IN ('new_rule','modify_rule','delete_rule')),
  generated_rule    JSONB NOT NULL,
  ai_reasoning      TEXT,
  llm_model         VARCHAR(100),
  llm_prompt_sha256 CHAR(64),
  llm_response_sha256 CHAR(64),
  instruction       TEXT, -- Original natural language instruction
  created_by        VARCHAR(255),
  reviewed_by       VARCHAR(255),
  review_notes      TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ
);

-- Rule version history (every change creates a new version)
CREATE TABLE IF NOT EXISTS rule_versions (
  id                VARCHAR(50) PRIMARY KEY,
  rule_id           VARCHAR(50) NOT NULL,
  version           INTEGER NOT NULL,
  rule_snapshot     JSONB NOT NULL, -- Complete rule at this version
  diff              JSONB, -- What changed from previous version
  expected_impact   JSONB, -- Dry-run results at time of approval
  overlap_analysis  JSONB, -- Overlap with other rules at time of approval
  created_by        VARCHAR(255),
  approved_by       VARCHAR(255),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  approved_at       TIMESTAMPTZ,
  UNIQUE(rule_id, version)
);

-- Comprehensive audit trail (compliance requirement)
CREATE TABLE IF NOT EXISTS rule_audits (
  id                VARCHAR(50) PRIMARY KEY,
  actor             VARCHAR(255) NOT NULL,
  action            VARCHAR(50) NOT NULL, -- suggest, approve, reject, enable, disable, modify
  resource_type     VARCHAR(50) NOT NULL, -- rule, suggestion, version
  resource_id       VARCHAR(50),
  payload           JSONB,
  ip_address        VARCHAR(45), -- IPv4/IPv6
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Dry-run results cache (avoid recomputing identical dry-runs)
CREATE TABLE IF NOT EXISTS dryrun_cache (
  id                VARCHAR(50) PRIMARY KEY,
  rule_hash         CHAR(64) NOT NULL, -- SHA-256 of canonical rule JSON
  sample_hash       CHAR(64) NOT NULL, -- SHA-256 of sample metadata (size, strata, timestamp range)
  result            JSONB NOT NULL, -- Complete dry-run result
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ, -- TTL for cache invalidation
  UNIQUE(rule_hash, sample_hash)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_suggestions_status
  ON rule_suggestions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_suggestions_creator
  ON rule_suggestions(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_versions_rule
  ON rule_versions(rule_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_audits_actor
  ON rule_audits(actor, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audits_action
  ON rule_audits(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audits_resource
  ON rule_audits(resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dryrun_expires
  ON dryrun_cache(expires_at)
  WHERE expires_at IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE rule_suggestions IS
  'AI-generated rule suggestions awaiting human review (Sprint 2 Phase 2A)';

COMMENT ON TABLE rule_versions IS
  'Complete version history of all rule changes with dry-run context (Sprint 2 Phase 2A)';

COMMENT ON TABLE rule_audits IS
  'Comprehensive audit trail for compliance (7-year retention required) (Sprint 2 Phase 2A)';

COMMENT ON TABLE dryrun_cache IS
  'Cache for expensive dry-run computations (TTL-based invalidation) (Sprint 2 Phase 2A)';

COMMENT ON COLUMN rule_suggestions.llm_prompt_sha256 IS
  'SHA-256 hash of prompt sent to LLM (for reproducibility and debugging)';

COMMENT ON COLUMN rule_versions.expected_impact IS
  'Dry-run results captured at approval time (for retrospective analysis)';

COMMENT ON COLUMN dryrun_cache.expires_at IS
  'Cache entries expire after 24 hours or when new transactions added';
