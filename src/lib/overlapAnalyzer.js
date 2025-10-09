// src/lib/overlapAnalyzer.js
// Overlap analysis using Jaccard similarity (Sprint 2 Phase 2C)
// Compares proposed rule with existing rules on actual transactions

import { sampleTransactions, evaluateRule } from './dryRunEngine.js';
import { getSupabase } from '../dbclient.js';

/**
 * Compute Jaccard similarity between two sets of transaction IDs
 *
 * Jaccard = |A ∩ B| / |A ∪ B|
 * Where A = transactions matched by rule1, B = transactions matched by rule2
 *
 * @param {Set} setA - Transaction IDs matched by rule1
 * @param {Set} setB - Transaction IDs matched by rule2
 * @returns {number} Jaccard score (0-1)
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Get all active rules from database
 *
 * @returns {Promise<Array>} Array of active rule objects
 */
async function fetchActiveRules() {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[fetchActiveRules] No Supabase client');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('rulesets')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fetchActiveRules] Error:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[fetchActiveRules] Exception:', err);
    return [];
  }
}

/**
 * Analyze overlap between proposed rule and existing rules
 *
 * @param {Object} proposedRule - The new rule to analyze
 * @param {number} sampleSize - Number of transactions to use for comparison (default 10000)
 * @returns {Promise<Array>} Array of overlap results, sorted by Jaccard score (descending)
 */
export async function analyzeOverlap(proposedRule, sampleSize = 10000) {
  console.log(`[analyzeOverlap] Analyzing overlap for rule: ${proposedRule.ruleset_name || 'unnamed'}`);
  console.log(`[analyzeOverlap] Sample size: ${sampleSize}`);

  try {
    // 1. Get sample transactions
    const sample = await sampleTransactions(sampleSize);
    if (sample.length === 0) {
      console.warn('[analyzeOverlap] No sample transactions available');
      return [];
    }

    console.log(`[analyzeOverlap] Sampled ${sample.length} transactions`);

    // 2. Evaluate proposed rule on sample
    const proposedMatches = new Set();
    for (const txn of sample) {
      const decision = evaluateRule(proposedRule, txn);
      if (decision !== 'allow') {
        proposedMatches.add(txn.txn_id);
      }
    }

    console.log(`[analyzeOverlap] Proposed rule matches: ${proposedMatches.size} (${(proposedMatches.size / sample.length * 100).toFixed(1)}%)`);

    // 3. Fetch existing active rules
    const existingRules = await fetchActiveRules();
    console.log(`[analyzeOverlap] Comparing against ${existingRules.length} existing rules`);

    if (existingRules.length === 0) {
      return [];
    }

    // 4. Compute Jaccard similarity for each existing rule
    const overlaps = [];

    for (const existingRule of existingRules) {
      // Evaluate existing rule on same sample
      const existingMatches = new Set();
      for (const txn of sample) {
        const decision = evaluateRule(existingRule, txn);
        if (decision !== 'allow') {
          existingMatches.add(txn.txn_id);
        }
      }

      // Compute Jaccard
      const jaccardScore = jaccardSimilarity(proposedMatches, existingMatches);

      // Compute intersection
      const intersection = new Set([...proposedMatches].filter(x => existingMatches.has(x)));

      overlaps.push({
        rule_id: existingRule.id,
        rule_name: existingRule.ruleset_name,
        jaccard_score: parseFloat(jaccardScore.toFixed(4)),
        overlap_pct: `${(jaccardScore * 100).toFixed(1)}%`,
        intersection_count: intersection.size,
        proposed_matches: proposedMatches.size,
        existing_matches: existingMatches.size,
        warning: jaccardScore > 0.7 ? 'High overlap - consider merging or adjusting' : null
      });
    }

    // 5. Sort by Jaccard score (descending) and return top 5
    const topOverlaps = overlaps
      .sort((a, b) => b.jaccard_score - a.jaccard_score)
      .slice(0, 5);

    console.log(`[analyzeOverlap] Top overlap: ${topOverlaps[0]?.overlap_pct || 'N/A'} with ${topOverlaps[0]?.rule_name || 'N/A'}`);

    return topOverlaps;

  } catch (err) {
    console.error('[analyzeOverlap] Error:', err);
    throw err;
  }
}

/**
 * Get detailed overlap examples between two rules
 *
 * @param {Object} proposedRule - The proposed rule
 * @param {Object} existingRule - The existing rule to compare
 * @param {number} limit - Number of examples to return (default 10)
 * @returns {Promise<Array>} Array of transaction examples matched by both rules
 */
export async function getOverlapExamples(proposedRule, existingRule, limit = 10) {
  const sample = await sampleTransactions(10000);
  if (sample.length === 0) return [];

  const examples = [];

  for (const txn of sample) {
    const proposedDecision = evaluateRule(proposedRule, txn);
    const existingDecision = evaluateRule(existingRule, txn);

    // Only include if both rules match
    if (proposedDecision !== 'allow' && existingDecision !== 'allow') {
      examples.push({
        txn_id: txn.txn_id,
        amount: txn.amount,
        device: txn.device,
        proposed_decision: proposedDecision,
        existing_decision: existingDecision,
        match_type: proposedDecision === existingDecision ? 'same_decision' : 'different_decision'
      });

      if (examples.length >= limit) break;
    }
  }

  return examples;
}
