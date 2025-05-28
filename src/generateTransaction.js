// src/generateTransaction.js
import { v4 as uuidv4 } from 'uuid';
import { faker } from '@faker-js/faker';
import { MERCHANTS } from './merchants.js';

const PARTNERS = ["Ramp", "Payman", "Nekuda", "OpenAI", "Anthropic", "Gemini", "Stripe"];
const INTENTS = ["ecommerce_booking", "travel_booking", "invoice_payment", "subscription"];
const DEVICES = ['web', 'mobile', 'tablet'];

export function generateTransaction(userPool) {
  const user_id = faker.helpers.arrayElement(userPool);
  const base_partner = faker.helpers.arrayElement(PARTNERS);
  const merchant = faker.helpers.arrayElement(MERCHANTS);
  const scenarioRoll = Math.random();

  const txn = {
    txn_id: uuidv4(),
    user_id,
    agent_id: `${user_id}_${base_partner}`,
    partner: base_partner,
    intent: faker.helpers.arrayElement(INTENTS),
    timestamp: new Date().toISOString(),
    agent_token: `token_${user_id}_${base_partner}`,
    seller_name: merchant.name,
    seller_url: merchant.url,
    delegated: Math.random() < 0.5,
    delegation_time: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    device: faker.helpers.arrayElement(DEVICES),
    flagged: false,
    declined: false,
    disputed: false,
    to_review: false,
    agent_scope: faker.helpers.arrayElement(['read', 'write', 'transact', 'refund', 'delete', 'cancel'])
  };

  // Inject specific approval scenarios
  if (scenarioRoll < 0.15) {
    // Trusted user, low txn
    txn.account_age_days = 200;
    txn.amount = 120;
  } else if (scenarioRoll < 0.30) {
    // Mobile + trusted partner
    txn.device = 'mobile';
    txn.amount = 80;
    txn.partner = 'Stripe';
  } else if (scenarioRoll < 0.45) {
    // Normal checkout behavior
    txn.checkout_time_seconds = 60;
    txn.amount = 100;
  } else if (scenarioRoll < 0.60) {
    // Known merchant URL
    txn.seller_url = 'https://www.walgreens.com';
  } else if (scenarioRoll < 0.75) {
    // Short delegation with safe partner
    txn.delegated = true;
    txn.delegation_duration_hours = 6;
    txn.partner = 'Ramp';
  } else if (scenarioRoll < 0.90) {
    // Small ecommerce booking on web
    txn.intent = 'ecommerce_booking';
    txn.amount = 40;
    txn.device = 'web';
  } else {
    // Safe subscription
    txn.intent = 'subscription';
    txn.amount = 25;
    txn.partner = 'Anthropic';
  }

  return txn;
}