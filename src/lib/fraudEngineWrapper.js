// src/lib/fraudEngineWrapper.js
import { evaluateTransaction } from './ruleEngine.js';
import { supabase } from '../dbClient.js';

export async function runFraudCheckAndPersist(txn, engineVersion = 'v1.2.3') {
  const result = await evaluateTransaction(txn);

  const fraudOutput = {
    evaluated_at: new Date().toISOString(),
    risk_score: result.risk_score,
    risk_decision: result.risk_decision,
    manual_review_required: result.risk_decision === 'review',
    triggered_rule_ids: result.triggered_rule_ids || [],
    rule_actions_taken: result.actions_taken || [],
    matched_rule_descriptions: result.rule_descriptions || [],
    engine_version: engineVersion,
    risk_tags: result.risk_tags || [],
    explanation_summary: result.explanation || 'Risk assessment completed.'
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert([{ 
      ...txn,
      fraud_engine_output: fraudOutput,
      status: result.risk_decision === 'review' ? 'flagged' : result.risk_decision
    }]);

  if (error) {
    console.error('❌ Error saving transaction:', {
      user_id: txn.user_id,
      agent_id: txn.agent_id,
      txn_id: txn.txn_id,
      transaction: txn,
      error
    });
    throw new Error('Failed to persist transaction with fraud analysis.');
  }

  return { success: true, txn_id: data?.[0]?.txn_id, fraud_engine_output: fraudOutput };
}
