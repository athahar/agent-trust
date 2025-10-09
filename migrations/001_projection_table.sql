-- migrations/001_projection_table.sql
-- Projection table for fast dry-run analysis (no JSON parsing)
-- Created: 2025-02-10 (Sprint 2, Phase 2A)

CREATE TABLE IF NOT EXISTS transactions_proj (
  txn_id              VARCHAR(50) PRIMARY KEY,
  timestamp           TIMESTAMPTZ NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  hour                SMALLINT CHECK (hour >= 0 AND hour <= 23),
  device              VARCHAR(20),
  agent_id            VARCHAR(50),
  partner             VARCHAR(50),
  intent              VARCHAR(50),
  decision            VARCHAR(20) NOT NULL,
  flagged             BOOLEAN DEFAULT FALSE,
  disputed            BOOLEAN DEFAULT FALSE,
  declined            BOOLEAN DEFAULT FALSE,
  account_age_days    INTEGER,
  is_first_transaction BOOLEAN DEFAULT FALSE,
  triggered_rule_ids  JSONB DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast querying (critical for <2s dry-run SLA)
CREATE INDEX IF NOT EXISTS idx_proj_decision_ts
  ON transactions_proj(decision, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_proj_device
  ON transactions_proj(device)
  WHERE device IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proj_agent_id
  ON transactions_proj(agent_id)
  WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proj_partner
  ON transactions_proj(partner)
  WHERE partner IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proj_intent
  ON transactions_proj(intent)
  WHERE intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proj_amount
  ON transactions_proj(amount);

CREATE INDEX IF NOT EXISTS idx_proj_hour
  ON transactions_proj(hour);

CREATE INDEX IF NOT EXISTS idx_proj_flagged
  ON transactions_proj(flagged)
  WHERE flagged = true;

CREATE INDEX IF NOT EXISTS idx_proj_disputed
  ON transactions_proj(disputed)
  WHERE disputed = true;

CREATE INDEX IF NOT EXISTS idx_proj_declined
  ON transactions_proj(declined)
  WHERE declined = true;

CREATE INDEX IF NOT EXISTS idx_proj_first_txn
  ON transactions_proj(is_first_transaction)
  WHERE is_first_transaction = true;

-- GIN index for triggered_rule_ids (fast containment queries)
CREATE INDEX IF NOT EXISTS idx_proj_triggered
  ON transactions_proj USING GIN (triggered_rule_ids);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_proj_device_amount
  ON transactions_proj(device, amount);

CREATE INDEX IF NOT EXISTS idx_proj_flagged_amount
  ON transactions_proj(flagged, amount)
  WHERE flagged = true;

-- Comments for documentation
COMMENT ON TABLE transactions_proj IS
  'Lean projection of transactions table for fast dry-run queries (Sprint 2 Phase 2A)';

COMMENT ON COLUMN transactions_proj.triggered_rule_ids IS
  'Array of rule IDs that matched this transaction (for overlap analysis)';
