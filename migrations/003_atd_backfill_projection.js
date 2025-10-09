#!/usr/bin/env node
// migrations/003_atd_backfill_projection.js
// Backfills atd_transactions_proj from atd_transactions table
// Usage: node migrations/003_atd_backfill_projection.js

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

async function backfillProjection() {
  console.log('🔄 Starting atd_transactions_proj backfill...\n');

  try {
    // 1. Count existing transactions
    const { count: totalCount, error: countError } = await supabase
      .from('atd_transactions')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;
    console.log(`📊 Found ${totalCount} transactions to backfill`);

    if (!totalCount || totalCount === 0) {
      console.log('⚠️  No transactions found. Skipping backfill.');
      return;
    }

    // 2. Fetch transactions in batches
    const batchSize = 1000;
    let offset = 0;
    let totalBackfilled = 0;

    while (offset < totalCount) {
      console.log(`\n📦 Fetching batch ${Math.floor(offset / batchSize) + 1} (rows ${offset + 1}-${Math.min(offset + batchSize, totalCount)})...`);

      const { data: transactions, error: fetchError } = await supabase
        .from('atd_transactions')
        .select('*')
        .range(offset, offset + batchSize - 1)
        .order('timestamp', { ascending: true });

      if (fetchError) throw fetchError;

      if (!transactions || transactions.length === 0) {
        console.log('  ⚠️  No more transactions to fetch');
        break;
      }

      // 3. Transform to projection format
      const projectionRows = transactions.map(txn => {
        // Extract fraud_engine_output fields
        const fraudOutput = txn.fraud_engine_output || {};
        const triggeredRuleIds = txn.triggered_rule_ids || fraudOutput.triggered_rule_ids || [];

        // Determine decision from multiple possible sources
        let decision = 'allow';
        if (txn.fraud_decision) {
          decision = txn.fraud_decision;
        } else if (fraudOutput.risk_decision) {
          decision = fraudOutput.risk_decision;
        } else if (txn.declined) {
          decision = 'block';
        } else if (txn.flagged || txn.to_review) {
          decision = 'review';
        }

        // Parse timestamp to extract hour
        const timestamp = new Date(txn.timestamp);
        const hour = timestamp.getUTCHours();

        // Use txn_id as TEXT for projection table
        const txnId = txn.txn_id.toString();

        return {
          txn_id: txnId,
          timestamp: txn.timestamp,
          amount: txn.amount,
          hour: hour,
          device: txn.device || null,
          agent_id: txn.agent_id || null,
          partner: txn.partner || null,
          intent: txn.intent || null,
          decision: decision,
          flagged: txn.flagged || false,
          disputed: txn.disputed || false,
          declined: txn.declined || false,
          account_age_days: txn.account_age_days || null,
          is_first_transaction: txn.is_first_transaction || false,
          triggered_rule_ids: triggeredRuleIds,
          created_at: txn.timestamp
        };
      });

      // 4. Insert into projection table (upsert to handle re-runs)
      const { error: insertError } = await supabase
        .from('atd_transactions_proj')
        .upsert(projectionRows, { onConflict: 'txn_id' });

      if (insertError) {
        console.error(`  ❌ Insert error:`, insertError);
        throw insertError;
      }

      totalBackfilled += projectionRows.length;
      console.log(`  ✅ Inserted ${projectionRows.length} rows (total: ${totalBackfilled}/${totalCount})`);

      offset += batchSize;
    }

    // 5. Verify backfill
    const { count: projCount, error: projCountError } = await supabase
      .from('atd_transactions_proj')
      .select('*', { count: 'exact', head: true });

    if (projCountError) throw projCountError;

    console.log(`\n✅ Backfill complete!`);
    console.log(`   Original transactions: ${totalCount}`);
    console.log(`   Projection rows:       ${projCount}`);
    console.log(`   Match:                 ${totalCount === projCount ? '✅ YES' : '❌ NO'}`);

    if (totalCount !== projCount) {
      console.warn(`\n⚠️  Warning: Row count mismatch! Expected ${totalCount}, got ${projCount}`);
      console.warn(`   This may be okay if some transactions had invalid data.`);
    }

    // 6. Sample verification
    console.log(`\n🔍 Verifying sample rows...`);
    const { data: sample, error: sampleError } = await supabase
      .from('atd_transactions_proj')
      .select('*')
      .limit(5)
      .order('timestamp', { ascending: false });

    if (sampleError) throw sampleError;

    console.log(`\n📋 Recent 5 rows in projection table:`);
    sample.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.txn_id} | $${row.amount} | ${row.device} | ${row.decision}`);
    });

    console.log(`\n🎉 Backfill successful! Ready for dry-run queries.\n`);

  } catch (err) {
    console.error('\n❌ Backfill failed:', err);
    process.exit(1);
  }
}

// Run backfill
backfillProjection();
