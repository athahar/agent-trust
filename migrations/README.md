# Database Migrations

**Sprint 2 Phase 2A:** Projection table + governance infrastructure

---

## Migration Files

### 001_projection_table.sql
Creates `transactions_proj` table for fast dry-run queries:
- Lean schema (no JSON parsing)
- Optimized indexes for common query patterns
- Supports 50k row queries < 2s

**Fields:**
- Transaction data: txn_id, timestamp, amount, hour, device, agent_id, partner, intent
- Decision data: decision, flagged, disputed, declined
- Metadata: account_age_days, is_first_transaction, triggered_rule_ids

**Indexes:**
- Decision + timestamp (time-based queries)
- Device, agent_id, partner, intent (categorical filters)
- Amount, hour (range queries)
- Flagged, disputed, declined (risk queries)
- triggered_rule_ids (GIN index for overlap analysis)

### 002_governance_tables.sql
Creates governance and audit tables:

**rule_suggestions:**
- Stores AI-generated suggestions awaiting approval
- Tracks LLM model, prompt hash, reasoning
- Status: pending, accepted, rejected, discarded

**rule_versions:**
- Complete version history of all rule changes
- Stores dry-run results at approval time
- Enables rollback and retrospective analysis

**rule_audits:**
- Comprehensive audit trail for compliance
- Tracks: actor, action, resource, IP, user agent
- 7-year retention requirement

**dryrun_cache:**
- Caches expensive dry-run computations
- TTL-based invalidation (24 hours)
- Avoids recomputing identical analyses

### 003_backfill_projection.js
Backfills `transactions_proj` from existing `transactions` table:
- Batch processing (1000 rows at a time)
- Upsert strategy (safe to re-run)
- Verification with row count checks

---

## Running Migrations

### Step 1: Apply SQL Migrations

**Option A: Via Supabase Dashboard**
1. Go to SQL Editor in Supabase dashboard
2. Copy/paste contents of `001_projection_table.sql`
3. Run query
4. Repeat for `002_governance_tables.sql`

**Option B: Via psql CLI**
```bash
psql $DATABASE_URL -f migrations/001_projection_table.sql
psql $DATABASE_URL -f migrations/002_governance_tables.sql
```

**Option C: Via Supabase CLI**
```bash
supabase db push
```

### Step 2: Backfill Projection Table

```bash
node migrations/003_backfill_projection.js
```

**Expected output:**
```
🔄 Starting projection table backfill...
📊 Found 50000 transactions to backfill

📦 Fetching batch 1 (rows 1-1000)...
  ✅ Inserted 1000 rows (total: 1000/50000)

...

✅ Backfill complete!
   Original transactions: 50000
   Projection rows:       50000
   Match:                 ✅ YES

🎉 Backfill successful! Ready for dry-run queries.
```

---

## Verification

### Check table exists
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('transactions_proj', 'rule_suggestions', 'rule_versions', 'rule_audits', 'dryrun_cache');
```

### Check row count
```sql
SELECT COUNT(*) FROM transactions_proj;
```

### Check indexes
```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'transactions_proj';
```

### Sample query (should be fast)
```sql
SELECT decision, COUNT(*)
FROM transactions_proj
GROUP BY decision;
```

---

## Rollback

If you need to undo the migrations:

```sql
-- Drop projection table
DROP TABLE IF EXISTS transactions_proj CASCADE;

-- Drop governance tables
DROP TABLE IF EXISTS rule_suggestions CASCADE;
DROP TABLE IF EXISTS rule_versions CASCADE;
DROP TABLE IF EXISTS rule_audits CASCADE;
DROP TABLE IF EXISTS dryrun_cache CASCADE;
```

---

## Performance Expectations

**Projection table queries:**
- 50k rows, simple filter (device = 'mobile'): ~100ms
- 50k rows, complex filter (3+ conditions): ~200ms
- 50k rows with aggregation (GROUP BY): ~150ms
- Target: 50k row dry-run < 2s (p95)

**Index usage:**
- Check query plan: `EXPLAIN ANALYZE SELECT ...`
- Ensure indexes used: look for "Index Scan" (not "Seq Scan")
- If seq scan on large table: add missing index

---

## Next Steps

After migrations complete:
1. ✅ Verify tables created
2. ✅ Verify row counts match
3. ✅ Test sample queries
4. 🔄 Implement dry-run engine (Phase 2B)
5. 🔄 Implement overlap analyzer (Phase 2C)
