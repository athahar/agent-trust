// src/lib/fraudEngineWrapper.js
import { evaluateTransaction } from './ruleEngine.js';
import { supabase } from '../dbClient.js';
import { v4 as uuidv4 } from 'uuid';

export async function runFraudCheckAndPersist(txn, engineVersion = 'v1.2.3') {
  const result = await evaluateTransaction(txn);

   // Ensure txn_id is always unique for each transaction
   const txn_id = txn.txn_id || uuidv4();

  const fraudOutput = {
    evaluated_at: new Date().toISOString(),
    risk_score: result.risk_score ?? null,
    risk_decision: result.risk_decision ?? 'unknown',
    manual_review_required: result.risk_decision === 'review',
    triggered_rule_ids: result.triggered_rule_ids ?? [],
    rule_actions_taken: result.actions_taken ?? [],
    matched_rule_descriptions: result.rule_descriptions ?? [],
    engine_version: engineVersion,
    risk_tags: result.risk_tags ?? [],
    explanation_summary: result.explanation ?? 'Risk assessment completed.'
  };

  const payload = {
    txn_id: txn_id,
    user_id: txn.user_id,
    agent_id: txn.agent_id,
    amount: txn.amount ?? null,
    currency: txn.currency ?? null,
    intent: txn.intent ?? null,
    partner: txn.partner ?? null,
    timestamp: txn.timestamp ?? new Date().toISOString(),
    seller_name: txn.seller_name ?? null,
    seller_url: txn.seller_url ?? null,
    checkout_time_seconds: txn.checkout_time_seconds ?? null,
    account_age_days: txn.account_age_days ?? null,
    hour: txn.hour ?? null,
    device: txn.device ?? null,
    delegation_time: txn.delegation_time ?? null,
    delegation_duration_hours: txn.delegation_duration_hours ?? null,
    delegated: txn.delegated ?? false,
    agent_token: txn.agent_token ?? null,
    flagged: txn.flagged ?? false,
    declined: txn.declined ?? false,
    disputed: txn.disputed ?? false,
    to_review: txn.to_review ?? false,
    status: result.risk_decision === 'review' ? 'flagged' : result.risk_decision,
    fraud_engine_version: engineVersion,
    fraud_engine_output: fraudOutput,
    risk_decision: fraudOutput.risk_decision,
    risk_score: result.risk_score ?? null,
    risk_tags: result.risk_tags ?? [],
    manual_review_required: result.risk_decision === 'review',
    triggered_rule_ids: result.triggered_rule_ids ?? [],
    rule_actions_taken: result.actions_taken ?? []
  };

  const { data, error } = await supabase
    .from('atd_transactions')
    .upsert([payload], { onConflict: 'txn_id' });

  if (error) {
    console.error('❌ Error saving transaction:', {
      user_id: txn.user_id,
      agent_id: txn.agent_id,
      txn_id: txn.txn_id,
      transaction: payload,
      error
    });
    throw new Error('Failed to persist transaction with fraud analysis.');
  }

  return {
    success: true,
    txn_id: data?.[0]?.txn_id,
    fraud_engine_output: fraudOutput
  };
}
