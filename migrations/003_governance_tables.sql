-- migrations/003_governance_tables.sql
-- Governance tables for AI-assisted rule management
-- Based on ChatGPT PR 3 with enhancements
-- Implements: two-person rule, version tracking, audit trail

-- ==============================================
-- RULE SUGGESTIONS TABLE
-- Stores LLM-generated rule suggestions before approval
-- ==============================================

CREATE TABLE IF NOT EXISTS rule_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, expired
  instruction TEXT NOT NULL, -- Original natural language prompt from analyst
  generated_rule JSONB NOT NULL, -- Full rule object from LLM
  validation_result JSONB, -- Output from RuleValidator
  lint_issues JSONB, -- Output from linter (always-true, contradictions, etc.)
  impact_analysis JSONB, -- Output from impact analyzer (baseline deltas, overlap, etc.)

  -- LLM tracking
  llm_model VARCHAR(100), -- e.g., "gpt-4-turbo-2024-04-09"
  llm_prompt_sha256 VARCHAR(64), -- SHA-256 hash of prompt for deduplication
  llm_tokens_used INTEGER,
  llm_latency_ms INTEGER,
  llm_cached BOOLEAN DEFAULT FALSE,

  -- Governance
  created_by VARCHAR(255) NOT NULL, -- User ID of analyst who created suggestion
  approved_by VARCHAR(255), -- User ID of approver (must be different from created_by)
  approval_notes TEXT, -- Required notes from approver
  expected_impact TEXT, -- Approver's acknowledgment of impact

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days', -- Suggestions expire if not approved

  -- Constraints
  CONSTRAINT status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  CONSTRAINT two_person_rule CHECK (
    (status != 'approved') OR (created_by != approved_by)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON rule_suggestions (status);
CREATE INDEX IF NOT EXISTS idx_suggestions_created_by ON rule_suggestions (created_by);
CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON rule_suggestions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_prompt_hash ON rule_suggestions (llm_prompt_sha256);

-- ==============================================
-- RULE VERSIONS TABLE
-- Tracks all changes to fraud_rules (edit history)
-- ==============================================

CREATE TABLE IF NOT EXISTS rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id INTEGER NOT NULL, -- References fraud_rules.id
  version INTEGER NOT NULL, -- Version number (1, 2, 3, ...)

  -- Change tracking
  diff JSONB, -- JSON diff of what changed (before/after)
  change_type VARCHAR(50) NOT NULL, -- created, updated, disabled, enabled, deleted

  -- Rule snapshot
  rule_snapshot JSONB NOT NULL, -- Full rule object at this version
  rule_fingerprint VARCHAR(64), -- SHA-256 of rule JSON for integrity check

  -- Governance
  created_by VARCHAR(255) NOT NULL, -- User who made the change
  approved_by VARCHAR(255), -- User who approved the change (if required)
  approval_notes TEXT,
  expected_impact TEXT,
  suggestion_id UUID, -- Link to rule_suggestion if created via AI

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT version_positive CHECK (version > 0),
  CONSTRAINT change_type_check CHECK (change_type IN ('created', 'updated', 'disabled', 'enabled', 'deleted')),

  -- Foreign keys
  CONSTRAINT fk_suggestion FOREIGN KEY (suggestion_id) REFERENCES rule_suggestions(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_versions_rule_id ON rule_versions (rule_id);
CREATE INDEX IF NOT EXISTS idx_versions_created_at ON rule_versions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_created_by ON rule_versions (created_by);
CREATE INDEX IF NOT EXISTS idx_versions_suggestion_id ON rule_versions (suggestion_id);

-- Unique constraint on rule_id + version
CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_rule_version ON rule_versions (rule_id, version);

-- ==============================================
-- AUDIT LOG TABLE
-- General-purpose audit trail for all actions
-- ==============================================

CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor VARCHAR(255) NOT NULL, -- User ID who performed action
  action VARCHAR(100) NOT NULL, -- suggest_rule, approve_rule, reject_rule, dry_run, etc.
  resource_type VARCHAR(50), -- rule, suggestion, transaction, etc.
  resource_id VARCHAR(255), -- ID of affected resource

  -- Action details
  payload JSONB, -- Additional data (request body, changes, etc.)
  ip_address VARCHAR(45), -- IPv4 or IPv6
  user_agent TEXT,

  -- Result
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audits_actor ON audits (actor);
CREATE INDEX IF NOT EXISTS idx_audits_action ON audits (action);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_resource ON audits (resource_type, resource_id);

-- ==============================================
-- LLM CALLS TABLE
-- Track all LLM API calls for debugging and cost tracking
-- ==============================================

CREATE TABLE IF NOT EXISTS llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model VARCHAR(100) NOT NULL,
  prompt_hash VARCHAR(64) NOT NULL, -- SHA-256 of prompt for deduplication
  prompt_preview TEXT, -- First 500 chars of prompt for debugging

  -- Request
  function_name VARCHAR(100), -- Function name for function calling
  temperature NUMERIC(3,2),
  max_tokens INTEGER,

  -- Response
  response_json JSONB, -- Full response from LLM
  finish_reason VARCHAR(50), -- stop, length, function_call, etc.
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  tokens_total INTEGER,

  -- Performance
  latency_ms INTEGER,
  cached BOOLEAN DEFAULT FALSE,
  cache_hit_key VARCHAR(64), -- If cached, what was the cache key

  -- Status
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Linking
  suggestion_id UUID, -- Link to rule_suggestion if applicable
  actor VARCHAR(255), -- User who triggered this call

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Foreign keys
  CONSTRAINT fk_llm_suggestion FOREIGN KEY (suggestion_id) REFERENCES rule_suggestions(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_llm_model ON llm_calls (model);
CREATE INDEX IF NOT EXISTS idx_llm_prompt_hash ON llm_calls (prompt_hash);
CREATE INDEX IF NOT EXISTS idx_llm_created_at ON llm_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_suggestion_id ON llm_calls (suggestion_id);
CREATE INDEX IF NOT EXISTS idx_llm_actor ON llm_calls (actor);
CREATE INDEX IF NOT EXISTS idx_llm_success ON llm_calls (success);

-- ==============================================
-- HELPER VIEWS
-- ==============================================

-- View: Recent rule changes
CREATE OR REPLACE VIEW recent_rule_changes AS
SELECT
  rv.id,
  rv.rule_id,
  rv.version,
  rv.change_type,
  rv.created_by,
  rv.approved_by,
  rv.created_at,
  rs.instruction AS source_instruction,
  rs.llm_model
FROM rule_versions rv
LEFT JOIN rule_suggestions rs ON rv.suggestion_id = rs.id
ORDER BY rv.created_at DESC;

-- View: Pending suggestions
CREATE OR REPLACE VIEW pending_suggestions AS
SELECT
  rs.id,
  rs.instruction,
  rs.created_by,
  rs.created_at,
  rs.expires_at,
  rs.impact_analysis->>'match_rate' AS match_rate,
  rs.validation_result->>'valid' AS is_valid,
  CASE
    WHEN rs.expires_at < NOW() THEN 'expired'
    WHEN rs.validation_result->>'valid' = 'false' THEN 'invalid'
    WHEN rs.lint_issues IS NOT NULL AND jsonb_array_length(rs.lint_issues) > 0 THEN 'has_lint_issues'
    ELSE 'ready_for_approval'
  END AS approval_status
FROM rule_suggestions rs
WHERE rs.status = 'pending'
ORDER BY rs.created_at DESC;

-- View: LLM performance metrics
CREATE OR REPLACE VIEW llm_performance AS
SELECT
  model,
  COUNT(*) AS total_calls,
  SUM(tokens_total) AS total_tokens,
  AVG(latency_ms) AS avg_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 AS success_rate,
  SUM(CASE WHEN cached THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 AS cache_hit_rate
FROM llm_calls
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY model;

-- ==============================================
-- CLEANUP FUNCTION
-- Auto-expire old pending suggestions
-- ==============================================

CREATE OR REPLACE FUNCTION expire_old_suggestions()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE rule_suggestions
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run this daily (if pg_cron is available)
-- SELECT cron.schedule('expire-suggestions', '0 2 * * *', 'SELECT expire_old_suggestions();');

-- ==============================================
-- VERIFICATION QUERIES
-- ==============================================

-- After migration, verify tables created:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'rule_%' OR tablename IN ('audits', 'llm_calls');

-- Check constraints:
-- SELECT conname, contype FROM pg_constraint WHERE conrelid = 'rule_suggestions'::regclass;

