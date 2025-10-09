// uploadAgenticRules.js
import { supabase } from './dbClient.js';
import fs from 'fs';

const rules = JSON.parse(fs.readFileSync('./agentic_fraud_rules.json', 'utf-8'));

for (const rule of rules) {
  const { error } = await supabase.from('atd_fraud_rules').insert(rule);
  if (error) console.error(`Error inserting rule ${rule.rule}:`, error);
  else console.log(`✅ Inserted rule: ${rule.rule}`);
}