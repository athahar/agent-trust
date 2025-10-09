# Sprint 2: Dry-Run + Overlap Analysis

**Status:** 📋 Planning
**Duration:** 5-7 days (40-56 hours)
**Prerequisites:** Sprint 1 complete (77/77 tests passing)

---

## 🎯 Goals

Enable analysts to **preview impact** before deploying a rule by:
1. **Dry-run on historical data** (baseline vs proposed comparison)
2. **Overlap analysis** (detect redundancy with existing rules)
3. **UI integration** (display results in rules dashboard)
4. **Test coverage with mocks** (fast, reliable CI without real API calls)

---

## 📦 Sprint 2 Deliverables

### Phase 2A: Database Migrations (Day 1, 4-6 hours)

**Create database infrastructure for dry-run:**

#### 1. Projection Table (`migrations/004_transactions_proj.sql`)

```sql
-- Lean projection table (no fat JSON parsing)
CREATE TABLE transactions_proj (
  txn_id VARCHAR(50) PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  hour INTEGER NOT NULL, -- extracted from timestamp
  device VARCHAR(20) NOT NULL,
  agent_id VARCHAR(50),
  partner VARCHAR(50),
  intent VARCHAR(50),
  decision VARCHAR(20) NOT NULL, -- allow/review/block
  flagged BOOLEAN DEFAULT false,
  disputed BOOLEAN DEFAULT false,
  declined BOOLEAN DEFAULT false,
  account_age_days INTEGER,
  is_first_transaction BOOLEAN,
  triggered_rule_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast querying
CREATE INDEX idx_proj_decision_ts ON transactions_proj(decision, timestamp DESC);
CREATE INDEX idx_proj_device ON transactions_proj(device);
CREATE INDEX idx_proj_agent_id ON transactions_proj(agent_id);
CREATE INDEX idx_proj_amount ON transactions_proj(amount);
CREATE INDEX idx_proj_flagged ON transactions_proj(flagged) WHERE flagged = true;
CREATE INDEX idx_proj_triggered ON transactions_proj USING gin(triggered_rule_ids);
```

**Why:** Lean table = fast queries (50k rows < 2s), no JSON parsing overhead

#### 2. Backfill Script (`scripts/backfillProjection.js`)

```javascript
// Backfill transactions_proj from transactions table
// Run once after migration
export async function backfillProjection(limit = 100000) {
  await supabase.rpc('backfill_projection', { row_limit: limit });
}
```

**Acceptance Criteria:**
- [ ] Projection table created with indexes
- [ ] Backfill script tested on 100k rows
- [ ] Queries on projection table < 100ms for 50k rows

**Files:**
- `migrations/004_transactions_proj.sql` (new)
- `scripts/backfillProjection.js` (new)

---

### Phase 2B: Dry-Run Engine (Days 1-2, 8-12 hours)

**Implement dry-run impact analyzer:**

#### Core Features:

**1. Stratified Sampling** (`src/lib/sampler.js`)
```javascript
export async function sampleTransactions(size = 50000) {
  // 5 strata (20% each):
  return {
    recent:    await sampleRecent(size * 0.2),      // last 7 days
    weekend:   await sampleWeekend(size * 0.2),     // Sat/Sun
    flagged:   await sampleFlagged(size * 0.2),     // flagged = true
    highValue: await sampleHighValue(size * 0.2),   // amount > $5k
    random:    await sampleRandom(size * 0.2)       // uniform random
  };
}
```

