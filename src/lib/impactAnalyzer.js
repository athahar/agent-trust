// src/lib/impactAnalyzer.js
// Impact analyzer: dry-run proposed rules against historical transactions
// Computes baseline vs proposed deltas, overlap analysis, change examples

import '../loadEnv.js'; // Must be first to load environment variables
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Simple rule evaluation for dry-run
 * Evaluates if a transaction matches rule conditions
 * @param {Object} rule - Rule with conditions array
 * @param {Object} txn - Transaction object
 * @returns {string} decision ('allow', 'review', 'block')
 */
function evaluateRule(rule, txn) {
  if (!rule || !rule.conditions || !Array.isArray(rule.conditions)) {
    return 'allow';
  }

  // Check if all conditions pass
  const allConditionsPass = rule.conditions.every(cond => {
    const val = txn[cond.field];
    const targetValue = cond.value;

    switch (cond.op) {
      case '==':
        return val == targetValue;
      case '!=':
        return val != targetValue;
      case '>':
        return val > targetValue;
      case '<':
        return val < targetValue;
      case '>=':
        return val >= targetValue;
      case '<=':
        return val <= targetValue;
      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(val);
      case 'not_in':
        return Array.isArray(targetValue) && !targetValue.includes(val);
      case 'contains':
        return typeof val === 'string' && val.includes(targetValue);
      case 'not_contains':
        return typeof val === 'string' && !val.includes(targetValue);
      case 'starts_with':
        return typeof val === 'string' && val.startsWith(targetValue);
      case 'ends_with':
        return typeof val === 'string' && val.endsWith(targetValue);
      default:
        return false;
    }
  });

  return allConditionsPass ? rule.decision : 'allow';
}

/**
 * Stratified sampling strategy for dry-run
 * Non-uniform sampling to ensure representative sample
 *
 * Strata:
 * 1. Recent transactions (last 7 days) - 40%
 * 2. Weekend transactions - 20%
 * 3. Flagged/disputed transactions - 20%
 * 4. High-value transactions (>$5k) - 10%
 * 5. Random baseline - 10%
 *
 * @param {Object} filters - Optional filters (device, agent_id, partner, date range)
 * @param {number} sampleSize - Total sample size (default: 10000)
 * @returns {Array} sampled transactions
 */
