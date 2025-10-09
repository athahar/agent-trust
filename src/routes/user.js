// routes/user.js
import express from 'express';
import { supabase } from '../dbClient.js';

const router = express.Router();

// User summary
router.get('/:userId/summary', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('users')
    .select('user_id, name, risk_profile')
    .eq('user_id', userId)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Agent summary with enriched decision counts
router.get('/:userId/agents', async (req, res) => {
  const { userId } = req.params;
  const days = Number(req.query.period) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .rpc('agent_summary', { p_user_id: userId, p_since: since });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// routes/user.js
router.get('/user/:userId/transactions', async (req, res) => {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from('transactions')
      .select('*') // include fraud_engine_output
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });
  
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });


  // GET /user/:userId/agent/:agentId/transactions
router.get('/:userId/agent/:agentId/transactions', async (req, res) => {
    const { userId, agentId } = req.params;
  
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .order('timestamp', { ascending: false });
  
    if (error) return res.status(500).json({ error: error.message });

    // Enrich transactions similar to /simulate/:userId endpoint
    const enriched = data.map(txn => {
        const feo = txn.fraud_engine_output || {};
        return {
          ...txn,
          // Ensure fraud_engine_output is present and consistent
          fraud_engine_output: feo,
          // Promote risk_decision and risk_score to top level for easier frontend access
          risk_decision: txn.risk_decision || feo.risk_decision,
          risk_score: txn.risk_score || feo.risk_score,
          // Include other potentially useful fields from FEO at top level if needed, e.g.:
          // matched_rules: feo.matched_rule_descriptions,
          // triggered_rule_ids: feo.triggered_rule_ids,
          // rule_actions_taken: feo.rule_actions_taken
        };
      });
  
    res.json(enriched);
  });


// Raw transaction history with full fraud engine output
router.get('/simulate/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  const enriched = data.reverse().map(txn => {
    const feo = txn.fraud_engine_output || {};
    return {
      ...txn,
      status: txn.status || feo.risk_decision || 'unknown',
      fraud_engine_output: feo,
      risk_decision: feo.risk_decision,
      risk_score: feo.risk_score,
      matched_rules: feo.matched_rule_descriptions,
      triggered_rule_ids: feo.triggered_rule_ids,
      rule_actions_taken: feo.rule_actions_taken
    };
  });

  res.json(enriched);
});

export default router;