**2. Impact Metrics** (`src/lib/dryRunEngine.js`)
```javascript
export async function dryRunRule(rule, sampleSize = 50000) {
  // 1. Get stratified sample
  const sample = await sampleTransactions(sampleSize);

  // 2. Evaluate rule on each transaction
  const results = sample.map(txn => ({
    txn_id: txn.txn_id,
    baseline_decision: txn.decision,
    proposed_decision: evaluateRule(rule, txn)
  }));

  // 3. Compute metrics
  const baseline = computeRates(results, 'baseline_decision');
  const proposed = computeRates(results, 'proposed_decision');
  const deltas = computeDeltas(baseline, proposed);

  return {
    sample_size: results.length,
    matches: results.filter(r => r.proposed_decision !== r.baseline_decision).length,
    match_rate: matches / results.length,
    baseline_rates: baseline, // { allow: 0.92, review: 0.05, block: 0.03 }
    proposed_rates: proposed, // { allow: 0.90, review: 0.07, block: 0.03 }
    deltas: deltas,           // { review: +2.0%, allow: -2.0% }
    sample_examples: getTopExamples(results, 10), // top 10 changed txns
    false_positive_risk: estimateFPRisk(results)
  };
}
```

**3. Change Examples with PII Stripping** (`src/lib/piiStripper.js`)
```javascript
export function stripPII(transactions) {
  return transactions.map(txn => ({
    ...txn,
    user_id: '[REDACTED]',
    seller_name: '[REDACTED]',
    // Keep: txn_id, amount, device, hour, decisions
  }));
}
```

**4. Rule Evaluator** (`src/lib/ruleEvaluator.js`)
```javascript
export function evaluateRule(rule, transaction) {
  // Check if all conditions match
  const allMatch = rule.conditions.every(cond =>
    evaluateCondition(cond, transaction)
  );

  return allMatch ? rule.decision : transaction.decision;
}
```

**Performance Target:** 50k transactions < 2s (p95)

**Acceptance Criteria:**
- [ ] Stratified sampling returns diverse sample (5 strata)
- [ ] Dry-run returns baseline vs proposed comparison
- [ ] Change examples stripped of PII (user_id, seller_name)
- [ ] Performance: 50k transactions < 2s on projection table
- [ ] Unit tests: 10 tests for metric calculations

**Files:**
- `src/lib/sampler.js` (new)
- `src/lib/dryRunEngine.js` (new)
- `src/lib/ruleEvaluator.js` (new)
- `src/lib/piiStripper.js` (new)
- `tests/unit/dryRunEngine.test.js` (new, 10 tests)

---

### Phase 2C: Overlap Analyzer (Day 3, 4-6 hours)

**Detect redundancy with existing rules using Jaccard similarity:**

#### Implementation (`src/lib/overlapAnalyzer.js`)

```javascript
export async function analyzeOverlap(proposedRule, sampleSize = 10000) {
  // 1. Get sample transactions
  const sample = await sampleTransactions(sampleSize);

  // 2. Get all active rules
  const existingRules = await fetchActiveRules();

  // 3. Compute overlap for each existing rule
  const overlaps = existingRules.map(existingRule => {
    const proposedMatches = sample.filter(txn => evaluateRule(proposedRule, txn));
    const existingMatches = sample.filter(txn => evaluateRule(existingRule, txn));

    const intersection = proposedMatches.filter(txn =>
      existingMatches.includes(txn)
    );
    const union = [...new Set([...proposedMatches, ...existingMatches])];

    const jaccard = intersection.length / union.length;

    return {
      rule_id: existingRule.id,
      rule_name: existingRule.ruleset_name,
      jaccard_score: jaccard,
      overlap_pct: (jaccard * 100).toFixed(1) + '%',
      intersection_count: intersection.length,
      proposed_matches: proposedMatches.length,
      existing_matches: existingMatches.length
    };
  });

  // 4. Return top 5 by Jaccard score
  return overlaps
    .sort((a, b) => b.jaccard_score - a.jaccard_score)
    .slice(0, 5);
}
```

**Output Example:**
```json
{
  "top_overlaps": [
    {
      "rule_id": 42,
      "rule_name": "high-value-mobile",
      "jaccard_score": 0.87,
      "overlap_pct": "87.0%",
      "intersection_count": 435,
      "proposed_matches": 500,
      "existing_matches": 500,
      "recommendation": "High overlap - consider merging or disabling one"
    }
  ]
}
```

