// src/lib/dryRunEngine.js
// Dry-run engine for impact analysis (Sprint 2 Phase 2B)
// Computes baseline vs proposed deltas using stratified sampling

import { createClient } from '@supabase/supabase-js';
import { evaluateConditions } from './ruleEngine.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

/**
 * Stratified sampling from transactions_proj
 * Returns 5 strata: recent, weekend, flagged, high-value, random
 *
 * @param {number} sampleSize - Total sample size (default 50000)
 * @returns {Promise<Array>} Array of transaction objects
 */
export async function sampleTransactions(sampleSize = 50000) {
  if (!supabase) {
    console.warn('[sampleTransactions] No Supabase client (missing env vars)');
    return [];
  }

  const strataSizes = {
    recent: Math.floor(sampleSize * 0.3),      // 30% - most recent transactions
    weekend: Math.floor(sampleSize * 0.15),    // 15% - weekend transactions
    flagged: Math.floor(sampleSize * 0.2),     // 20% - flagged transactions
    highValue: Math.floor(sampleSize * 0.15),  // 15% - high-value (>$5k)
    random: Math.floor(sampleSize * 0.2)       // 20% - pure random
  };

  try {
    const samples = [];

    // Strata 1: Recent (last 30 days)
    const { data: recentData, error: recentError } = await supabase
      .from('atd_transactions_proj')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(strataSizes.recent);

    if (recentError) throw recentError;
    if (recentData) samples.push(...recentData);

    // Strata 2: Weekend (hour 0-9 or 18-23, or Sat/Sun)
    const { data: weekendData, error: weekendError } = await supabase
      .from('atd_transactions_proj')
      .select('*')
      .or('hour.lt.9,hour.gte.18')
      .order('timestamp', { ascending: false })
      .limit(strataSizes.weekend);

    if (weekendError) throw weekendError;
    if (weekendData) samples.push(...weekendData);

    // Strata 3: Flagged
    const { data: flaggedData, error: flaggedError } = await supabase
      .from('atd_transactions_proj')
      .select('*')
      .eq('flagged', true)
      .order('timestamp', { ascending: false })
      .limit(strataSizes.flagged);

    if (flaggedError) throw flaggedError;
    if (flaggedData) samples.push(...flaggedData);

    // Strata 4: High-value (>$5k)
    const { data: highValueData, error: highValueError } = await supabase
      .from('atd_transactions_proj')
      .select('*')
      .gte('amount', 5000)
      .order('amount', { ascending: false })
      .limit(strataSizes.highValue);

    if (highValueError) throw highValueError;
    if (highValueData) samples.push(...highValueData);

    // Strata 5: Random
    // Note: Supabase doesn't have RANDOM() out of box, use offset trick
    const { count: totalCount } = await supabase
      .from('atd_transactions_proj')
      .select('*', { count: 'exact', head: true });

    if (totalCount) {
      const randomOffsets = Array.from(
        { length: Math.min(strataSizes.random, totalCount) },
        () => Math.floor(Math.random() * totalCount)
      ).sort((a, b) => a - b);

      for (const offset of randomOffsets) {
        const { data: randomRow } = await supabase
          .from('atd_transactions_proj')
          .select('*')
          .range(offset, offset)
          .limit(1);
        if (randomRow && randomRow.length > 0) {
          samples.push(randomRow[0]);
        }
      }
    }

    // Deduplicate by txn_id (strata may overlap)
    const uniqueSamples = Array.from(
      new Map(samples.map(s => [s.txn_id, s])).values()
    );

    console.log(`[sampleTransactions] Sampled ${uniqueSamples.length} unique transactions (target: ${sampleSize})`);
    console.log(`  Recent: ${recentData?.length || 0}, Weekend: ${weekendData?.length || 0}, Flagged: ${flaggedData?.length || 0}, High-value: ${highValueData?.length || 0}, Random: ${strataSizes.random}`);

    return uniqueSamples;

  } catch (err) {
    console.error('[sampleTransactions] Error:', err);
    throw err;
  }
}

/**
 * Evaluate a single rule on a single transaction
 *
 * @param {Object} rule - Rule object with conditions array
 * @param {Object} transaction - Transaction object
 * @returns {string} Decision: 'block', 'review', or 'allow'
 */
export function evaluateRule(rule, transaction) {
  // Use existing rule engine from ruleEngine.js
  const matches = evaluateConditions(rule.conditions || [], transaction);

  if (matches) {
    return rule.decision || 'review'; // If rule matches, return rule's decision
  }

  return 'allow'; // If rule doesn't match, allow by default
}

/**
 * Compute decision rates from results array
 *
 * @param {Array} results - Array of {baseline_decision, proposed_decision}
 * @param {string} decisionField - 'baseline_decision' or 'proposed_decision'
 * @returns {Object} Rates by decision type
 */
