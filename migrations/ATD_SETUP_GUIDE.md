## ATD (Agent Trust Demo) Table Setup Guide

Complete guide for setting up all tables with `atd_` prefix.

---

## Table of Contents

1. [Overview](#overview)
2. [Table Structure](#table-structure)
3. [Setup Options](#setup-options)
4. [Step-by-Step Instructions](#step-by-step-instructions)
5. [Verification](#verification)
6. [Rollback](#rollback)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This migration adds the `atd_` prefix to all project tables for better namespace management:

### Tables Renamed:

| Old Name | New Name | Purpose |
|----------|----------|---------|
| `users` | `atd_users` | App users (end users) |
| `risk_users` | `atd_risk_users` | Fraud analysts/operators |
| `fraud_rules` | `atd_fraud_rules` | Fraud detection rules |
| `transactions` | `atd_transactions` | All transactions |
| `sample_transactions` | `atd_sample_transactions` | Test samples |
| `rule_trigger_counts` | `atd_rule_trigger_counts` | Analytics |

### New Tables Added (Sprint 2):

| Table Name | Purpose |
|-----------|---------|
| `atd_transactions_proj` | Fast query projection for dry-run |
| `atd_rule_suggestions` | AI-generated rule suggestions |
| `atd_rule_versions` | Rule version history |
| `atd_rule_audits` | Audit trail for compliance |
| `atd_dryrun_cache` | Cache for dry-run results |

---

## Table Structure

### User Tables

**atd_users** (9 columns)
```sql
id            UUID PRIMARY KEY
username      VARCHAR(50) UNIQUE
email         VARCHAR(255) UNIQUE
password_hash TEXT
bio           TEXT
website_url   VARCHAR(500)
avatar_url    VARCHAR(500)
role          VARCHAR(20) DEFAULT 'user'
created_at    TIMESTAMP DEFAULT NOW()
```

**atd_risk_users** (4 columns)
```sql
id         UUID PRIMARY KEY
name       TEXT
role       TEXT
email      TEXT UNIQUE
created_at TIMESTAMP DEFAULT NOW()
```

### Rule Management

**atd_fraud_rules** (13 columns)
```sql
id             UUID PRIMARY KEY
rule_name      TEXT NOT NULL
condition      JSONB NOT NULL  -- NOTE: singular for backward compat
action         TEXT NOT NULL
priority       INTEGER NOT NULL
classification TEXT DEFAULT 'AI Agent Fraud'
enabled        BOOLEAN DEFAULT true
created_at     TIMESTAMP DEFAULT NOW()
created_by     UUID REFERENCES atd_risk_users(id)
approved_by    UUID REFERENCES atd_risk_users(id)
approved_at    TIMESTAMP
applies_to     TEXT DEFAULT 'both'
description    TEXT
```

### Transactions

**atd_transactions** (40 columns - main transaction table)
- Core: txn_id, user_id, agent_id, partner, amount, intent, timestamp
- Flags: flagged, to_review, declined, disputed, delegated
- Metadata: device, currency, hour, account_age_days, etc.
- Fraud engine: fraud_engine_output, risk_score, triggered_rule_ids, etc.

**atd_transactions_proj** (15 columns - fast query projection)
- Subset of transaction fields optimized for dry-run queries
- 14 indexes for <2s query performance on 50k rows

### Governance (Sprint 2)

**atd_rule_suggestions** - AI suggestions awaiting review
**atd_rule_versions** - Complete version history
**atd_rule_audits** - Compliance audit trail (7-year retention)
**atd_dryrun_cache** - Performance optimization cache

---

## Setup Options

### Option A: Fresh Install (No Existing Data)

**Best for:** New projects, clean development environments

**Use:** `000_atd_setup_fresh.sql`

### Option B: Migrate Existing Data

**Best for:** Production/staging environments with existing data

**Use:** `000_atd_migrate_existing.sql`

---

## Step-by-Step Instructions

### Option A: Fresh Install

#### 1. Run SQL Migration

**Via Supabase Dashboard:**
```
1. Go to SQL Editor in Supabase
2. Copy/paste migrations/000_atd_setup_fresh.sql
3. Click "Run"
```

**Via psql CLI:**
```bash
psql $DATABASE_URL -f migrations/000_atd_setup_fresh.sql
```

**Via Supabase CLI:**
```bash
supabase db push
```

#### 2. Verify Tables Created

```bash
node migrations/verify_atd_tables.js
```

Expected output:
```
✅ Found 11 ATD tables:
  - atd_users
  - atd_risk_users
  - atd_fraud_rules
  - atd_transactions
  - atd_transactions_proj
  - atd_sample_transactions
  - atd_rule_trigger_counts
  - atd_rule_suggestions
  - atd_rule_versions
  - atd_rule_audits
  - atd_dryrun_cache
```

#### 3. Seed Initial Data (Optional)

```bash
# Create initial risk users
psql $DATABASE_URL <<EOF
INSERT INTO atd_risk_users (name, role, email) VALUES
  ('Admin User', 'Admin', 'admin@example.com'),
  ('Risk Analyst', 'Analyst', 'analyst@example.com');
EOF
```

#### 4. Skip to "Update Code References"

---

### Option B: Migrate Existing Data

#### 1. Backup Your Data

**CRITICAL:** Always backup before migration!

```bash
# Backup entire database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Or backup specific tables
pg_dump $DATABASE_URL \
  -t users \
  -t risk_users \
  -t fraud_rules \
  -t transactions \
  -t sample_transactions \
  -t rule_trigger_counts \
  > backup_atd_tables_$(date +%Y%m%d_%H%M%S).sql
```

#### 2. Run Migration SQL

**Via Supabase Dashboard:**
```
1. Go to SQL Editor
2. Copy/paste migrations/000_atd_migrate_existing.sql
3. Review the pre-flight check output
4. Click "Run"
```

**Via psql CLI:**
```bash
psql $DATABASE_URL -f migrations/000_atd_migrate_existing.sql
```

#### 3. Verify Migration

Check the output for:
- ✅ Row counts match (e.g., "users → atd_users (1250 rows)")
- ✅ Foreign keys updated
- ✅ New Sprint 2 tables created

Query to verify:
```sql
SELECT
  'atd_users' as table_name, COUNT(*) as row_count
FROM atd_users
UNION ALL
SELECT 'atd_risk_users', COUNT(*) FROM atd_risk_users
UNION ALL
SELECT 'atd_fraud_rules', COUNT(*) FROM atd_fraud_rules
UNION ALL
SELECT 'atd_transactions', COUNT(*) FROM atd_transactions;
```

#### 4. Backfill Projection Table

```bash
node migrations/003_atd_backfill_projection.js
```

Expected output:
```
📊 Found 2920 transactions to backfill
📦 Fetching batch 1 (rows 1-1000)...
  ✅ Inserted 1000 rows (total: 1000/2920)
...
✅ Backfill complete!
   Original transactions: 2920
   Projection rows:       2920
   Match:                 ✅ YES
```

---

### Update Code References (Both Options)

#### 1. Run Update Script

```bash
# Make script executable
chmod +x migrations/004_update_code_references.sh

# Run update script
bash migrations/004_update_code_references.sh
```

Expected output:
```
📦 Creating backup...
   ✅ Backup created in .backups/

📝 Updating: users table references
   Pattern: from('users') → from('atd_users')
   ✅ Done

...

✅ All code references updated!
```

#### 2. Review Changes

```bash
git diff
```

Look for:
- ✅ `.from('users')` → `.from('atd_users')`
- ✅ `.from('transactions')` → `.from('atd_transactions')`
- ✅ All table references updated

#### 3. Test Application

```bash
# Start server
npm start

# In another terminal, test endpoints
curl http://localhost:3000/api/rules/dryrun \
  -H "Content-Type: application/json" \
  -d '{
    "rule": {
      "ruleset_name": "test",
      "decision": "review",
      "conditions": [{"field": "amount", "op": ">", "value": 1000}]
    }
  }'
```

Expected: 200 response with dry-run metrics

#### 4. Run Tests

```bash
npm run test:all
```

Expected: All tests pass (88+ tests)

#### 5. Commit Changes

```bash
git add -A
git commit -m "feat: migrate to atd_ table prefix

- Rename all tables with atd_ prefix
- Add Sprint 2 governance tables
- Update all code references
- Backfill projection table

Tables: 77 tests → 88+ tests"
```

---

## Verification

### Manual Checks

#### 1. Table Existence

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'atd_%'
ORDER BY table_name;
```

Expected: 11 tables

#### 2. Row Counts

```sql
SELECT
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE tablename LIKE 'atd_%'
ORDER BY tablename;
```

#### 3. Foreign Keys

```sql
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'atd_%';
```

Expected: atd_fraud_rules → atd_risk_users (2 FKs)

#### 4. Indexes

```sql
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename LIKE 'atd_%'
ORDER BY tablename, indexname;
```

Expected: 40+ indexes

### Automated Verification

```bash
node migrations/verify_atd_tables.js
```

This script checks:
- ✅ All 11 tables exist
- ✅ Row counts > 0 (if migrated)
- ✅ Critical indexes present
- ✅ Foreign keys valid

---

## Rollback

### If Migration Fails

#### Option 1: Transaction Rollback (Immediate)

If you ran the migration in a transaction:
```sql
BEGIN;
-- Run migration
\i migrations/000_atd_migrate_existing.sql
-- If something looks wrong:
ROLLBACK;
```

#### Option 2: Restore from Backup

```bash
# Stop application first
pkill -f "node src/index.js"

# Restore from backup
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql

# Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

#### Option 3: Rename Back (Partial Migration)

```sql
ALTER TABLE atd_users RENAME TO users;
ALTER TABLE atd_risk_users RENAME TO risk_users;
ALTER TABLE atd_fraud_rules RENAME TO fraud_rules;
ALTER TABLE atd_transactions RENAME TO transactions;
ALTER TABLE atd_sample_transactions RENAME TO sample_transactions;
ALTER TABLE atd_rule_trigger_counts RENAME TO rule_trigger_counts;

-- Update foreign keys back
ALTER TABLE fraud_rules DROP CONSTRAINT fk_created_by;
ALTER TABLE fraud_rules DROP CONSTRAINT fk_approved_by;
ALTER TABLE fraud_rules
  ADD CONSTRAINT fk_created_by
  FOREIGN KEY (created_by) REFERENCES risk_users(id);
ALTER TABLE fraud_rules
  ADD CONSTRAINT fk_approved_by
  FOREIGN KEY (approved_by) REFERENCES risk_users(id);
```

### Restore Code Changes

```bash
# Restore from backup
tar -xzf .backups/pre_atd_rename_TIMESTAMP.tar.gz

# Or revert git changes
git restore .
```

---

## Troubleshooting

### Issue: "Table already exists"

**Cause:** Running fresh install when tables exist

**Fix:** Use migration script instead:
```bash
psql $DATABASE_URL -f migrations/000_atd_migrate_existing.sql
```

### Issue: "Foreign key violation"

**Cause:** atd_risk_users missing or empty

**Fix:** Create risk users first:
```sql
INSERT INTO atd_risk_users (name, role, email) VALUES
  ('Admin', 'Admin', 'admin@example.com');
```

### Issue: "Column does not exist: is_first_transaction"

**Cause:** Old transaction data missing new column

**Fix:** Migration script adds it automatically. Verify:
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'atd_transactions'
  AND column_name = 'is_first_transaction';
```

### Issue: Code still references old table names

**Cause:** Update script not run or incomplete

**Fix:**
```bash
# Re-run update script
bash migrations/004_update_code_references.sh

# Manual check
grep -r "from('users')" src/
# Should return no results
```

### Issue: Projection table empty after backfill

**Cause:** atd_transactions empty or backfill script error

**Fix:**
```bash
# Check transaction count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM atd_transactions;"

# Re-run backfill
node migrations/003_atd_backfill_projection.js
```

### Issue: Tests failing after migration

**Cause:** Tests may be mocked or have hardcoded table names

**Fix:**
1. Check test files for hardcoded table names
2. Update test fixtures
3. Ensure test database uses atd_ tables

---

## Summary

### Migration Checklist

- [ ] **Backup created** (pg_dump)
- [ ] **Migration SQL run** (fresh or existing)
- [ ] **Tables verified** (11 tables with atd_ prefix)
- [ ] **Projection backfilled** (if migrating existing data)
- [ ] **Code references updated** (bash script)
- [ ] **Git diff reviewed** (all changes correct)
- [ ] **Tests passing** (npm run test:all)
- [ ] **Application tested** (manual smoke test)
- [ ] **Changes committed** (git commit)

### Files Created

- `000_atd_setup_fresh.sql` - Fresh install
- `000_atd_migrate_existing.sql` - Migrate existing data
- `003_atd_backfill_projection.js` - Backfill projection table
- `004_update_code_references.sh` - Update code
- `ATD_SETUP_GUIDE.md` - This guide

### Next Steps

After successful migration:

1. **Phase 2B:** Test dry-run with real data
2. **Phase 2C:** Enhance overlap analysis
3. **Phase 2D:** Add API polish (rate limiting, caching)
4. **Phase 2E:** UI integration (modal, charts)

---

## Support

If you encounter issues:

1. Check troubleshooting section above
2. Review migration logs
3. Restore from backup if needed
4. Open issue with error details

**Remember:** Always backup before migrating!