**Performance Target:** 10k sample, 20 existing rules → < 500ms

**Acceptance Criteria:**
- [ ] Overlap analysis returns top 5 rules by Jaccard score
- [ ] Jaccard calculation correct (intersection / union)
- [ ] Performance: 10k sample + 20 rules < 500ms
- [ ] Unit tests: 5 tests for Jaccard calculation

**Files:**
- `src/lib/overlapAnalyzer.js` (new)
- `tests/unit/overlapAnalyzer.test.js` (new, 5 tests)

---

### Phase 2D: API Endpoints (Day 4, 6-8 hours)

**Expose dry-run and overlap via REST API:**

#### 1. Dry-Run Endpoint (`src/routes/ruleDryRun.js`)

```javascript
import express from 'express';
import { dryRunRule } from '../lib/dryRunEngine.js';
import { analyzeOverlap } from '../lib/overlapAnalyzer.js';
import { RuleValidator } from '../lib/ruleValidator.js';
import { policyGate } from '../lib/policyGate.js';

const router = express.Router();

router.post('/api/rules/dryrun', async (req, res) => {
  const { rule, sample_size = 50000 } = req.body;

  // 1. Validate rule structure
  const validator = new RuleValidator();
  const validation = validator.validate(rule);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', validation });
  }

  // 2. Policy gate
  const violations = policyGate({ ruleset: { rules: [rule] } });
  if (violations.some(v => v.severity === 'error')) {
    return res.status(400).json({ error: 'Policy violation', violations });
  }

  // 3. Run dry-run
  const impact = await dryRunRule(rule, sample_size);

  // 4. Analyze overlap
  const overlap = await analyzeOverlap(rule, Math.min(sample_size, 10000));

  // 5. Audit log
  await auditLog({
    action: 'dryrun',
    actor: req.body.actor || 'unknown',
    rule,
    impact,
    overlap
  });

  res.json({
    validation,
    impact,
    overlap,
    timestamp: new Date().toISOString()
  });
});

export default router;
```

#### 2. Overlap Endpoint (Helper) (`src/routes/ruleOverlap.js`)

```javascript
// Optional: dedicated overlap endpoint for manual comparisons
router.post('/api/rules/overlap', async (req, res) => {
  const { rule, sample_size = 10000 } = req.body;
  const overlap = await analyzeOverlap(rule, sample_size);
  res.json({ overlap });
});
```

**Acceptance Criteria:**
- [ ] POST /api/rules/dryrun returns impact + overlap
- [ ] Validation + policy gate enforced before dry-run
- [ ] Audit logging for all dry-run calls
- [ ] Integration tests: 5 tests (happy path, validation fail, policy fail, etc.)

**Files:**
- `src/routes/ruleDryRun.js` (new)
- `src/routes/ruleOverlap.js` (optional, new)
- `tests/integration/api.dryrun.test.js` (new, 5 tests)

---

### Phase 2E: UI Integration (Day 5, 6-8 hours)

**Display dry-run results in rules.html:**

#### UI Changes:

**1. Add "🧪 Dry Run" Button**
```html
<!-- In rules.html, after "AI Suggest" button -->
<button id="dryRunBtn" class="btn-secondary">
  🧪 Dry Run
</button>
```

**2. Dry-Run Modal** (`public/js/dryRunModal.js`)
```javascript
function showDryRunResults(data) {
  const { impact, overlap } = data;

  // Display impact metrics
  renderImpactMetrics(impact); // baseline vs proposed rates, deltas

  // Display overlap warnings
  renderOverlapWarnings(overlap); // top 5 overlapping rules

  // Display change examples
  renderChangeExamples(impact.sample_examples); // 10 affected txns

  // Show accept/retry/discard buttons
  renderActionButtons();
}
```

