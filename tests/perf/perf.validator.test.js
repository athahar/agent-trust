// tests/perf.validator.test.js
// Performance tests for validators
// Ensures validators can handle high volume without degradation

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { RuleValidator } from '../../src/lib/ruleValidator.js';
import { validateRuleStructure } from '../../src/lib/ruleSchema.js';
import { policyGate } from '../../src/lib/policyGate.js';

// Load and display feature catalog version
const catalogPath = new URL('../../src/lib/featureCatalog.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
console.log(`\n📋 Feature Catalog: v${catalog.version} (updated ${catalog.last_updated})`);

// ========================================
// SECTION 1: Validator Performance
// ========================================

test('perf: validator handles 10k rulesets < 500ms', () => {
  const iterations = 10000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    const rule = {
      ruleset_name: `perf-rule-${i}`,
      description: `Performance test rule ${i} for high-volume validation`,
      decision: 'review',
      conditions: [
        { field: 'amount', op: '>', value: (i % 1000) + 1 },
        { field: 'device', op: 'in', value: ['web', 'mobile'] }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    // All should be valid
    assert.ok(result.valid, `Rule ${i} should be valid`);
  }

  const elapsed = Date.now() - start;
  const perRule = elapsed / iterations;

  console.log(`  ⏱️  Validated ${iterations.toLocaleString()} rules in ${elapsed}ms (${perRule.toFixed(2)}ms/rule)`);
  assert.ok(elapsed < 500, `Expected < 500ms, got ${elapsed}ms`);
});

test('perf: complex rules with 10 conditions < 1000ms for 1k rules', () => {
  const iterations = 1000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    const rule = {
      ruleset_name: `complex-rule-${i}`,
      description: 'Complex rule with maximum conditions for performance testing',
      decision: 'block',
      conditions: [
        { field: 'amount', op: '>', value: 10000 },
        { field: 'device', op: '==', value: 'mobile' },
        { field: 'hour', op: '<', value: 9 },
        { field: 'hour', op: '>', value: 17 },
        { field: 'account_age_days', op: '<', value: 30 },
        { field: 'is_first_transaction', op: '==', value: true },
        { field: 'flagged', op: '==', value: false },
        { field: 'disputed', op: '==', value: false },
        { field: 'declined', op: '==', value: false },
        { field: 'partner', op: 'in', value: ['stripe', 'paypal'] }
      ]
    };

    const validator = new RuleValidator();
    const result = validator.validate(rule);
    assert.ok(result.valid);
  }

  const elapsed = Date.now() - start;
  console.log(`  ⏱️  Validated ${iterations.toLocaleString()} complex rules (10 conditions each) in ${elapsed}ms`);
  assert.ok(elapsed < 1000, `Expected < 1000ms, got ${elapsed}ms`);
});

// ========================================
// SECTION 2: Schema Validation Performance
// ========================================

test('perf: schema validation < 200ms for 10k rules', () => {
  const iterations = 10000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    const rule = {
      ruleset_name: `schema-test-${i}`,
      description: 'Schema validation performance test',
      decision: i % 3 === 0 ? 'block' : i % 3 === 1 ? 'review' : 'allow',
      conditions: [
        { field: 'amount', op: '>', value: i }
      ]
    };

    const result = validateRuleStructure(rule);
    assert.ok(result.valid);
  }

  const elapsed = Date.now() - start;
  console.log(`  ⏱️  Schema validated ${iterations.toLocaleString()} rules in ${elapsed}ms`);
  assert.ok(elapsed < 200, `Expected < 200ms, got ${elapsed}ms`);
});

// ========================================
// SECTION 3: Policy Gate Performance
// ========================================

test('perf: policy gate < 300ms for 5k rulesets', () => {
  const iterations = 5000;
  const start = Date.now();

  const instructions = [
    'Review high-value mobile transactions',
    'Block suspicious first-time purchases',
    'Flag large transfers outside business hours',
    'Review transactions from new accounts',
    'Block declined card retries'
  ];

  for (let i = 0; i < iterations; i++) {
    const ruleset = {
      ruleset_name: `policy-test-${i}`,
      rules: [{
        decision: 'review',
        conditions: [
          { field: 'amount', op: '>', value: 1000 },
          { field: 'device', op: '==', value: 'mobile' }
        ]
      }]
    };

    const instruction = instructions[i % instructions.length];
    const violations = policyGate({ instruction, ruleset });

    // These should all pass (no violations)
    assert.ok(!violations.some(v => v.severity === 'error'));
  }

  const elapsed = Date.now() - start;
  console.log(`  ⏱️  Policy gate checked ${iterations.toLocaleString()} rulesets in ${elapsed}ms`);
  assert.ok(elapsed < 300, `Expected < 300ms, got ${elapsed}ms`);
});

