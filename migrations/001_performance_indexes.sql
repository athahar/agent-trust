-- migrations/001_performance_indexes.sql
-- Performance indexes for dry-run and overlap analysis
-- Based on ChatGPT PR 2 with enhancements
-- Run on Supabase SQL editor or via psql

-- ==============================================
-- CRITICAL INDEXES FOR DRY-RUN PERFORMANCE
-- Target: <2s p95 for 50k transaction dry-run
-- ==============================================

-- Speed up time-range queries (used in every dry-run)
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp
ON transactions (timestamp DESC);

-- Speed up agent-based filtering
CREATE INDEX IF NOT EXISTS idx_transactions_agent_id
ON transactions (agent_id);

-- Speed up device-based filtering
CREATE INDEX IF NOT EXISTS idx_transactions_device
ON transactions (device);

-- Speed up partner-based filtering
CREATE INDEX IF NOT EXISTS idx_transactions_partner
ON transactions (partner);

-- Speed up risk decision filtering (for baseline comparison)
CREATE INDEX IF NOT EXISTS idx_transactions_risk_decision
ON transactions ((fraud_engine_output->>'risk_decision'));

-- GIN index for triggered_rule_ids (critical for overlap analysis)
-- Enables fast "which transactions matched rule X?" queries
CREATE INDEX IF NOT EXISTS idx_transactions_triggered_rule_ids
ON transactions USING GIN ((fraud_engine_output->'triggered_rule_ids'));

-- Composite index for common dry-run queries
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp_device
ON transactions (timestamp DESC, device);

-- Index for flagged/disputed transactions (used in stratified sampling)
CREATE INDEX IF NOT EXISTS idx_transactions_flags
ON transactions (flagged, disputed)
WHERE flagged = true OR disputed = true;

-- Index for high-value transactions (stratified sampling)
CREATE INDEX IF NOT EXISTS idx_transactions_high_value
ON transactions (amount DESC)
WHERE amount > 5000;

-- ==============================================
-- INDEXES FOR RULES TABLE
-- ==============================================

-- Speed up enabled rules lookup (used in dry-run)
CREATE INDEX IF NOT EXISTS idx_fraud_rules_enabled
ON fraud_rules (enabled)
WHERE enabled = true;

-- Speed up rule lookup by category
CREATE INDEX IF NOT EXISTS idx_fraud_rules_category
ON fraud_rules (category);

-- ==============================================
-- VERIFY INDEX PERFORMANCE
-- ==============================================

-- After creating indexes, run these EXPLAIN ANALYZE queries to verify:

-- 1. Dry-run time-range query (should use idx_transactions_timestamp)
-- EXPLAIN ANALYZE
-- SELECT * FROM transactions
-- WHERE timestamp >= NOW() - INTERVAL '30 days'
-- ORDER BY timestamp DESC
-- LIMIT 50000;

-- 2. Overlap query (should use idx_transactions_triggered_rule_ids)
-- EXPLAIN ANALYZE
-- SELECT txn_id FROM transactions
-- WHERE fraud_engine_output->'triggered_rule_ids' @> '[123]'::jsonb
-- LIMIT 5000;

-- 3. Risk decision filter (should use idx_transactions_risk_decision)
-- EXPLAIN ANALYZE
-- SELECT COUNT(*) FROM transactions
-- WHERE fraud_engine_output->>'risk_decision' = 'block';

-- Expected: All queries should show "Index Scan" or "Bitmap Index Scan", NOT "Seq Scan"