**3. Visual Components:**
- **Impact Chart:** Bar chart showing baseline vs proposed rates
- **Overlap Table:** Top 5 rules with Jaccard scores
- **Change Examples Table:** Affected transactions (PII-stripped)
- **Action Buttons:** Accept (save rule), Retry (tweak), Discard

**Acceptance Criteria:**
- [ ] "🧪 Dry Run" button visible in rules.html
- [ ] Modal displays impact metrics, overlaps, examples
- [ ] Visual feedback (spinner during dry-run, error states)
- [ ] Action buttons work (accept → save rule, discard → close)

**Files:**
- `public/rules.html` (update)
- `public/js/dryRunModal.js` (new)
- `public/css/dryRun.css` (new)

---

### Phase 2F: Test Doubles & Integration Tests (Days 5-6, 10-12 hours)

**Add mocks for CI (no real DB/LLM calls):**

#### 1. Minimal Mock Setup

**Supabase Fixtures** (`tests/doubles/fixtures/db-transactions.json`)
```json
[
  {
    "txn_id": "tx_00001",
    "amount": 12000,
    "device": "mobile",
    "hour": 22,
    "decision": "allow",
    "flagged": false
  },
  // ... 1000 diverse transactions
]
```

**OpenAI Fixtures** (`tests/doubles/fixtures/llm-responses.json`)
```json
{
  "valid_mobile_rule": {
    "function_call": {
      "name": "generate_fraud_rule",
      "arguments": "{\"ruleset_name\":\"high-value-mobile\", ...}"
    }
  }
}
```

#### 2. Integration Tests

**Dry-Run API** (`tests/integration/api.dryrun.test.js`)
```javascript
test('POST /api/rules/dryrun - returns impact + overlap', async () => {
  // Mock Supabase with 1000 fixtures
  mockSupabase({ transactions: fixtures.transactions });

  const res = await request(app)
    .post('/api/rules/dryrun')
    .send({ rule: validRule, sample_size: 1000 });

  assert.equal(res.status, 200);
  assert.ok(res.body.impact.matches);
  assert.ok(res.body.overlap.top_overlaps);
});
```

**Target:** Add 15 integration tests (77 → 92 total)

**Acceptance Criteria:**
- [ ] 15+ integration tests pass with mocks
- [ ] No real DB/LLM calls in CI (env-key guard enforced)
- [ ] Tests run in < 30s (fast, deterministic)

**Files:**
- `tests/doubles/fixtures/db-transactions.json` (new, 1000 rows)
- `tests/doubles/fixtures/llm-responses.json` (new)
- `tests/integration/api.dryrun.test.js` (new, 5 tests)
- `tests/integration/dryRunEngine.test.js` (new, 5 tests)
- `tests/integration/overlapAnalyzer.test.js` (new, 5 tests)

---

### Phase 2G: CI & Documentation (Day 7, 4-6 hours)

#### 1. CI Enhancements (`.github/workflows/test.yml`)

```yaml
- name: Run integration tests (with mocks)
  run: npm run test:integration
  env:
    ALLOW_NETWORK_KEYS_FOR_TESTS: true

- name: Run performance tests
  run: npm run test:perf

- name: Check performance baseline
  run: node scripts/checkPerfBaseline.js
```

#### 2. Documentation

**Create SPRINT2_COMPLETE.md:**
- Dry-run implementation summary
- Overlap analysis details
- Performance benchmarks (50k < 2s)
- Test coverage (92 tests)

**Update CLAUDE.md:**
- Add dry-run testing section
- Add overlap analysis usage

**Update README_AI_COPILOT.md:**
- Add dry-run to "What Was Built"
- Update architecture diagram

**Acceptance Criteria:**
- [ ] CI runs all tests (unit + fuzz + perf + golden + integration)
- [ ] Performance baseline check passes
- [ ] Documentation complete

---

## ✅ Sprint 2 Acceptance Criteria

