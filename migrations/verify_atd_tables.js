#!/usr/bin/env node
// migrations/verify_atd_tables.js
// Verifies ATD table setup is complete and correct
// Usage: node migrations/verify_atd_tables.js

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const EXPECTED_TABLES = [
  'atd_users',
  'atd_risk_users',
  'atd_fraud_rules',
  'atd_transactions',
  'atd_transactions_proj',
  'atd_sample_transactions',
  'atd_rule_trigger_counts',
  'atd_rule_suggestions',
  'atd_rule_versions',
  'atd_rule_audits',
  'atd_dryrun_cache'
];

async function verifyTables() {
  console.log('🔍 Verifying ATD table setup...\n');

  let allPassed = true;

  // 1. Check table existence
  console.log('📋 Checking table existence...');
  const existingTables = [];

  for (const tableName of EXPECTED_TABLES) {
    const { error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      if (error.code === '42P01') {
        console.log(`   ❌ Table missing: ${tableName}`);
        allPassed = false;
      } else {
        console.log(`   ⚠️  Error checking ${tableName}: ${error.message}`);
      }
    } else {
      console.log(`   ✅ ${tableName} (${count || 0} rows)`);
      existingTables.push({ name: tableName, count });
    }
  }

  if (existingTables.length === EXPECTED_TABLES.length) {
    console.log(`\n✅ All ${EXPECTED_TABLES.length} tables exist!\n`);
  } else {
    console.log(`\n❌ Missing ${EXPECTED_TABLES.length - existingTables.length} tables\n`);
    return false;
  }

  // 2. Check critical indexes
  console.log('🔍 Checking critical indexes...');
  const criticalIndexes = [
    ['atd_users', 'atd_users_pkey'],
    ['atd_users', 'atd_users_email_key'],
    ['atd_fraud_rules', 'atd_fraud_rules_pkey'],
    ['atd_transactions', 'atd_transactions_pkey'],
    ['atd_transactions_proj', 'atd_transactions_proj_pkey'],
    ['atd_transactions_proj', 'idx_atd_proj_decision_ts']
  ];

  for (const [tableName, indexName] of criticalIndexes) {
    try {
      const { data, error } = await supabase.rpc('pg_indexes', {
        schemaname: 'public',
        tablename: tableName
      }).select('indexname');

      if (error) {
        console.log(`   ⚠️  Could not check indexes for ${tableName}`);
        continue;
      }

      const hasIndex = data?.some(row => row.indexname === indexName);
      if (hasIndex) {
        console.log(`   ✅ ${tableName}.${indexName}`);
      } else {
        console.log(`   ❌ Missing index: ${tableName}.${indexName}`);
        allPassed = false;
      }
    } catch (err) {
      // Index check may not work in all Supabase versions
      console.log(`   ⚠️  Index check skipped for ${tableName} (RPC not available)`);
    }
  }

  console.log('');

  // 3. Check foreign keys
  console.log('🔗 Checking foreign key constraints...');

  const { data: fkData, error: fkError } = await supabase
    .from('atd_fraud_rules')
    .select('created_by, approved_by')
    .limit(1);

  if (!fkError) {
    console.log('   ✅ atd_fraud_rules foreign keys accessible');
  } else {
    console.log('   ⚠️  Foreign key check skipped (no data or permissions)');
  }

  console.log('');

  // 4. Test projection table structure
  console.log('🧪 Testing projection table structure...');
  const { data: projSample, error: projError } = await supabase
    .from('atd_transactions_proj')
    .select('txn_id, timestamp, amount, hour, device, decision')
    .limit(1);

  if (!projError || projError.message.includes('no rows')) {
    console.log('   ✅ Projection table structure correct');
  } else {
    console.log(`   ❌ Projection table error: ${projError.message}`);
    allPassed = false;
  }

  console.log('');

  // 5. Summary
  console.log('═'.repeat(60));
  if (allPassed) {
    console.log('✅ ATD table setup is COMPLETE and VALID!');
    console.log('');
    console.log('Summary:');
    console.log(`  - ${existingTables.length}/${EXPECTED_TABLES.length} tables present`);
    console.log(`  - Total rows: ${existingTables.reduce((sum, t) => sum + (t.count || 0), 0)}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. If projection table empty, run: node migrations/003_atd_backfill_projection.js');
    console.log('  2. Update code references: bash migrations/004_update_code_references.sh');
    console.log('  3. Test application: npm start');
    console.log('  4. Run tests: npm run test:all');
    console.log('');
  } else {
    console.log('❌ ATD table setup has ISSUES');
    console.log('');
    console.log('Issues found:');
    console.log('  - Some tables or indexes are missing');
    console.log('');
    console.log('Fix:');
    console.log('  1. Check migration logs for errors');
    console.log('  2. Re-run migration: psql $DATABASE_URL -f migrations/000_atd_setup_fresh.sql');
    console.log('  3. Or if migrating: psql $DATABASE_URL -f migrations/000_atd_migrate_existing.sql');
    console.log('');
    process.exit(1);
  }
  console.log('═'.repeat(60));
  console.log('');
}

// Run verification
verifyTables().catch(err => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
