const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// List all fraud rules
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('fraud_rules')
    .select('*')
    .order('priority');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Add a new fraud rule
router.post('/', async (req, res) => {
  const {
    rule_name,
    condition,
    action,
    priority,
    classification = 'AI Agent Fraud',
    enabled = true,
  } = req.body;

  const { data, error } = await supabase.from('fraud_rules').insert([
    {
      rule_name,
      condition,
      action,
      priority,
      classification,
      enabled,
    },
  ]);

  if (error) return res.status(500).json({ error });
  res.json(data);
});

module.exports = router;