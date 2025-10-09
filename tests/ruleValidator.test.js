// tests/ruleValidator.test.js
// Comprehensive unit tests for validator and policy gate using node:test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { RuleValidator, validateValue } from '../src/lib/ruleValidator.js';
import { policyGate, stripPII, hasBlockingViolations } from '../src/lib/policyGate.js';
import { validateRuleStructure } from '../src/lib/ruleSchema.js';

// Load and display feature catalog version
const catalogPath = new URL('../src/lib/featureCatalog.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
console.log(`\n📋 Feature Catalog: v${catalog.version} (updated ${catalog.last_updated})`);

// ========================================
// SECTION 1: Rule Structure Validation
// ========================================

test('rule structure: valid rule passes', () => {
  const valid = {
    ruleset_name: "valid-check",
    description: "This is a valid rule for testing",
    decision: "review",
    conditions: [
      { field: "account_age_days", op: "==", value: null }
    ]
  };

  const result = validateRuleStructure(valid);
  assert.ok(result.valid, `Expected valid, got errors: ${result.errors.join(', ')}`);
  assert.equal(result.errors.length, 0);
});

test('rule structure: missing ruleset_name fails', () => {
  const invalid = {
    description: "Test",
    decision: "review",
    conditions: [{ field: "amount", op: ">", value: 100 }]
  };

  const result = validateRuleStructure(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('ruleset_name')));
});

test('rule structure: invalid ruleset_name format fails', () => {
  const invalid = {
    ruleset_name: "Invalid Name With Spaces",
    description: "Test",
    decision: "review",
    conditions: [{ field: "amount", op: ">", value: 100 }]
  };

  const result = validateRuleStructure(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('kebab-case')));
});

test('rule structure: missing conditions fails', () => {
  const invalid = {
    ruleset_name: "test-rule",
    description: "Test",
    decision: "review"
  };

  const result = validateRuleStructure(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('conditions')));
});

test('rule structure: invalid decision enum fails', () => {
  const invalid = {
    ruleset_name: "test-rule",
    description: "Test",
    decision: "maybe",
    conditions: [{ field: "amount", op: ">", value: 100 }]
  };

  const result = validateRuleStructure(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('decision')));
});

// ========================================
// SECTION 2: Catalog-based Validation
// ========================================

