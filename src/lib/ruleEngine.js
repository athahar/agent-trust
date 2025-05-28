const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getActiveRules() {
  const { data, error } = await supabase
    .from('fraud_rules')
    .select('*')
    .eq('enabled', true)
    .order('priority');
  if (error) throw error;
  return data;
}

// Safe evaluation: replace keywords to simulate logical check
function evaluateCondition(condition, context) {
  try {
    const expr = condition
      .replace(/\b(\w+)\b/g, match => {
        // replace each token with context reference if it exists
        return Object.prototype.hasOwnProperty.call(context, match)
          ? `context.${match}`
          : match;
      })
      .replace(/&&/g, '&&')
      .replace(/\bin\b/g, 'includes')
      .replace(/contains/g, '.includes');

    return eval(expr); // use with caution, ideally sandboxed
  } catch (err) {
    console.warn(`Failed to evaluate condition: ${condition}`, err);
    return false;
  }
}

async function evaluateTransaction(context) {
  const rules = await getActiveRules();
  const results = [];

  for (const rule of rules) {
    if (evaluateCondition(rule.condition, context)) {
      results.push({
        rule: rule.rule_name,
        action: rule.action,
        priority: rule.priority
      });
      if (rule.action === 'block') break;
    }
  }

  return {
    decision: results.find(r => r.action === 'block')?.action || 'allow',
    triggered: results
  };
}

module.exports = {
  evaluateTransaction,
  getActiveRules
};