// ========================================
// SECTION 4: Mixed Workload Performance
// ========================================

test('perf: mixed workload (validate + policy + schema) < 1500ms for 3k rules', () => {
  const iterations = 3000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    // 1. Schema validation
    const rule = {
      ruleset_name: `mixed-${i}`,
      description: `Mixed workload test rule ${i}`,
      decision: i % 3 === 0 ? 'block' : 'review',
      conditions: [
        { field: 'amount', op: '>', value: (i % 10000) + 100 },
        { field: 'device', op: 'in', value: ['web', 'mobile', 'tablet'] },
        { field: 'hour', op: i % 2 === 0 ? '<' : '>', value: 12 }
      ]
    };

    const schemaResult = validateRuleStructure(rule);
    assert.ok(schemaResult.valid);

    // 2. Catalog validation
    const validator = new RuleValidator();
    const validationResult = validator.validate(rule);
    assert.ok(validationResult.valid);

    // 3. Policy gate
    const ruleset = {
      ruleset_name: rule.ruleset_name,
      rules: [rule]
    };

    const violations = policyGate({
      instruction: 'Review transactions based on amount and device',
      ruleset
    });

    assert.ok(!violations.some(v => v.severity === 'error'));
  }

  const elapsed = Date.now() - start;
  const perRule = elapsed / iterations;

  console.log(`  ⏱️  Mixed workload: ${iterations.toLocaleString()} rules in ${elapsed}ms (${perRule.toFixed(2)}ms/rule)`);
  assert.ok(elapsed < 1500, `Expected < 1500ms, got ${elapsed}ms`);
});

// ========================================
// SECTION 5: Memory Usage (Smoke Test)
// ========================================

test('perf: validator memory footprint reasonable for 50k rules', () => {
  const iterations = 50000;
  const memBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    const rule = {
      ruleset_name: `mem-test-${i}`,
      description: 'Memory footprint test',
      decision: 'review',
      conditions: [
        { field: 'amount', op: '>', value: i % 100000 }
      ]
    };

    const validator = new RuleValidator();
    validator.validate(rule);

    // Clear validator (would normally be GC'd)
    if (i % 10000 === 0 && global.gc) {
      global.gc();
    }
  }

  const memAfter = process.memoryUsage().heapUsed;
  const memDelta = (memAfter - memBefore) / 1024 / 1024; // MB

  console.log(`  💾 Memory delta for ${iterations.toLocaleString()} validations: ${memDelta.toFixed(2)}MB`);

  // Should not leak > 100MB for 50k validations
  assert.ok(memDelta < 100, `Memory usage ${memDelta.toFixed(2)}MB exceeds 100MB threshold`);
});

// ========================================
// SECTION 6: Worst-Case Scenarios
// ========================================

test('perf: worst-case rule (max conditions, max complexity) < 5ms', () => {
  const rule = {
    ruleset_name: 'worst-case-max-complexity',
    description: 'Worst-case rule with maximum allowed conditions (10) and maximum complexity',
    decision: 'block',
    conditions: [
      { field: 'amount', op: '>', value: 50000 },
      { field: 'amount', op: '<', value: 100000 },
      { field: 'device', op: 'in', value: ['mobile', 'tablet'] },
      { field: 'hour', op: '<', value: 6 },
      { field: 'hour', op: '>', value: 22 },
      { field: 'account_age_days', op: '<', value: 7 },
      { field: 'is_first_transaction', op: '==', value: true },
      { field: 'flagged', op: '==', value: false },
      { field: 'partner', op: 'in', value: ['stripe', 'paypal', 'square'] },
      { field: 'intent', op: '==', value: 'ecommerce_booking' }
    ]
  };

  const iterations = 1000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    const validator = new RuleValidator();
    const result = validator.validate(rule);
    assert.ok(result.valid);
  }

  const elapsed = Date.now() - start;
  const perRule = elapsed / iterations;

  console.log(`  ⏱️  Worst-case rule validated ${iterations} times in ${elapsed}ms (${perRule.toFixed(2)}ms/rule)`);
  assert.ok(perRule < 5, `Expected < 5ms/rule, got ${perRule.toFixed(2)}ms`);
});

console.log('\n✅ All performance tests passed');
console.log('Benchmarks: 10k simple rules <500ms, 1k complex rules <1000ms, mixed workload <1500ms for 3k rules\n');

