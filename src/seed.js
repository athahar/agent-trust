// src/seed.js
// Seeds 200 users + one txn per merchant per user

import { createClient }   from '@supabase/supabase-js';
import { faker }          from '@faker-js/faker';
import { v4 as uuidv4 }   from 'uuid';
import dotenv             from 'dotenv';
import { NAMES }          from './names.js';
import { MERCHANTS }      from './merchants.js';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Delegated agents:
const PARTNERS = [
  "Ramp","Payman","Nekuda","OpenAI","Anthropic","Gemini", "Stripe"
];

const INTENTS = ["ecommerce_booking","travel_booking","invoice_payment","subscription"];
const DEVICES = ['web','mobile','tablet'];

async function seed() {
  // 1) Create 200 users
  const users = NAMES.map(name => ({
    user_id:      uuidv4(),
    name,
    risk_profile: faker.number.int({ min: 20, max: 80 })
  }));
  await supabase.from('atd_users').upsert(users);

  // 2) Seed one transaction per merchant per user
  const BATCH_SIZE = 200;
  let batch = [];

  for (const u of users) {
    for (const m of MERCHANTS) {
      // pick a random delegated agent
      const partner = faker.helpers.arrayElement(PARTNERS);
      const agent   = `${u.user_id}_${partner}`;
      // flag/dispute logic
      const flagged  = Math.random() < 0.05;
      const declined = flagged && Math.random() < 0.2;
      const disputed = flagged && !declined && Math.random() < 0.1;
      const toReview = flagged && !declined && Math.random() < 0.5;
      const delTime  = faker.date.past({ years: 1 });

      batch.push({
        txn_id:          uuidv4(),
        user_id:         u.user_id,
        agent_id:        agent,
        partner,                             // delegated agent
        amount:          Number((Math.random()*200).toFixed(2)),
        intent:          faker.helpers.arrayElement(INTENTS),
        timestamp:       faker.date.recent({ days: 30 }).toISOString(),
        agent_token:     `token_${agent}`,
        flagged,
        declined,
        disputed,
        to_review:       toReview,
        seller_name:     m.name,             // actual merchant
        seller_url:      m.url,
        delegation_time: delTime.toISOString(),
        delegated:       Math.random() < 0.7,
        device:          faker.helpers.arrayElement(DEVICES)
      });

      if (batch.length >= BATCH_SIZE) {
        await supabase.from('atd_transactions').insert(batch);
        batch = [];
      }
    }
  }

  if (batch.length) {
    await supabase.from('atd_transactions').insert(batch);
  }

  console.log('✅ Seed complete');
  process.exit(0);
}

seed().catch(console.error);