test('validator: valid rule with all correct types passes', () => {
  const valid = {
    ruleset_name: "high-value-mobile",
    description: "Blocks high-value mobile transactions",
    decision: "block",
    conditions: [
      { field: "amount", op: ">", value: 5000 },
      { field: "device", op: "==", value: "mobile" }
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(valid);
  assert.ok(result.valid, `Expected valid, got errors: ${result.errors.join(', ')}`);
});

test('validator: unknown field fails', () => {
  const invalid = {
    ruleset_name: "unknown-field",
    description: "Uses unknown field",
    decision: "review",
    conditions: [
      { field: "nonexistent_field", op: "==", value: "test" }
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Unknown field')));
});

test('validator: enum field with invalid value fails', () => {
  const invalid = {
    ruleset_name: "invalid-enum",
    description: "Invalid device value",
    decision: "review",
    conditions: [
      { field: "device", op: "==", value: "desktop" }  // 'desktop' not in enum
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('not a valid value')));
});

test('validator: number field with string value fails', () => {
  const invalid = {
    ruleset_name: "type-mismatch",
    description: "Wrong type for amount",
    decision: "review",
    conditions: [
      { field: "amount", op: ">", value: "five thousand" }
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('requires number')));
});

test('validator: out of range value fails', () => {
  const invalid = {
    ruleset_name: "out-of-range",
    description: "Amount exceeds max",
    decision: "review",
    conditions: [
      { field: "amount", op: ">", value: 2000000 }  // Max is 1000000
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('out of range')));
});

test('validator: negative amount fails', () => {
  const invalid = {
    ruleset_name: "negative-amount",
    description: "Negative amount",
    decision: "review",
    conditions: [
      { field: "amount", op: "<", value: -100 }
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('out of range')));
});

test('validator: invalid operator for field type fails', () => {
  const invalid = {
    ruleset_name: "invalid-operator",
    description: "Wrong operator for boolean",
    decision: "review",
    conditions: [
      { field: "flagged", op: ">", value: true }  // Boolean can't use '>'
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('not valid for field')));
});

test('validator: "in" operator without array value fails', () => {
  const invalid = {
    ruleset_name: "in-not-array",
    description: "In operator needs array",
    decision: "review",
    conditions: [
      { field: "device", op: "in", value: "mobile" }  // Should be array
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('requires an array')));
});

test('validator: "in" operator with valid array passes', () => {
  const valid = {
    ruleset_name: "valid-in",
    description: "Valid in operator",
    decision: "review",
    conditions: [
      { field: "device", op: "in", value: ["mobile", "tablet"] }
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(valid);
  assert.ok(result.valid, `Expected valid, got errors: ${result.errors.join(', ')}`);
});

test('validator: integer field with float value fails', () => {
  const invalid = {
    ruleset_name: "float-for-int",
    description: "Float for integer field",
    decision: "review",
    conditions: [
      { field: "hour", op: "==", value: 12.5 }  // hour is integer
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('requires integer')));
});

test('validator: hour value > 23 fails', () => {
  const invalid = {
    ruleset_name: "invalid-hour",
    description: "Hour out of range",
    decision: "review",
    conditions: [
      { field: "hour", op: ">", value: 25 }
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('out of range')));
});

test('validator: too many conditions fails (policy check)', () => {
  const invalid = {
    ruleset_name: "too-many",
    description: "Exceeds max conditions",
    decision: "review",
    conditions: Array.from({ length: 11 }, (_, i) => ({
      field: "amount",
      op: ">",
      value: i * 100
    }))
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('max_conditions_per_rule')));
});

test('validator: description too short fails', () => {
  const invalid = {
    ruleset_name: "short-desc",
    description: "Short",
    decision: "review",
    conditions: [{ field: "amount", op: ">", value: 100 }]
  };

  const validator = new RuleValidator();
  const result = validator.validate(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('at least 10 characters')));
});

// ========================================
// SECTION 3: Policy Gate Tests
// ========================================

test('policy gate: disallowed field "country_of_origin" fails', () => {
  const ruleset = {
    ruleset_name: "geo-rule",
    rules: [{
      decision: "block",
      conditions: [{ field: "country_of_origin", op: "==", value: "NG" }]
    }]
  };

  const violations = policyGate({ ruleset });
  assert.ok(violations.length > 0);
  assert.ok(violations.some(v => v.type === 'disallowed_field'));
  assert.ok(hasBlockingViolations(violations));
});

test('policy gate: sensitive instruction "geography" fails', () => {
  const violations = policyGate({
    instruction: "Block all transactions from geographic region X",
    ruleset: { rules: [] }
  });

  assert.ok(violations.length > 0);
  assert.ok(violations.some(v => v.type === 'sensitive_language'));
  assert.ok(hasBlockingViolations(violations));
});

test('policy gate: sensitive instruction "ethnic" fails', () => {
  const violations = policyGate({
    instruction: "Flag ethnic origin based rules",
    ruleset: { rules: [] }
  });

  assert.ok(violations.length > 0);
  assert.ok(violations.some(v => v.type === 'sensitive_language'));
});

test('policy gate: "zipcode" field blocked', () => {
  const ruleset = {
    ruleset_name: "zip-rule",
    rules: [{
      decision: "review",
      conditions: [{ field: "zipcode", op: "==", value: "90210" }]
    }]
  };

  const violations = policyGate({ ruleset });
  assert.ok(violations.length > 0);
  assert.ok(violations.some(v => v.field === 'zipcode'));
});

test('policy gate: broad negation warning (single !=)', () => {
  const ruleset = {
    ruleset_name: "negation-rule",
    rules: [{
      decision: "block",
      conditions: [{ field: "agent_id", op: "!=", value: "openai" }]
    }]
  };

  const violations = policyGate({ ruleset });
  assert.ok(violations.some(v => v.type === 'broad_negation'));
  assert.ok(violations.some(v => v.severity === 'warning'));
});

test('policy gate: PII field warning', () => {
  const ruleset = {
    ruleset_name: "pii-rule",
    rules: [{
      decision: "review",
      conditions: [{ field: "seller_name", op: "contains", value: "test" }]
    }]
  };

  const violations = policyGate({ ruleset });
  assert.ok(violations.some(v => v.type === 'pii_field'));
  assert.ok(violations.some(v => v.severity === 'warning'));
});

test('policy gate: clean rule passes with no violations', () => {
  const ruleset = {
    ruleset_name: "clean-rule",
    rules: [{
      decision: "review",
      conditions: [
        { field: "amount", op: ">", value: 10000 },
        { field: "device", op: "==", value: "mobile" }
      ]
    }]
  };

  const violations = policyGate({ ruleset });
  assert.equal(violations.length, 0);
});

// ========================================
// SECTION 4: PII Stripping Tests
// ========================================

test('PII stripping: user_id redacted', () => {
  const txn = {
    txn_id: "abc123",
    user_id: "550e8400-e29b-41d4-a716-446655440000",
    amount: 100
  };

  const safe = stripPII(txn);
  // PII fields from catalog are redacted to '[REDACTED]'
  assert.equal(safe.user_id, '[REDACTED]');
});

test('PII stripping: seller_name redacted', () => {
  const txn = {
    txn_id: "abc123",
    seller_name: "Amazon",
    amount: 100
  };

  const safe = stripPII(txn);
  assert.equal(safe.seller_name, '[REDACTED]');
});

test('PII stripping: non-PII fields preserved', () => {
  const txn = {
    txn_id: "abc123",
    amount: 100,
    device: "mobile"
  };

  const safe = stripPII(txn);
  assert.equal(safe.amount, 100);
  assert.equal(safe.device, "mobile");
  assert.equal(safe.txn_id, "abc123");
});

// ========================================
// SECTION 5: Utility Function Tests
// ========================================

test('validateValue: valid enum value passes', () => {
  const result = validateValue('device', 'mobile');
  assert.ok(result.valid);
});

test('validateValue: invalid enum value fails', () => {
  const result = validateValue('device', 'desktop');
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('must be one of'));
});

test('validateValue: null for not_null field fails', () => {
  const result = validateValue('amount', null);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('cannot be null'));
});

test('validateValue: unknown field fails', () => {
  const result = validateValue('unknown_field', 'value');
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('Unknown field'));
});

// ========================================
// Test Summary
// ========================================

console.log('\n✅ All validator and policy gate tests defined (30+ test cases)');
console.log('Run with: npm test\n');
