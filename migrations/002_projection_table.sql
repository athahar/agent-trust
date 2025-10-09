-- migrations/002_projection_table.sql
-- Lean projection table for fast dry-run queries
-- Avoids parsing fat JSON from transactions table
-- Based on ChatGPT PR 2 with enhancements

-- ==============================================
-- PROJECTION TABLE FOR DRY-RUN PERFORMANCE
-- Target: <2s p95 for 50k transaction dry-run
-- ==============================================

-- Create projection table with only fields needed for dry-run
CREATE TABLE IF NOT EXISTS transactions_proj (
  txn_id VARCHAR(255) PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  amount NUMERIC NOT NULL,
  hour INTEGER NOT NULL,
  device VARCHAR(50) NOT NULL,
  agent_id VARCHAR(255),
  partner VARCHAR(255),
  intent VARCHAR(50),
  decision VARCHAR(50),
  flagged BOOLEAN DEFAULT FALSE,
  disputed BOOLEAN DEFAULT FALSE,
  declined BOOLEAN DEFAULT FALSE,
  account_age_days INTEGER,
  is_first_transaction BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for timestamp-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_proj_timestamp
ON transactions_proj (timestamp DESC);

-- Index for device filtering
CREATE INDEX IF NOT EXISTS idx_proj_device
ON transactions_proj (device);

-- Index for agent filtering
CREATE INDEX IF NOT EXISTS idx_proj_agent_id
ON transactions_proj (agent_id);

-- Index for high-value transactions (stratified sampling)
CREATE INDEX IF NOT EXISTS idx_proj_high_value
ON transactions_proj (amount DESC)
WHERE amount > 5000;

-- Index for flagged/disputed (stratified sampling)
CREATE INDEX IF NOT EXISTS idx_proj_flags
ON transactions_proj (flagged, disputed)
WHERE flagged = true OR disputed = true;

-- Composite index for common filters
CREATE INDEX IF NOT EXISTS idx_proj_timestamp_device
ON transactions_proj (timestamp DESC, device);

-- ==============================================
-- BACKFILL FUNCTION (Run after table creation)
-- ==============================================

-- Backfill projection table from existing transactions
-- Run this once after creating the table:
-- INSERT INTO transactions_proj (txn_id, timestamp, amount, hour, device, agent_id, partner, intent, decision, flagged, disputed, declined, account_age_days, is_first_transaction)
-- SELECT
--   txn_id,
--   timestamp,
--   amount,
--   EXTRACT(HOUR FROM timestamp)::INTEGER as hour,
--   device,
--   agent_id,
--   partner,
--   intent,
--   (fraud_engine_output->>'risk_decision')::VARCHAR as decision,
--   flagged,
--   disputed,
--   declined,
--   account_age_days,
--   is_first_transaction
-- FROM transactions
-- WHERE timestamp >= NOW() - INTERVAL '90 days'
-- ORDER BY timestamp DESC
-- LIMIT 1000000;

-- ==============================================
-- TRIGGER TO KEEP PROJECTION IN SYNC
-- ==============================================

-- Create function to sync new transactions to projection table
CREATE OR REPLACE FUNCTION sync_to_projection()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO transactions_proj (
    txn_id, timestamp, amount, hour, device, agent_id, partner, intent,
    decision, flagged, disputed, declined, account_age_days, is_first_transaction
  ) VALUES (
    NEW.txn_id,
    NEW.timestamp,
    NEW.amount,
    EXTRACT(HOUR FROM NEW.timestamp)::INTEGER,
    NEW.device,
    NEW.agent_id,
    NEW.partner,
    NEW.intent,
    NEW.fraud_engine_output->>'risk_decision',
    NEW.flagged,
    NEW.disputed,
    NEW.declined,
    NEW.account_age_days,
    NEW.is_first_transaction
  )
  ON CONFLICT (txn_id) DO UPDATE SET
    timestamp = EXCLUDED.timestamp,
    amount = EXCLUDED.amount,
    hour = EXCLUDED.hour,
    device = EXCLUDED.device,
    agent_id = EXCLUDED.agent_id,
    partner = EXCLUDED.partner,
    intent = EXCLUDED.intent,
    decision = EXCLUDED.decision,
    flagged = EXCLUDED.flagged,
    disputed = EXCLUDED.disputed,
    declined = EXCLUDED.declined,
    account_age_days = EXCLUDED.account_age_days,
    is_first_transaction = EXCLUDED.is_first_transaction;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to transactions table
DROP TRIGGER IF EXISTS trg_sync_to_projection ON transactions;
CREATE TRIGGER trg_sync_to_projection
  AFTER INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION sync_to_projection();

-- ==============================================
-- VERIFY PERFORMANCE
-- ==============================================

-- After backfilling, verify query performance:
-- EXPLAIN ANALYZE
-- SELECT * FROM transactions_proj
-- WHERE timestamp >= NOW() - INTERVAL '30 days'
-- ORDER BY timestamp DESC
-- LIMIT 50000;

-- Expected: Should complete in <500ms, using idx_proj_timestamp

