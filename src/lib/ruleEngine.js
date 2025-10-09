// src/lib/ruleEngine.js
import { supabase } from '../dbClient.js';
import { computeRiskScore } from './riskScoreEngine.js'; // ← you'll need to create this file

let cachedRules = null;
let lastFetched = null;
const RULE_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export async function getCachedRules() {
  const now = Date.now();
  if (!cachedRules || !lastFetched || now - lastFetched > RULE_CACHE_DURATION_MS) {
    console.log('🔄 Fetching fresh rules from Supabase');
    const { data, error } = await supabase.from('atd_fraud_rules').select('*');
    if (error) throw new Error('Failed to fetch rules: ' + error.message);
    cachedRules = data;
    lastFetched = now;
  } else {
    console.log('✅ Using cached fraud rules');
  }
  return cachedRules;
}

/**
 * Evaluate conditions array against a transaction
 * Extracted for reuse in dry-run engine
 *
 * @param {Array} conditions - Array of condition objects
 * @param {Object} txn - Transaction object
 * @param {Object} context - Optional context object
 * @returns {boolean} true if all conditions pass, false otherwise
 */
export function evaluateConditions(conditions, txn, context = {}) {
  if (!Array.isArray(conditions)) {
    return false;
  }

  return conditions.every(cond => {
    const val = txn[cond.field];
    const ctxVal = context[cond.value] || cond.value;

    switch (cond.op) {
      case '==': return val == ctxVal;
      case '!=': return val != ctxVal;
      case '>': return val > ctxVal;
      case '<': return val < ctxVal;
      case '>=': return val >= ctxVal;
      case '<=': return val <= ctxVal;
      case 'in': return Array.isArray(ctxVal) && ctxVal.includes(val);
      case 'not_in': return Array.isArray(ctxVal) && !ctxVal.includes(val);
      case 'contains': return typeof val === 'string' && val.includes(ctxVal);
      default: return false;
    }
  });
}

export async function evaluateTransaction(txn) {
  const now = new Date(txn.timestamp || Date.now());
  txn.hour = now.getHours();

  const delegationDate = new Date(txn.delegation_time || now);
  txn.delegation_duration_hours = Math.round(Math.abs(now - delegationDate) / 36e5);

  const context = {
    registered_agents: ['user_456_claude', 'user_123_chatgpt'],
    trusted_agent_sources: ['OpenAI', 'Anthropic'],
    approved_agent_scopes: ['read', 'write', 'transact'],
    allowed_hours_for_agent: Array.from({ length: 24 }, (_, i) => i),
  };

  const rules = await getCachedRules();
  const triggered = [];

  for (const rule of rules) {
    // Support both 'conditions' and 'condition' (for legacy or alternate schema)
    const conditions = rule.conditions || rule.condition;
    if (!Array.isArray(conditions)) {
      console.warn(`Skipping rule ${rule.id} (${rule.rule_name || 'unnamed'}) due to invalid conditions:`, conditions);
      continue;
    }

    const passed = evaluateConditions(conditions, txn, context);

    if (passed) {
      console.log(
        `✅ Rule matched: ${rule.rule_name || rule.rule}, txn:`,
        {
          txn_id: txn.txn_id,
          user_id: txn.user_id,
          agent_id: txn.agent_id,
          partner: txn.partner,
          amount: txn.amount,
          intent: txn.intent,
          timestamp: txn.timestamp
        }
      );
      triggered.push({
        rule: rule.rule_name || rule.rule,
        decision: rule.action || rule.decision,
        id: rule.id,
        description: rule.description || ''
      });
    }
  }

  let decision = 'allow';
  if (triggered.some(t => t.decision === 'block')) decision = 'block';
  else if (triggered.some(t => ['review', 'flag_review'].includes(t.decision))) decision = 'review';

//   // Calculate risk score based on triggered rules
//   let risk_score = 50; // Start with a baseline score
//   const score_increment_block = 40; // Significant increase for block
//   const score_increment_review = 20; // Moderate increase for review

//   for (const rule of triggered) {
//     if (rule.decision === 'block') {
//       risk_score += score_increment_block;
//     } else if (['review', 'flag_review'].includes(rule.decision)) {
//       risk_score += score_increment_review;
//     }
//     // Optionally, you could decrease score for 'allow' rules if they exist and are triggered
//   }

//   // Cap the score between 0 and 100
//   risk_score = Math.max(0, Math.min(100, risk_score));

    const risk_score = await computeRiskScore(txn, triggered);
    
  return {
    risk_decision: decision,
    risk_score: risk_score, // Include risk_score in the output
    triggered_rule_ids: triggered.map(t => t.id),
    actions_taken: triggered.map(t => t.decision),
    rule_descriptions: triggered.map(t => t.description),
    matched: triggered.map(t => t.rule),
    explanation: `Triggered rules: ${triggered.map(t => t.rule).join(', ')}`
  };
}
