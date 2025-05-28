// src/lib/ruleEngine.js
import { supabase } from '../dbClient.js';

let cachedRules = null;
let lastFetched = null;
const RULE_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export async function getCachedRules() {
  const now = Date.now();
  if (!cachedRules || !lastFetched || now - lastFetched > RULE_CACHE_DURATION_MS) {
    console.log('🔄 Fetching fresh rules from Supabase');
    const { data, error } = await supabase.from('fraud_rules').select('*');
    if (error) throw new Error('Failed to fetch rules: ' + error.message);
    cachedRules = data;
    lastFetched = now;
  } else {
    console.log('✅ Using cached fraud rules');
  }
  return cachedRules;
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

    const passed = conditions.every(cond => {
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

  return {
    risk_decision: decision,
    triggered_rule_ids: triggered.map(t => t.id),
    actions_taken: triggered.map(t => t.decision),
    rule_descriptions: triggered.map(t => t.description),
    matched: triggered.map(t => t.rule),
    explanation: `Triggered rules: ${triggered.map(t => t.rule).join(', ')}`
  };
}
