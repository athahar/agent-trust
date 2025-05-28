// src/synthetic_generator.js
// Generates a single transaction for a random user

import { v4 as uuidv4 } from 'uuid';
import { faker }        from '@faker-js/faker';
import { MERCHANTS }    from './merchants.js';

// Delegated agents
const PARTNERS = [
 "Ramp","Payman","Nekuda","OpenAI","Anthropic","Gemini", "Stripe"
];

const INTENTS = ["ecommerce_booking","travel_booking","invoice_payment","subscription"];
const DEVICES = ['web','mobile','tablet'];

export function generateTransaction(userPool) {
  const user_id  = faker.helpers.arrayElement(userPool);
  const partner  = faker.helpers.arrayElement(PARTNERS);
  const agent_id = `${user_id}_${partner}`;
  const merchant = faker.helpers.arrayElement(MERCHANTS);

  const flagged  = Math.random() < 0.05;
  const declined = flagged && Math.random() < 0.2;
  const disputed = flagged && !declined && Math.random() < 0.1;
  const toReview = flagged && !declined && Math.random() < 0.5;
  const delTime  = new Date(Date.now() - Math.random()*7*24*60*60*1000);

  return {
    txn_id:          uuidv4(),
    user_id,
    agent_id,
    partner,                              // delegated agent
    amount:          Number((Math.random()*200).toFixed(2)),
    intent:          faker.helpers.arrayElement(INTENTS),
    timestamp:       new Date().toISOString(),
    agent_token:     `token_${agent_id}`,
    flagged,
    declined,
    disputed,
    to_review:       toReview,
    seller_name:     merchant.name,       // actual merchant
    seller_url:      merchant.url,
    delegation_time: delTime.toISOString(),
    delegated:       Math.random() < 0.7,
    device:          faker.helpers.arrayElement(DEVICES)
  };
}
