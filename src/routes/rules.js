// src/routes/rules.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../dbClient.js';
import { OpenAI } from 'openai';

const router = express.Router();

// Fetch all or only enabled rules
router.get('/', async (req, res) => {
  console.log('📥 GET /rules - Fetching rules...');
  const showAll = req.query.all === 'true';
  console.log('Show all rules:', showAll);

  const query = supabase
    .from('fraud_rules_view')
    .select('*')
    .order('priority');

  if (!showAll) {
    console.log('`Filtering for enabled rules only');
    query.eq('enabled', true);
  }

  console.log('Executing Supabase query...');
  const { data, error } = await query;
  
  if (error) {
    console.error('❌ Error fetching rules:', error);
    return res.status(500).json({ error });
  }
  
  console.log(`✅ Successfully fetched ${data?.length || 0} rules`);
  console.log('First rule sample:', data?.[0]);
  
  res.json(data);
});

// Add a new fraud rule (with all fields)
router.post('/', async (req, res) => {
  const {
    rule_name,
    condition,
    action,
    priority,
    classification,
    applies_to,
    enabled = true,
  } = req.body;

  if (!rule_name || !condition || !action || !classification || !applies_to) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const description = await generateRuleDescription(rule_name, condition, action);
  const newRule = {
    id: uuidv4(),
    rule_name,
    condition,
    action,
    priority: parseInt(priority),
    classification,
    applies_to,
    enabled,
    created_by: '11111111-1111-1111-1111-111111111111', // John
    approved_by: '22222222-2222-2222-2222-222222222222', // David
    created_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
  };

  newRule.description = description;

  const { error } = await supabase.from('atd_fraud_rules').insert(newRule);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

router.get('/:id/matches', async (req, res) => {
    const ruleId = req.params.id;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
    const { data, error } = await supabase
      .from('atd_transactions')
      .select('id, amount, user_id, timestamp, status')
      .contains('matched_rules', [ruleId])
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(10);
  
    const { count, countError } = await supabase
      .from('atd_transactions')
      .select('id', { count: 'exact', head: true })
      .contains('matched_rules', [ruleId])
      .gte('timestamp', since);
  
    if (error || countError) {
      return res.status(500).json({ error: error?.message || countError?.message });
    }
  
    res.json({ count, txns: data });
  });

// Demote a rule (disable it)
router.post('/:id/demote', async (req, res) => {
  const id = req.params.id;
  const { error } = await supabase
    .from('atd_fraud_rules')
    .update({ enabled: false })
    .eq('id', id);

  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

export default router;
