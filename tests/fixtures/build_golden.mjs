// tests/fixtures/build_golden.mjs
// Deterministic 5k-row golden dataset generator
// Based on ChatGPT's PR with enhancements for our schema

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT = path.join(__dirname, "golden.json");
const ROWS = 5000;
const SEED = "agent-trust-golden-v1";

/**
 * Deterministic RNG using xorshift
 * Same seed = same sequence (critical for reproducible tests)
 */
function rng(seed) {
  let h = BigInt('0x' + crypto.createHash('sha256').update(seed).digest('hex'));
  return () => {
    h ^= h << 13n;
    h ^= h >> 7n;
    h ^= h << 17n;
    h &= (1n << 64n) - 1n;
    return Number(h & 0xffffffffn) / 0xffffffff;
  };
}

const rand = rng(SEED);
const pick = arr => arr[Math.floor(rand() * arr.length)];

// Enum values from our feature catalog
const devices = ["web", "mobile", "tablet"];
const partners = ["amazon", "shopify", "stripe", "paypal", "square", "adyen", "checkout"];
const intents = ["purchase", "refund", "transfer", "withdrawal"];
const agentScopes = ["read", "write", "transact", "refund"];

/**
 * Generate stratified amounts (matches our dry-run sampling strategy)
 */
function randomAmount() {
  const p = rand();
  if (p < 0.10) return +(rand() * 5).toFixed(2);           // Micro (<$5)
  if (p < 0.92) return +(rand() * 4995 + 5).toFixed(2);    // Normal ($5-$5000)
  else return +(rand() * 94000 + 5000).toFixed(2);         // High ($5k-$99k)
}

/**
 * Generate timestamp within last N days
 */
function tsWithinLastDays(days) {
  const now = Date.now();
  const past = now - days * 86400000;
  const t = past + Math.floor(rand() * (now - past));
  return new Date(t).toISOString();
}

/**
 * Generate a single transaction row
 * Includes all fields from our feature catalog
 */
function makeRow(i) {
  // Explicitly seed first-transaction high-value cases (rows 100-119)
  const isFirstTxnHighValue = (i >= 100 && i < 120);

  const hour = Math.floor(rand() * 24);
  const device = pick(devices);
  let amount = randomAmount();
  const partner = pick(partners);
  const intent = pick(intents);
  let account_age_days = Math.floor(rand() * 3650); // 0-10 years
  let is_first_transaction = account_age_days < 1 && rand() < 0.5;

  // Force first-transaction high-value for seeded rows
  if (isFirstTxnHighValue) {
    account_age_days = 0;
    is_first_transaction = true;
    amount = +(rand() * 49000 + 50000).toFixed(2); // $50k-$99k
  }

  const flagged = rand() < 0.06; // 6% flagged rate
  const declined = flagged && rand() < 0.20; // 20% of flagged are declined
  const disputed = flagged && !declined && rand() < 0.10; // 10% of flagged are disputed

  // Seed risk pockets (for testing rule matching)
  const risky = (
    // High-value mobile after hours
    (device === "mobile" && amount > 10000 && (hour < 9 || hour > 17)) ||
    // First transaction high value
    (is_first_transaction && amount > 50000) ||
    // Previously flagged
    flagged
  );

  return {
    txn_id: `tx_${i.toString().padStart(5, "0")}`,
    user_id: `u_${Math.floor(rand() * 200).toString().padStart(4, "0")}`,
    agent_id: partner, // Use partner as agent for simplicity
    partner,
    amount,
    currency: "USD",
    intent,
    timestamp: tsWithinLastDays(30),
    seller_name: `seller_${Math.floor(rand() * 50)}`,
    device,
    hour,
    account_age_days,
    is_first_transaction,
    flagged,
    declined,
    disputed,
    agent_scope: pick(agentScopes),
    fraud_engine_output: {
      evaluated_at: tsWithinLastDays(1),
      risk_score: risky ? Math.floor(rand() * 30 + 70) : Math.floor(rand() * 50 + 20), // 70-100 if risky, 20-70 if not
      risk_decision: risky ? (rand() < 0.6 ? "block" : "review") : "allow",
      triggered_rule_ids: risky ? [Math.floor(rand() * 10) + 1] : [],
      actions_taken: risky ? [rand() < 0.6 ? "block" : "review"] : ["allow"],
      rule_descriptions: risky ? ["seeded risk pocket"] : [],
      matched: risky ? [`risk-rule-${Math.floor(rand() * 5)}`] : [],
      explanation: risky ? "High-risk transaction pattern detected" : "No risk indicators found"
    }
  };
}

function main() {
  const rows = Array.from({ length: ROWS }, (_, i) => makeRow(i));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 0)); // Compact JSON (no indentation)
  console.log(`✅ Generated ${ROWS} deterministic transactions → ${path.relative(process.cwd(), OUT)}`);
  console.log(`   Seed: ${SEED} (same seed = same dataset)`);

  // Print distribution stats
  const stats = {
    micro: rows.filter(r => r.amount < 5).length,
    normal: rows.filter(r => r.amount >= 5 && r.amount <= 5000).length,
    high: rows.filter(r => r.amount > 5000).length,
    flagged: rows.filter(r => r.flagged).length,
    firstTxn: rows.filter(r => r.is_first_transaction).length,
    mobileOffHours: rows.filter(r => r.device === "mobile" && r.amount > 10000 && (r.hour < 9 || r.hour > 17)).length
  };

  console.log(`   Distribution: ${stats.micro} micro, ${stats.normal} normal, ${stats.high} high-value`);
  console.log(`   Risk pockets: ${stats.flagged} flagged, ${stats.firstTxn} first-txn, ${stats.mobileOffHours} mobile-off-hours-high`);
}

main();