export async function stratifiedSample(filters = {}, sampleSize = 10000) {
  const strata = [];

  // Base WHERE clause for filters
  const buildWhereClause = (extraConditions = []) => {
    const conditions = [...extraConditions];

    if (filters.device) {
      conditions.push(`device = '${filters.device}'`);
    }
    if (filters.agent_id) {
      conditions.push(`agent_id = '${filters.agent_id}'`);
    }
    if (filters.partner) {
      conditions.push(`partner = '${filters.partner}'`);
    }
    if (filters.date_from) {
      conditions.push(`timestamp >= '${filters.date_from}'`);
    }
    if (filters.date_to) {
      conditions.push(`timestamp <= '${filters.date_to}'`);
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  };

  // Stratum 1: Recent transactions (40%)
  const recentSize = Math.floor(sampleSize * 0.4);
  const recentWhere = buildWhereClause([
    `timestamp >= NOW() - INTERVAL '7 days'`
  ]);

  const { data: recent, error: recentError } = await supabase
    .rpc('sample_transactions', {
      where_clause: recentWhere,
      sample_limit: recentSize
    });

  if (!recentError && recent) {
    strata.push(...recent);
  }

  // Stratum 2: Weekend transactions (20%)
  const weekendSize = Math.floor(sampleSize * 0.2);
  const weekendWhere = buildWhereClause([
    `EXTRACT(DOW FROM timestamp) IN (0, 6)`, // Sunday=0, Saturday=6
    `timestamp >= NOW() - INTERVAL '30 days'`
  ]);

  const { data: weekend, error: weekendError } = await supabase
    .rpc('sample_transactions', {
      where_clause: weekendWhere,
      sample_limit: weekendSize
    });

  if (!weekendError && weekend) {
    strata.push(...weekend);
  }

  // Stratum 3: Flagged/disputed (20%)
  const flaggedSize = Math.floor(sampleSize * 0.2);
  const flaggedWhere = buildWhereClause([
    `(flagged = true OR disputed = true)`,
    `timestamp >= NOW() - INTERVAL '60 days'`
  ]);

  const { data: flagged, error: flaggedError } = await supabase
    .rpc('sample_transactions', {
      where_clause: flaggedWhere,
      sample_limit: flaggedSize
    });

  if (!flaggedError && flagged) {
    strata.push(...flagged);
  }

  // Stratum 4: High-value (10%)
  const highValueSize = Math.floor(sampleSize * 0.1);
  const highValueWhere = buildWhereClause([
    `amount > 5000`,
    `timestamp >= NOW() - INTERVAL '60 days'`
  ]);

  const { data: highValue, error: highValueError } = await supabase
    .rpc('sample_transactions', {
      where_clause: highValueWhere,
      sample_limit: highValueSize
    });

  if (!highValueError && highValue) {
    strata.push(...highValue);
  }

  // Stratum 5: Random baseline (10%)
  const randomSize = Math.floor(sampleSize * 0.1);
  const randomWhere = buildWhereClause([
    `timestamp >= NOW() - INTERVAL '90 days'`
  ]);

  const { data: random, error: randomError } = await supabase
    .rpc('sample_transactions', {
      where_clause: randomWhere,
      sample_limit: randomSize
    });

  if (!randomError && random) {
    strata.push(...random);
  }

  // Deduplicate by txn_id (in case of overlap between strata)
  const uniqueMap = new Map();
  for (const txn of strata) {
    if (!uniqueMap.has(txn.txn_id)) {
      uniqueMap.set(txn.txn_id, txn);
    }
  }

  return Array.from(uniqueMap.values());
}

/**
 * Simple fallback sampling if RPC not available
 * Uses projection table for performance
 */
async function simpleSample(filters = {}, sampleSize = 10000) {
  let query = supabase
    .from('transactions_proj')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(sampleSize);

  if (filters.device) query = query.eq('device', filters.device);
  if (filters.agent_id) query = query.eq('agent_id', filters.agent_id);
  if (filters.partner) query = query.eq('partner', filters.partner);
  if (filters.date_from) query = query.gte('timestamp', filters.date_from);
  if (filters.date_to) query = query.lte('timestamp', filters.date_to);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Sample query failed: ${error.message}`);
  }

  return data || [];
}

/**
 * Run dry-run analysis: baseline vs proposed rule
 *
 * @param {Object} proposedRule - Rule to test
 * @param {Object} options - { filters, sampleSize, useStratified }
 * @returns {Object} impact analysis results
 */
export async function dryRunWithBaseline(proposedRule, options = {}) {
  const {
    filters = {},
    sampleSize = 10000,
    useStratified = true
  } = options;

  const startTime = Date.now();

  // 1. Get sample of transactions
  const sample = useStratified
    ? await stratifiedSample(filters, sampleSize)
    : await simpleSample(filters, sampleSize);

  if (sample.length === 0) {
    throw new Error('No transactions found matching criteria');
  }

  // 2. Run proposed rule against sample
  const proposedMatches = [];
  const changeExamples = [];

  for (const txn of sample) {
    const baselineDecision = txn.decision || 'allow'; // Current decision from fraud_engine_output
    const proposedDecision = evaluateRule(proposedRule, txn);

    if (proposedDecision !== 'allow') {
      proposedMatches.push(txn.txn_id);
    }

    // Track decision changes
    if (baselineDecision !== proposedDecision) {
      changeExamples.push({
        txn_id: txn.txn_id,
        amount: txn.amount,
        device: txn.device,
        agent_id: txn.agent_id,
        baseline: baselineDecision,
        proposed: proposedDecision,
        flagged: txn.flagged,
        disputed: txn.disputed
      });
    }
  }

  // 3. Calculate baseline rates
  const baselineBlocked = sample.filter(txn => txn.decision === 'block').length;
  const baselineReviewed = sample.filter(txn => txn.decision === 'review').length;
  const baselineAllowed = sample.filter(txn => txn.decision === 'allow').length;

  const baselineRates = {
    block_rate: (baselineBlocked / sample.length) * 100,
    review_rate: (baselineReviewed / sample.length) * 100,
    allow_rate: (baselineAllowed / sample.length) * 100
  };

  // 4. Calculate proposed rates (if this rule were added)
  // Note: This is additive - proposed rule runs AFTER existing rules
  const proposedBlocked = sample.filter(txn => {
    const proposed = evaluateRule(proposedRule, txn);
    return proposed === 'block' || txn.decision === 'block';
  }).length;

  const proposedReviewed = sample.filter(txn => {
    const proposed = evaluateRule(proposedRule, txn);
    return (proposed === 'review' && txn.decision !== 'block') ||
           (txn.decision === 'review' && proposed === 'allow');
  }).length;

  const proposedAllowed = sample.length - proposedBlocked - proposedReviewed;

  const proposedRates = {
    block_rate: (proposedBlocked / sample.length) * 100,
    review_rate: (proposedReviewed / sample.length) * 100,
    allow_rate: (proposedAllowed / sample.length) * 100
  };

  // 5. Calculate deltas
  const deltas = {
    block_delta: proposedRates.block_rate - baselineRates.block_rate,
    review_delta: proposedRates.review_rate - baselineRates.review_rate,
    allow_delta: proposedRates.allow_rate - baselineRates.allow_rate
  };

  // 6. Sort change examples by amount (show high-value changes first)
  changeExamples.sort((a, b) => b.amount - a.amount);

  const latency = Date.now() - startTime;

  return {
    sample_size: sample.length,
    matches: proposedMatches.length,
    match_rate: (proposedMatches.length / sample.length) * 100,

    baseline_rates: {
      block: baselineRates.block_rate.toFixed(2) + '%',
      review: baselineRates.review_rate.toFixed(2) + '%',
      allow: baselineRates.allow_rate.toFixed(2) + '%'
    },

    proposed_rates: {
      block: proposedRates.block_rate.toFixed(2) + '%',
      review: proposedRates.review_rate.toFixed(2) + '%',
      allow: proposedRates.allow_rate.toFixed(2) + '%'
    },

    deltas: {
      block: (deltas.block_delta >= 0 ? '+' : '') + deltas.block_delta.toFixed(2) + '%',
      review: (deltas.review_delta >= 0 ? '+' : '') + deltas.review_delta.toFixed(2) + '%',
      allow: (deltas.allow_delta >= 0 ? '+' : '') + deltas.allow_delta.toFixed(2) + '%'
    },

    change_examples: changeExamples.slice(0, 10), // Top 10 changes

    false_positive_risk: estimateFalsePositiveRisk(changeExamples),

    performance: {
      latency_ms: latency,
      stratified: useStratified
    }
  };
}

/**
 * Calculate Jaccard overlap coefficient with existing rules
 *
 * Jaccard coefficient = |A ∩ B| / |A ∪ B|
 * Where A = transactions matched by proposed rule
 *       B = transactions matched by existing rule
 *
 * @param {Array} proposedMatches - txn_ids matched by proposed rule
 * @param {number} existingRuleId - ID of existing rule to compare
 * @returns {Object} overlap analysis
 */
export async function overlapAgainstExisting(proposedMatches, existingRuleId) {
  // Get transactions matched by existing rule (from triggered_rule_ids in fraud_engine_output)
  const { data: existingMatches, error } = await supabase
    .from('transactions')
    .select('txn_id')
    .contains('fraud_engine_output->triggered_rule_ids', [existingRuleId])
    .limit(50000);

  if (error) {
    throw new Error(`Failed to fetch existing rule matches: ${error.message}`);
  }

  const existingSet = new Set(existingMatches.map(t => t.txn_id));
  const proposedSet = new Set(proposedMatches);

  // Calculate intersection and union
  const intersection = new Set([...proposedSet].filter(id => existingSet.has(id)));
  const union = new Set([...proposedSet, ...existingSet]);

  const jaccardCoefficient = union.size > 0
    ? (intersection.size / union.size)
    : 0;

  return {
    existing_rule_id: existingRuleId,
    proposed_matches: proposedSet.size,
    existing_matches: existingSet.size,
    overlap_count: intersection.size,
    jaccard_coefficient: jaccardCoefficient.toFixed(3),
    overlap_percentage: ((intersection.size / proposedSet.size) * 100).toFixed(1) + '%',
    interpretation: interpretOverlap(jaccardCoefficient)
  };
}

/**
 * Analyze overlap with ALL existing enabled rules
 * Returns top 5 overlapping rules
 */
export async function overlapWithAllRules(proposedMatches) {
  // Get all enabled rules
  const { data: enabledRules, error } = await supabase
    .from('fraud_rules')
    .select('id, ruleset_name, category')
    .eq('enabled', true);

  if (error) {
    throw new Error(`Failed to fetch enabled rules: ${error.message}`);
  }

  const overlaps = [];

  for (const rule of enabledRules) {
    try {
      const overlap = await overlapAgainstExisting(proposedMatches, rule.id);
      overlaps.push({
        ...overlap,
        ruleset_name: rule.ruleset_name,
        category: rule.category
      });
    } catch (err) {
      console.error(`Overlap analysis failed for rule ${rule.id}:`, err.message);
    }
  }

  // Sort by Jaccard coefficient (descending)
  overlaps.sort((a, b) => parseFloat(b.jaccard_coefficient) - parseFloat(a.jaccard_coefficient));

  return overlaps.slice(0, 5); // Top 5 most overlapping rules
}

/**
 * Estimate false positive risk based on change examples
 * Heuristic: if many changed transactions are NOT flagged/disputed, FP risk is higher
 */
function estimateFalsePositiveRisk(changeExamples) {
  if (changeExamples.length === 0) return 'low';

  const becameBlocked = changeExamples.filter(ex =>
    ex.baseline === 'allow' && ex.proposed === 'block'
  );

  const notFlagged = becameBlocked.filter(ex => !ex.flagged && !ex.disputed);

  const fpRate = becameBlocked.length > 0
    ? (notFlagged.length / becameBlocked.length)
    : 0;

  if (fpRate > 0.7) return 'high';
  if (fpRate > 0.4) return 'medium';
  return 'low';
}

/**
 * Interpret Jaccard coefficient
 */
function interpretOverlap(coefficient) {
  if (coefficient > 0.8) return 'Very high overlap - likely redundant';
  if (coefficient > 0.5) return 'High overlap - consider merging';
  if (coefficient > 0.3) return 'Moderate overlap - review for redundancy';
  if (coefficient > 0.1) return 'Low overlap - mostly distinct';
  return 'Minimal overlap - independent rule';
}

