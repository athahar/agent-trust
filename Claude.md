# Claude Development Guide

**Testing-first development principles for AI-assisted fraud detection**

---

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Test Types](#test-types)
- [Coverage Requirements](#coverage-requirements)
- [Testing Workflow](#testing-workflow)
- [CI/CD Pipeline](#cicd-pipeline)
- [Code Quality Gates](#code-quality-gates)
- [Anti-Patterns](#anti-patterns)

---

## Testing Philosophy

### Core Principles

1. **Write tests as you go** - Never consider a PR "done" without tests
2. **Trust but verify** - Even AI-generated code needs comprehensive testing
3. **Coverage gates are non-negotiable** - Lines ≥80%, Branches ≥70%
4. **Golden tests for regression** - Capture expected behavior in version control
5. **Clean room verification** - CI must pass without local env dependencies

### Why Testing Matters for AI-Assisted Development

When building safety-critical systems like fraud detection with AI assistance:
- **Validators are your only defense** - If they fail, invalid rules reach production
- **Hallucinations happen** - LLMs can generate plausible but incorrect code
- **Regressions are expensive** - A broken policy gate could allow discrimination
- **Tests are documentation** - They show future developers (and AIs) what's expected

---

## Test Types

### 1. Unit Tests (`tests/*.test.js`)

**Purpose**: Test individual functions/classes in isolation

**What to test**:
- ✅ Happy path (valid inputs → expected outputs)
- ✅ Error paths (invalid inputs → proper errors)
- ✅ Edge cases (boundary values, empty arrays, null, undefined)
- ✅ Type checking (string when number expected, etc.)

**Example**:
```javascript
test('validator: enum field with invalid value fails', () => {
  const rule = {
    ruleset_name: "invalid-enum",
    description: "Invalid device value",
    decision: "review",
    conditions: [
      { field: "device", op: "==", value: "desktop" }  // 'desktop' not in enum
    ]
  };

  const validator = new RuleValidator();
  const result = validator.validate(rule);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('not a valid value')));
});
```

**Coverage target**: ≥80% lines, ≥70% branches

---

### 2. Contract Tests (`tests/api.*.test.js`)

**Purpose**: Black-box testing of API endpoints (test the contract, not implementation)

**What to test**:
- ✅ Request validation (missing fields, wrong types)
- ✅ Policy gate pre-checks (reject before LLM call)
- ✅ Error response structure (consistent error format)
- ✅ Status codes (400, 403, 404, 500)
- ❌ Database operations (mock or skip)
- ❌ LLM calls (too slow, unreliable for CI)

**Example**:
```javascript
test('POST /api/rules/suggest - blocks instruction with geographic discrimination', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({
      instruction: 'Block all transactions from geographic region X',
      actor: 'test@example.com'
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'POLICY_VIOLATION');
  assert.ok(res.body.violations.some(v => v.type === 'sensitive_language'));
});
```

**Why important**: Ensures API contracts don't break when refactoring internals

---

### 3. Fuzz Tests (`tests/fuzz.*.test.js`)

**Purpose**: Test validators with random/malformed inputs (find crashes)

**What to test**:
- ✅ Enum enforcement (valid + invalid values × 100s of iterations)
- ✅ Range enforcement (negative, zero, max, over-max)
- ✅ Type mismatches (string for number, array for string, etc.)
- ✅ Malformed inputs (null, undefined, wrong structure)

**Example**:
```javascript
test('fuzz: device enum enforcement survives random noise', () => {
  const validDevices = ['web', 'mobile', 'tablet'];
  const testDevices = [...validDevices, 'desktop', 'tv', 'toaster'];

  for (let i = 0; i < 200; i++) {
    const device = testDevices[Math.floor(Math.random() * testDevices.length)];
    const rule = { /* ... */ conditions: [{ field: 'device', op: '==', value: device }] };

    const validator = new RuleValidator();
    const result = validator.validate(rule);

    const isValid = validDevices.includes(device);
    assert.equal(result.valid, isValid);
  }
});
```

**Why important**: Catches edge cases that humans (and AIs) miss

---

### 4. Performance Tests (`tests/perf.*.test.js`)

**Purpose**: Ensure validators can handle production volume

**What to test**:
- ✅ 10k simple rules < 500ms
- ✅ 1k complex rules (10 conditions) < 1000ms
- ✅ Mixed workload (schema + validate + policy) < 1500ms for 3k rules
- ✅ Memory footprint < 100MB for 50k validations

**Example**:
```javascript
test('perf: validator handles 10k rulesets < 500ms', () => {
  const start = Date.now();

  for (let i = 0; i < 10000; i++) {
    const rule = { /* ... */ };
    const validator = new RuleValidator();
    validator.validate(rule);
  }

  const elapsed = Date.now() - start;
  assert.ok(elapsed < 500, `Expected < 500ms, got ${elapsed}ms`);
});
```

**Why important**: Catches performance regressions before they hit production (dry-run latency SLA is <2s)

---

### 5. Golden Tests (`tests/golden.*.test.js`)

**Purpose**: Known rules with expected outcomes (regression tests + documentation)

**What to test**:
- ✅ 6-10 representative valid rules
- ✅ 4-6 representative invalid rules (policy, validation, range errors)
- ✅ Expected match counts on golden dataset (when dry-run is implemented)

**Example**:
```json
// tests/fixtures/golden-rules.json
[
  {
    "name": "high-value-mobile",
    "rule": { /* ... */ },
    "expected_valid": true,
    "expected_matches_on_golden_set": 15
  },
  {
    "name": "invalid-disallowed-field",
    "rule": { /* ... country_of_origin ... */ },
    "expected_valid": false,
    "expected_policy_violation": "disallowed_field"
  }
]
```

**Why important**:
- Prevents regressions (if test breaks, behavior changed)
- Serves as documentation (shows what's valid vs invalid)
- Future-proof (when you add dry-run, add match count assertions)

---

## Coverage Requirements

### Minimum Gates (Enforced by CI)

```bash
npm run test:coverage
```

**Requirements**:
- Lines: ≥80%
- Branches: ≥70%
- Functions: ≥75%

**What counts**:
- ✅ `src/lib/*` (validators, policy gate, schema)
- ✅ `src/routes/*` (API endpoints)
- ❌ `src/index.js` (server startup, hard to test)
- ❌ `tests/*` (test code doesn't need coverage)

**If coverage is too low**:
1. Check which files are uncovered: `c8 report --reporter=html` (open `coverage/index.html`)
2. Add missing tests from the packs above
3. Focus on validators first (they're your safety net)

---

## Testing Workflow

### Before Committing

```bash
# 1. Run all tests
npm test

# 2. Check coverage
npm run test:coverage

# 3. Run individual test suites
npm run test:unit      # Unit tests
npm run test:contract  # API contract tests
npm run test:fuzz      # Fuzz tests
npm run test:perf      # Performance tests
```

**Gates**:
- ✅ All tests pass
- ✅ Coverage ≥80% lines, ≥70% branches
- ✅ No new console.log in src/ (use proper logging)
- ✅ No secrets in code (API keys in .env only)

### During Code Review

**Reviewer checklist**:
- [ ] New code has corresponding tests
- [ ] Tests cover error paths, not just happy path
- [ ] Golden tests updated if behavior changed
- [ ] Performance tests added if new validation logic
- [ ] API contract tests added if new endpoint

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/test.yml`)

**Runs on**:
- Every push to `main` or `develop`
- Every pull request

**Jobs**:

1. **Test** (Node 18.x, 20.x)
   - Install dependencies (`npm ci`)
   - Run unit tests
   - Run contract tests
   - Run fuzz tests
   - Run performance tests
   - Run coverage (80% lines, 70% branches)
   - Upload to Codecov

2. **Lint**
   - Check for console.log in src/
   - (Future: ESLint, Prettier)

3. **Security**
   - npm audit (moderate severity threshold)

**Required status checks** (before merge):
- ✅ test (Node 20.x)
- ✅ lint
- ⚠️ security (can fail, investigate)

---

## Code Quality Gates

### Pre-Commit (Local)

```bash
# Add to .git/hooks/pre-commit (optional)
npm run test:unit || exit 1
npm run test:coverage || exit 1
```

### Pre-Push (Local)

```bash
# Add to .git/hooks/pre-push (optional)
npm test || exit 1
```

### Pre-Merge (CI)

Required checks on GitHub:
- All tests pass on Node 20.x
- Coverage ≥80% lines, ≥70% branches
- No high/critical security vulnerabilities

---

## Anti-Patterns

### ❌ DON'T: Skip tests because "it's just a small change"

**Why**: Small changes break things. Always test.

### ❌ DON'T: Only test happy path

**Why**: Error paths are where bugs hide. Test:
- Missing fields
- Wrong types
- Out of range values
- Malformed inputs

### ❌ DON'T: Mock everything

**Why**: Over-mocking tests implementation, not behavior. Mock only:
- External services (DB, LLM, APIs)
- Slow operations
- Non-deterministic operations (Date.now, Math.random)

### ❌ DON'T: Write tests after code is "done"

**Why**: You'll forget edge cases. Write tests as you go:
1. Write test for happy path
2. Write code to pass test
3. Write test for error path
4. Add error handling
5. Repeat

### ❌ DON'T: Commit failing tests

**Why**: Breaks CI, blocks others. Fix or remove.

### ❌ DON'T: Ignore flaky tests

**Why**: Flaky tests erode trust. Fix or remove:
- Use deterministic inputs (no Math.random in assertions)
- Mock Date.now if testing time-based logic
- Use `.only()` to debug flaky tests

### ❌ DON'T: Test implementation details

**Why**: Tests break when refactoring. Test:
- ✅ Public API (inputs → outputs)
- ❌ Private methods
- ❌ Internal state

---

## Best Practices

### ✅ DO: Use table-driven tests for similar cases

**Bad**:
```javascript
test('amount: -1 fails', () => { /* ... */ });
test('amount: 0 passes', () => { /* ... */ });
test('amount: 1000000 passes', () => { /* ... */ });
test('amount: 1000001 fails', () => { /* ... */ });
```

**Good**:
```javascript
const testCases = [
  { value: -1, expected: false },
  { value: 0, expected: true },
  { value: 1000000, expected: true },
  { value: 1000001, expected: false }
];

for (const tc of testCases) {
  test(`amount: ${tc.value} → ${tc.expected}`, () => {
    // ...
  });
}
```

### ✅ DO: Use descriptive test names

**Bad**: `test('validation works', ...)`

**Good**: `test('validator: enum field with invalid value fails', ...)`

### ✅ DO: Arrange-Act-Assert pattern

```javascript
test('description', () => {
  // Arrange: Set up test data
  const rule = { /* ... */ };

  // Act: Call the function
  const result = validator.validate(rule);

  // Assert: Check the result
  assert.equal(result.valid, false);
});
```

### ✅ DO: Test one thing per test

**Bad** (tests multiple things):
```javascript
test('validator works', () => {
  assert.ok(validator.validate(validRule).valid);
  assert.equal(validator.validate(invalidRule).valid, false);
  assert.ok(policyGate(rule).length === 0);
});
```

**Good** (one assertion per test):
```javascript
test('validator: valid rule passes', () => {
  assert.ok(validator.validate(validRule).valid);
});

test('validator: invalid rule fails', () => {
  assert.equal(validator.validate(invalidRule).valid, false);
});

test('policy gate: clean rule has no violations', () => {
  assert.ok(policyGate(rule).length === 0);
});
```

---

## Verification Checklist

Before accepting any PR (including AI-generated code):

### Clean Room Run
```bash
rm -rf node_modules coverage
npm ci
npm test
npm run test:coverage
```

**Assert**:
- [ ] Tests run on CI (not just locally)
- [ ] No skipped tests
- [ ] No reliance on machine-specific env (e.g., OPENAI_API_KEY for unit tests)
- [ ] Coverage ≥80% lines, ≥70% branches

### Test Quality
- [ ] Unit tests cover negative paths (missing fields, wrong types, out of range)
- [ ] Contract tests verify API doesn't break
- [ ] Fuzz tests cover enum/range enforcement
- [ ] Performance tests verify <500ms for 10k rules
- [ ] Golden tests provide regression safety

### Acceptance Tests (Manual)
Run these before accepting PR:

1. **Policy gate**: POST with `country_of_origin` → 400 with policy violation
2. **Enum reject**: `device: "desktop"` → error listing valid values
3. **Range reject**: `hour: 25` or `amount: -100` → range error with bounds
4. **Negation warning**: Single `agent_id != 'openai'` → warning (or block)
5. **PII scrubbing**: Change examples show `[REDACTED]` for user_id/seller_name

---

## Future Enhancements

### Integration Tests (Sprint 2+)
- Spin up test database (Supabase test project)
- Run EXPLAIN ANALYZE on dry-run queries
- Assert on query cost thresholds

### E2E Tests (Sprint 2+)
- Mock LLM calls
- Test full flow: `/api/rules/suggest` → validate → dry-run → apply
- Verify response shape

### Security Tests (Sprint 2+)
- Injection attempts in instruction field
- Expected: 400 with policy violation (not LLM hallucination)

---

## Quick Reference

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm run test:unit
npm run test:contract
npm run test:fuzz
npm run test:perf

# Run single test file
node --test tests/ruleValidator.test.js

# Run single test
node --test tests/ruleValidator.test.js -t "validator: valid rule passes"

# Watch mode (requires nodemon)
nodemon --exec "npm test" --watch tests --watch src

# Generate HTML coverage report
npm run test:coverage
open coverage/index.html
```

---

## Summary

**Testing is not optional when building safety-critical AI systems.**

When you write code (or accept AI-generated code):
1. ✅ Write tests **as you go** (not after)
2. ✅ Cover happy path **and** error paths
3. ✅ Hit coverage gates (≥80% lines, ≥70% branches)
4. ✅ Run clean room verification (`rm -rf node_modules && npm ci && npm test`)
5. ✅ Add golden tests for expected behavior
6. ✅ Verify CI passes before merging

**Remember**: Validators are your only defense before production. If they fail, invalid/biased rules reach users. Test thoroughly.

