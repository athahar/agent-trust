// tests/fuzz.rules.test.js
// Property-based / fuzz tests for rule validation
// Ensures validators survive random/malformed inputs without crashing

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { RuleValidator, validateValue } from '../../src/lib/ruleValidator.js';
import { policyGate } from '../../src/lib/policyGate.js';

// Load and display feature catalog version
const catalogPath = new URL('../../src/lib/featureCatalog.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
console.log(`\n📋 Feature Catalog: v${catalog.version} (updated ${catalog.last_updated})`);

// ========================================
// SECTION 1: Enum Enforcement Fuzzing
// ========================================

test('fuzz: device enum enforcement survives random noise', () => {
  const validDevices = ['web', 'mobile', 'tablet'];
  const testDevices = [...validDevices, 'desktop', 'tv', 'toaster', 'smartwatch', 'console', 'iot'];

  for (let i = 0; i < 200; i++) {
    const device = testDevices[Math.floor(Math.random() * testDevices.length)];
    const rule = {
      ruleset_name: `fuzz-device-${i}`,
      description: 'Fuzz test for device enum',
      decision: 'review',
      conditions: [
        { field: 'device', op: '==', value: device }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    const isValid = validDevices.includes(device);
    assert.equal(
      result.valid,
      isValid,
      `device="${device}" should ${isValid ? 'pass' : 'fail'}`
    );

    if (!isValid) {
      assert.ok(result.errors.some(e => e.includes('not a valid value')));
    }
  }
});

test('fuzz: partner enum enforcement', () => {
  const validPartners = ['amazon', 'shopify', 'stripe', 'paypal', 'square', 'adyen', 'checkout'];
  const testPartners = [...validPartners, 'visa', 'mastercard', 'amex', 'unknown', 'test'];

  for (let i = 0; i < 100; i++) {
    const partner = testPartners[Math.floor(Math.random() * testPartners.length)];
    const rule = {
      ruleset_name: `fuzz-partner-${i}`,
      description: 'Fuzz test for partner enum',
      decision: 'block',
      conditions: [
        { field: 'partner', op: '==', value: partner }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    const isValid = validPartners.includes(partner);
    assert.equal(result.valid, isValid, `partner="${partner}" validation mismatch`);
  }
});

// ========================================
// SECTION 2: Range Enforcement Fuzzing
// ========================================

test('fuzz: amount range enforcement (0-1000000)', () => {
  const testAmounts = [
    -1000000, -100, -1, -0.01,  // Negative (invalid)
    0, 0.01, 1, 100, 1000, 10000, 100000, 500000, 999999, 1000000,  // Valid
    1000001, 2000000, 9999999  // Over max (invalid)
  ];

  for (let i = 0; i < 300; i++) {
    const amount = i < testAmounts.length
      ? testAmounts[i]
      : (Math.random() - 0.5) * 3000000; // Random in range -1.5M to +1.5M

    const rule = {
      ruleset_name: `fuzz-amount-${i}`,
      description: 'Fuzz test for amount range',
      decision: 'review',
      conditions: [
        { field: 'amount', op: '>', value: amount }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    const isValid = amount >= 0 && amount <= 1000000;
    assert.equal(
      result.valid,
      isValid,
      `amount=${amount} should ${isValid ? 'pass' : 'fail'}`
    );

    if (!isValid) {
      assert.ok(result.errors.some(e => e.includes('out of range') || e.includes('cannot be null')));
    }
  }
});

test('fuzz: hour range enforcement (0-23)', () => {
  const testHours = [-5, -1, 0, 1, 12, 23, 24, 25, 100];

  for (let i = 0; i < 100; i++) {
    const hour = i < testHours.length
      ? testHours[i]
      : Math.floor(Math.random() * 50) - 10; // Random in range -10 to 40

    const rule = {
      ruleset_name: `fuzz-hour-${i}`,
      description: 'Fuzz test for hour range',
      decision: 'review',
      conditions: [
        { field: 'hour', op: '==', value: hour }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    const isValid = Number.isInteger(hour) && hour >= 0 && hour <= 23;
    assert.equal(result.valid, isValid, `hour=${hour} validation mismatch`);
  }
});

// ========================================
// SECTION 3: Type Checking Fuzzing
// ========================================

test('fuzz: type mismatch detection (number fields)', () => {
  const testValues = [
    { value: 'string', type: 'string' },
    { value: 123, type: 'number' },
    { value: true, type: 'boolean' },
    { value: null, type: 'null' },
    { value: undefined, type: 'undefined' },
    { value: [], type: 'array' },
    { value: {}, type: 'object' }
  ];

  for (let i = 0; i < 100; i++) {
    const testCase = testValues[Math.floor(Math.random() * testValues.length)];

    const rule = {
      ruleset_name: `fuzz-type-${i}`,
      description: 'Fuzz test for type checking',
      decision: 'review',
      conditions: [
        { field: 'amount', op: '>', value: testCase.value }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    // amount requires number type, in valid range
    const isValid = typeof testCase.value === 'number' &&
                    testCase.value >= 0 &&
                    testCase.value <= 1000000;

    assert.equal(result.valid, isValid, `amount with ${testCase.type} should ${isValid ? 'pass' : 'fail'}`);
  }
});

test('fuzz: boolean field type checking', () => {
  const testValues = [true, false, 'true', 'false', 1, 0, null, undefined];

  for (let i = 0; i < testValues.length * 10; i++) {
    const value = testValues[i % testValues.length];

    const rule = {
      ruleset_name: `fuzz-bool-${i}`,
      description: 'Fuzz test for boolean type',
      decision: 'review',
      conditions: [
        { field: 'flagged', op: '==', value: value }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    const isValid = typeof value === 'boolean';
    assert.equal(result.valid, isValid, `flagged with value=${value} (${typeof value}) validation mismatch`);
  }
});

// ========================================
// SECTION 4: Operator Validity Fuzzing
// ========================================

test('fuzz: invalid operators for field types', () => {
  const invalidCombos = [
    { field: 'flagged', op: '>', value: true },  // boolean can't use >
    { field: 'flagged', op: '<', value: false }, // boolean can't use <
    { field: 'device', op: '>', value: 'web' },  // enum can't use >
    { field: 'device', op: '>=', value: 'mobile' }, // enum can't use >=
  ];

  for (let i = 0; i < invalidCombos.length * 20; i++) {
    const combo = invalidCombos[i % invalidCombos.length];

    const rule = {
      ruleset_name: `fuzz-op-${i}`,
      description: 'Fuzz test for invalid operators',
      decision: 'review',
      conditions: [combo]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    assert.equal(result.valid, false, `${combo.field} with op=${combo.op} should fail`);
    assert.ok(result.errors.some(e => e.includes('not valid for field')));
  }
});

// ========================================
// SECTION 5: Array Operator Fuzzing
// ========================================

test('fuzz: in/not_in require arrays', () => {
  const arrayOps = ['in', 'not_in'];
  const testValues = [
    'string',
    123,
    true,
    null,
    ['web', 'mobile'],  // Valid
    [],
    [1, 2, 3]
  ];

  for (let i = 0; i < 100; i++) {
    const op = arrayOps[i % arrayOps.length];
    const value = testValues[Math.floor(Math.random() * testValues.length)];

    const rule = {
      ruleset_name: `fuzz-array-op-${i}`,
      description: 'Fuzz test for array operators',
      decision: 'review',
      conditions: [
        { field: 'device', op: op, value: value }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    // Empty arrays should fail (semantically meaningless for in/not_in)
    const isValidArray = Array.isArray(value) &&
                         value.length > 0 &&
                         value.every(v => ['web', 'mobile', 'tablet'].includes(v));
    assert.equal(result.valid, isValidArray, `${op} with value=${JSON.stringify(value)} validation mismatch`);
  }
});

// ========================================
// SECTION 6: Policy Gate Fuzzing
// ========================================

test('fuzz: policy gate catches disallowed field variations', () => {
  const disallowedFields = [
    'country_of_origin',
    'zipcode',
    'ip_city_proxy',
    'user_id',
    'email',
    'seller_tax_id'
  ];

  const allowedFields = [
    'amount',
    'device',
    'agent_id',
    'partner',
    'hour'
  ];

  const allFields = [...disallowedFields, ...allowedFields];

  for (let i = 0; i < 100; i++) {
    const field = allFields[Math.floor(Math.random() * allFields.length)];

    const ruleset = {
      ruleset_name: `fuzz-policy-${i}`,
      rules: [{
        decision: 'review',
        conditions: [{ field: field, op: '==', value: 'test' }]
      }]
    };

    const violations = policyGate({ ruleset });

    const isDisallowed = disallowedFields.includes(field);
    const hasBlockingViolation = violations.some(v => v.type === 'disallowed_field' && v.severity === 'error');

    assert.equal(hasBlockingViolation, isDisallowed, `field="${field}" policy gate mismatch`);
  }
});

// ========================================
// SECTION 7: Malformed Input Robustness
// ========================================

test('fuzz: validator handles malformed inputs gracefully', () => {
  const malformedRules = [
    {},
    { ruleset_name: 'test' },
    { ruleset_name: 'test', description: 'desc' },
    { ruleset_name: 'test', description: 'desc', decision: 'review' },
    { ruleset_name: 'test', description: 'desc', decision: 'review', conditions: null },
    { ruleset_name: 'test', description: 'desc', decision: 'review', conditions: 'not-array' },
    { ruleset_name: 'test', description: 'desc', decision: 'review', conditions: [] },
    { ruleset_name: 'test', description: 'desc', decision: 'invalid', conditions: [{}] },
  ];

  for (let i = 0; i < malformedRules.length * 10; i++) {
    const rule = malformedRules[i % malformedRules.length];

    const validator = new RuleValidator();
    let result;

    // Should not throw, should return validation result
    assert.doesNotThrow(() => {
      result = validator.validate(rule);
    }, `Validator should not throw on malformed input: ${JSON.stringify(rule)}`);

    // Malformed inputs should all be invalid
    assert.equal(result.valid, false, 'Malformed rule should be invalid');
    assert.ok(Array.isArray(result.errors), 'Should have errors array');
    assert.ok(result.errors.length > 0, 'Should have at least one error');
  }
});

console.log('\n✅ All fuzz tests defined');
console.log('Tested: enum enforcement, range checking, type validation, operator validity, array ops, policy gate, malformed inputs\n');

