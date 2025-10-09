// tests/golden.rules.test.js
// Golden test cases - known rules with expected outcomes
// These serve as regression tests and documentation of expected behavior

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RuleValidator } from '../../src/lib/ruleValidator.js';
import { policyGate } from '../../src/lib/policyGate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load and display feature catalog version
const catalogPath = path.join(__dirname, '..', '..', 'src', 'lib', 'featureCatalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
console.log(`\n📋 Feature Catalog: v${catalog.version} (updated ${catalog.last_updated})`);

// Load golden rules (fixtures are in tests/fixtures/, not tests/golden/fixtures/)
const goldenRulesPath = path.join(__dirname, '..', 'fixtures', 'golden-rules.json');
const goldenRules = JSON.parse(fs.readFileSync(goldenRulesPath, 'utf8'));

// ========================================
// SECTION 1: Golden Rule Validation Tests
// ========================================

for (const testCase of goldenRules) {
  test(`golden: ${testCase.name} - ${testCase.expected_valid ? 'valid' : 'invalid'}`, () => {
    const validator = new RuleValidator();
    const result = validator.validate(testCase.rule);

    assert.equal(
      result.valid,
      testCase.expected_valid,
      `Rule "${testCase.name}" should be ${testCase.expected_valid ? 'valid' : 'invalid'}`
    );

    if (!testCase.expected_valid && testCase.expected_validation_error) {
      assert.ok(
        result.errors.some(e => e.includes(testCase.expected_validation_error)),
        `Expected validation error containing "${testCase.expected_validation_error}"`
      );
    }
  });
}

// ========================================
// SECTION 2: Golden Policy Gate Tests
// ========================================

for (const testCase of goldenRules.filter(tc => tc.expected_policy_violation)) {
  test(`golden policy: ${testCase.name} - should have ${testCase.expected_policy_violation} violation`, () => {
    const ruleset = {
      ruleset_name: testCase.rule.ruleset_name,
      rules: [testCase.rule]
    };

    const violations = policyGate({ ruleset });

    assert.ok(
      violations.some(v => v.type === testCase.expected_policy_violation),
      `Expected policy violation of type "${testCase.expected_policy_violation}"`
    );
  });
}

// ========================================
// SECTION 3: Golden Rule Consistency
// ========================================

test('golden: all valid rules pass both schema and catalog validation', () => {
  const validRules = goldenRules.filter(tc => tc.expected_valid);

  for (const testCase of validRules) {
    const validator = new RuleValidator();
    const result = validator.validate(testCase.rule);

    assert.ok(
      result.valid,
      `Valid golden rule "${testCase.name}" should pass validation`
    );
    assert.equal(
      result.errors.length,
      0,
      `Valid rule should have no errors, got: ${result.errors.join(', ')}`
    );
  }
});

test('golden: all invalid rules fail validation', () => {
  const invalidRules = goldenRules.filter(tc => !tc.expected_valid);

  for (const testCase of invalidRules) {
    const validator = new RuleValidator();
    const result = validator.validate(testCase.rule);

    assert.equal(
      result.valid,
      false,
      `Invalid golden rule "${testCase.name}" should fail validation`
    );
    assert.ok(
      result.errors.length > 0,
      `Invalid rule should have at least one error`
    );
  }
});

// ========================================
// SECTION 4: Golden Rule Structure Tests
// ========================================

test('golden: all rules have required metadata', () => {
  for (const testCase of goldenRules) {
    assert.ok(testCase.name, 'Test case should have name');
    assert.ok(testCase.rule, 'Test case should have rule');
    assert.ok(testCase.rule.ruleset_name, 'Rule should have ruleset_name');
    assert.ok(testCase.rule.description, 'Rule should have description');
    assert.ok(testCase.rule.decision, 'Rule should have decision');
    assert.ok(Array.isArray(testCase.rule.conditions), 'Rule should have conditions array');
    assert.ok(
      typeof testCase.expected_valid === 'boolean',
      'Test case should have expected_valid boolean'
    );
  }
});

test('golden: rule names are unique', () => {
  const names = goldenRules.map(tc => tc.name);
  const uniqueNames = new Set(names);

  assert.equal(
    names.length,
    uniqueNames.size,
    'All golden rule names should be unique'
  );
});

test('golden: ruleset_names are unique', () => {
  const rulesetNames = goldenRules.map(tc => tc.rule.ruleset_name);
  const uniqueRulesetNames = new Set(rulesetNames);

  assert.equal(
    rulesetNames.length,
    uniqueRulesetNames.size,
    'All golden ruleset_names should be unique'
  );
});

// ========================================
// SECTION 5: Coverage Statistics
// ========================================

test('golden: provides good coverage of validation scenarios', () => {
  const stats = {
    total: goldenRules.length,
    valid: goldenRules.filter(tc => tc.expected_valid).length,
    invalid: goldenRules.filter(tc => !tc.expected_valid).length,
    policyViolations: goldenRules.filter(tc => tc.expected_policy_violation).length,
    validationErrors: goldenRules.filter(tc => tc.expected_validation_error).length
  };

  console.log('  📊 Golden rules coverage:');
  console.log(`     Total: ${stats.total}`);
  console.log(`     Valid: ${stats.valid}`);
  console.log(`     Invalid: ${stats.invalid}`);
  console.log(`     Policy violations: ${stats.policyViolations}`);
  console.log(`     Validation errors: ${stats.validationErrors}`);

  // Should have at least 6 total rules
  assert.ok(stats.total >= 6, 'Should have at least 6 golden rules');

  // Should have both valid and invalid cases
  assert.ok(stats.valid > 0, 'Should have valid rule cases');
  assert.ok(stats.invalid > 0, 'Should have invalid rule cases');

  // Should cover policy violations
  assert.ok(stats.policyViolations > 0, 'Should have policy violation cases');
});

console.log('\n✅ All golden rule tests passed');
console.log('Golden rules serve as regression tests and documentation of expected behavior\n');