### Must Have (Blocking)
- [ ] **Dry-run** returns baseline vs proposed comparison
- [ ] **Dry-run** completes 50k transactions < 2s (p95)
- [ ] **Overlap analysis** returns top 5 rules with Jaccard scores
- [ ] **UI** displays dry-run results (impact + overlap + examples)
- [ ] **Integration tests** pass with mocks (15+ new tests)
- [ ] **Total tests:** 92+ passing (77 + 15 integration)
- [ ] **Coverage:** ≥80% lines, ≥70% branches
- [ ] **CI** fully green with no real API calls

### Should Have (High Priority)
- [ ] Stratified sampling (5 strata)
- [ ] PII stripping in change examples
- [ ] False positive risk heuristic
- [ ] Performance baseline check in CI
- [ ] Audit logging for all dry-runs

### Nice to Have (Defer to Sprint 3)
- Rule linter (moved to Sprint 3)
- Async dry-run with SSE (moved to Sprint 3)
- Contract test migration (moved to Sprint 3)

---

## 📊 Success Metrics

### Before Sprint 2:
- Tests: 77 (unit + fuzz + perf + golden)
- Coverage: ~85%
- CI time: ~1 minute
- Features: Validators, policy gate, schema

### After Sprint 2:
- Tests: 92+ (adds integration)
- Coverage: ≥80% (with dry-run/overlap code)
- CI time: ~2 minutes
- Features: + Dry-run, overlap analysis, UI integration

### Key Outcomes:
- ✅ Analysts see impact BEFORE deploying
- ✅ Overlap warnings prevent redundant rules
- ✅ Fast CI with mocks (no API costs)
- ✅ Performance validated (50k < 2s)

---

## 🗓 Sprint 2 Timeline

| Phase | Hours | Deliverable |
|-------|-------|-------------|
| 2A: Database | 4-6h | Projection table + indexes + backfill |
| 2B: Dry-Run | 8-12h | Sampler + engine + evaluator + PII stripper |
| 2C: Overlap | 4-6h | Jaccard analyzer + top 5 logic |
| 2D: APIs | 6-8h | /api/rules/dryrun + audit logging |
| 2E: UI | 6-8h | Dry-run modal + charts + tables |
| 2F: Tests | 10-12h | Fixtures + 15 integration tests |
| 2G: CI + Docs | 4-6h | CI updates + SPRINT2_COMPLETE.md |
| **Total** | **42-58h** | **5-7 days** |

---

## 🚨 Risk Mitigation

### Risk 1: Dry-run too slow (> 2s)
**Mitigation:**
- Use projection table (no JSON parsing)
- Add compound indexes on queried columns
- Run EXPLAIN ANALYZE, optimize queries
- Cache rule compilation results

### Risk 2: Integration tests flaky
**Mitigation:**
- Use deterministic fixtures (seeded data)
- Reset mocks between tests
- In-memory mocks only (no external services)
- Env-key guard prevents accidental real calls

### Risk 3: Overlap analysis inaccurate
**Mitigation:**
- Validate Jaccard calculation with unit tests
- Use sufficient sample size (10k+ transactions)
- Visual inspection of top overlaps
- Iterate based on analyst feedback

---

## 📋 Deferred to Sprint 3

These were originally in Sprint 2 but moved to reduce scope:

1. **Rule Linter** (logical error detection)
   - Defer to Sprint 3 for focused implementation
   - Sprint 2 focuses on dry-run + overlap (higher business value)

2. **Async Dry-Run with SSE**
   - Sprint 2: synchronous (< 2s is fast enough)
   - Sprint 3: async for 100k+ samples

3. **Contract Test Migration**
   - Sprint 2: adds integration tests with mocks
   - Sprint 3: migrate existing contract tests

---

**Sprint 2 Status:** 📋 Ready to start
**Next Step:** Begin Phase 2A (Database Migrations)
**Estimated completion:** 5-7 days from start