function computeRates(results, decisionField) {
  const total = results.length;
  if (total === 0) return { block: 0, review: 0, allow: 0 };

  const counts = results.reduce((acc, r) => {
    const decision = r[decisionField] || 'allow';
    acc[decision] = (acc[decision] || 0) + 1;
    return acc;
  }, {});

  return {
    block: ((counts.block || 0) / total * 100).toFixed(2),
    review: ((counts.review || 0) / total * 100).toFixed(2),
    allow: ((counts.allow || 0) / total * 100).toFixed(2)
  };
}

/**
 * Compute deltas between baseline and proposed
 *
 * @param {Object} baseline - Baseline rates
 * @param {Object} proposed - Proposed rates
 * @returns {Object} Delta rates (proposed - baseline)
 */
function computeDeltas(baseline, proposed) {
  return {
    block: (parseFloat(proposed.block) - parseFloat(baseline.block)).toFixed(2),
    review: (parseFloat(proposed.review) - parseFloat(baseline.review)).toFixed(2),
    allow: (parseFloat(proposed.allow) - parseFloat(baseline.allow)).toFixed(2)
  };
}

/**
 * Get top N examples of changed transactions
 *
 * @param {Array} results - Array of evaluation results
 * @param {number} limit - Number of examples to return
 * @returns {Array} Top examples with PII stripped
 */
function getTopExamples(results, limit = 10) {
  const changed = results.filter(r => r.baseline_decision !== r.proposed_decision);

  return changed.slice(0, limit).map(r => ({
    txn_id: r.txn.txn_id,
    amount: r.txn.amount,
    device: r.txn.device,
    agent_id: r.txn.agent_id ? '[REDACTED]' : null, // PII stripping
    baseline: r.baseline_decision,
    proposed: r.proposed_decision,
    change: `${r.baseline_decision} → ${r.proposed_decision}`
  }));
}

/**
 * Estimate false positive risk based on flagged transaction patterns
 *
 * @param {Array} results - Evaluation results
 * @returns {Object} FP risk estimate
 */
function estimateFPRisk(results) {
  const changedToBlockOrReview = results.filter(r =>
    r.baseline_decision === 'allow' &&
    (r.proposed_decision === 'block' || r.proposed_decision === 'review')
  );

  const unflaggedCount = changedToBlockOrReview.filter(r => !r.txn.flagged).length;
  const totalChanged = changedToBlockOrReview.length;

  const fpRate = totalChanged > 0 ? (unflaggedCount / totalChanged * 100).toFixed(2) : 0;

  let riskLevel = 'low';
  if (fpRate > 70) riskLevel = 'high';
  else if (fpRate > 40) riskLevel = 'medium';

  return {
    unflagged_caught: unflaggedCount,
    total_caught: totalChanged,
    fp_rate_estimate: fpRate,
    risk_level: riskLevel,
    warning: fpRate > 70 ? 'High false positive risk - rule may be too aggressive' : null
  };
}

/**
 * Run dry-run analysis for a proposed rule
 *
 * @param {Object} rule - Rule object with conditions and decision
 * @param {number} sampleSize - Sample size for analysis (default 50000)
 * @returns {Promise<Object>} Dry-run results with metrics and examples
 */
export async function dryRunRule(rule, sampleSize = 50000) {
  console.log(`[dryRunRule] Starting dry-run for rule: ${rule.ruleset_name || 'unnamed'}`);
  console.log(`[dryRunRule] Sample size: ${sampleSize}`);

  try {
    // 1. Get stratified sample
    const sample = await sampleTransactions(sampleSize);

    if (sample.length === 0) {
      return {
        error: 'No transactions available for dry-run',
        sample_size: 0
      };
    }

    // 2. Evaluate rule on each transaction
    const results = sample.map(txn => ({
      txn: txn,
      baseline_decision: txn.decision || 'allow',
      proposed_decision: evaluateRule(rule, txn)
    }));

    // 3. Compute metrics
    const baseline = computeRates(results, 'baseline_decision');
    const proposed = computeRates(results, 'proposed_decision');
    const deltas = computeDeltas(baseline, proposed);

    // 4. Count matches
    const matches = results.filter(r => r.proposed_decision !== 'allow').length;
    const changes = results.filter(r => r.baseline_decision !== r.proposed_decision).length;

    // 5. Get examples
    const examples = getTopExamples(results, 10);

    // 6. Estimate FP risk
    const fpRisk = estimateFPRisk(results);

    const result = {
      sample_size: results.length,
      matches: matches,
      match_rate: (matches / results.length * 100).toFixed(2),
      changes: changes,
      change_rate: (changes / results.length * 100).toFixed(2),
      baseline_rates: baseline,
      proposed_rates: proposed,
      deltas: deltas,
      sample_examples: examples,
      false_positive_risk: fpRisk,
      timestamp: new Date().toISOString()
    };

    console.log(`[dryRunRule] Complete: ${matches} matches (${result.match_rate}%), ${changes} changes (${result.change_rate}%)`);
    return result;

  } catch (err) {
    console.error('[dryRunRule] Error:', err);
    throw err;
  }
}
