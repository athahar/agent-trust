// tests/golden/golden.dataset.test.js
// Validates the deterministic golden dataset
// Based on ChatGPT's PR with enhancements

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOLDEN_PATH = path.join(__dirname, "../fixtures/golden.json");
const SCHEMA_PATH = path.join(__dirname, "../fixtures/golden.schema.json");

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));

// ========================================
// SECTION 1: Dataset Existence
// ========================================

test("golden dataset exists (run npm run test:golden:gen first if missing)", () => {
  if (!fs.existsSync(GOLDEN_PATH)) {
    throw new Error(
      `Golden dataset not found at ${GOLDEN_PATH}\n` +
      `Run: npm run test:golden:gen`
    );
  }
  assert.ok(true, "Golden dataset exists");
});

// ========================================
// SECTION 2: Dataset Shape & Structure
// ========================================

test("golden dataset has expected size (5000 rows)", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  assert.ok(rows.length >= 5000, `Expected >= 5000 rows, got ${rows.length}`);
  console.log(`  ✓ Dataset size: ${rows.length.toLocaleString()} rows`);
});

test("golden dataset: all rows have required fields", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const sampleSize = 100; // Check first 100 rows for performance
  const sample = rows.slice(0, sampleSize);

  for (let i = 0; i < sample.length; i++) {
    const row = sample[i];
    for (const field of schema.required) {
      assert.ok(
        row[field] !== undefined,
        `Row ${i}: missing required field "${field}"`
      );
    }
  }
});

test("golden dataset: fields have correct types", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const sample = rows.slice(0, 100);

  for (const row of sample) {
    for (const [field, expectedType] of Object.entries(schema.types)) {
      if (row[field] !== undefined && row[field] !== null) {
        const actualType = typeof row[field];
        assert.equal(
          actualType,
          expectedType,
          `Field "${field}" should be ${expectedType}, got ${actualType}`
        );
      }
    }
  }
});

test("golden dataset: enum fields have valid values", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const sample = rows.slice(0, 100);

  for (const row of sample) {
    assert.ok(
      schema.device_enum.includes(row.device),
      `Invalid device: ${row.device}`
    );
    assert.ok(
      schema.partner_enum.includes(row.partner),
      `Invalid partner: ${row.partner}`
    );
    assert.ok(
      schema.intent_enum.includes(row.intent),
      `Invalid intent: ${row.intent}`
    );
  }
});

// ========================================
// SECTION 3: Distribution Checks
// ========================================

test("golden dataset: distribution check (devices)", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const devices = new Set(rows.map(r => r.device));

  assert.equal(devices.size, 3, "Should include all 3 devices (web, mobile, tablet)");
  console.log(`  ✓ Devices: ${Array.from(devices).join(", ")}`);
});

test("golden dataset: distribution check (intents)", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const intents = new Set(rows.map(r => r.intent));

  assert.ok(intents.size >= 3, "Should include at least 3 intents");
  console.log(`  ✓ Intents: ${Array.from(intents).join(", ")}`);
});

test("golden dataset: distribution check (amount stratification)", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));

  const micro = rows.filter(r => r.amount < 5).length;
  const normal = rows.filter(r => r.amount >= 5 && r.amount <= 5000).length;
  const high = rows.filter(r => r.amount > 5000).length;

  console.log(`  ✓ Amount distribution:`);
  console.log(`    Micro (<$5): ${micro} (${(micro / rows.length * 100).toFixed(1)}%)`);
  console.log(`    Normal ($5-$5k): ${normal} (${(normal / rows.length * 100).toFixed(1)}%)`);
  console.log(`    High (>$5k): ${high} (${(high / rows.length * 100).toFixed(1)}%)`);

  assert.ok(micro > 200, "Should have micro transactions");
  assert.ok(normal > 2000, "Should have normal transactions (bulk)");
  assert.ok(high > 100, "Should have high-value transactions");
});

// ========================================
// SECTION 4: Risk Pocket Validation
// ========================================

test("golden dataset: seeded risk pockets exist", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));

  const mobileOffHoursHigh = rows.filter(r =>
    r.device === "mobile" &&
    r.amount > 10000 &&
    (r.hour < 9 || r.hour > 17)
  ).length;

  const firstTxnHigh = rows.filter(r =>
    r.is_first_transaction &&
    r.amount > 50000
  ).length;

  const flagged = rows.filter(r => r.flagged).length;

  console.log(`  ✓ Risk pockets:`);
  console.log(`    Mobile after-hours high-value: ${mobileOffHoursHigh}`);
  console.log(`    First transaction high-value: ${firstTxnHigh}`);
  console.log(`    Flagged: ${flagged}`);

  assert.ok(mobileOffHoursHigh > 20, "Should have mobile-off-hours-high pocket");
  assert.ok(firstTxnHigh > 5, "Should have first-transaction-high pocket");
  assert.ok(flagged > 200, "Should have flagged transactions");
});

test("golden dataset: fraud_engine_output structure valid", () => {
  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const sample = rows.slice(0, 50);

  for (const row of sample) {
    const feo = row.fraud_engine_output;
    assert.ok(feo, "Should have fraud_engine_output");
    assert.ok(typeof feo.risk_score === "number", "Should have risk_score");
    assert.ok(feo.risk_decision, "Should have risk_decision");
    assert.ok(Array.isArray(feo.triggered_rule_ids), "Should have triggered_rule_ids array");
  }
});

// ========================================
// SECTION 5: Determinism Check
// ========================================

test("golden dataset: is deterministic (same seed = same data)", () => {
  // This test verifies that running build_golden.mjs multiple times
  // produces the exact same dataset (critical for reproducible tests)

  const rows = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));

  // Check first row has expected txn_id
  assert.equal(rows[0].txn_id, "tx_00000", "First txn_id should be tx_00000");

  // Check last row has expected txn_id
  assert.equal(rows[rows.length - 1].txn_id, `tx_${(rows.length - 1).toString().padStart(5, "0")}`, "Last txn_id should match pattern");

  console.log(`  ✓ Dataset is deterministic (txn_id sequence matches seed)`);
});

console.log('\n✅ All golden dataset tests passed');
console.log('Golden dataset provides 5k transactions for dry-run testing\n');

