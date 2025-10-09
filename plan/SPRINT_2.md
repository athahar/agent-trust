# Sprint 2: Integration Tests + Dry-Run Implementation

**Status:** 📋 Planning
**Duration:** 5-7 days
**Prerequisites:** Sprint 1 complete (77/77 tests passing)

---

## Goals

1. **Implement dry-run impact analysis** (core feature)
2. **Add integration tests** using mocks (raise test count to 100+)
3. **Complete contract test coverage** with Supabase/OpenAI mocks
4. **Add rule linter** to catch logical errors
5. **Performance optimization** for 50k transaction dry-runs

---

## Sprint 2 Deliverables

### A. Dry-Run Implementation (Days 1-3)

**Impact Analyzer Core** (`src/lib/impactAnalyzer.js` - already exists but needs completion)

**Features to implement:**
1. **Stratified Sampling**
   - 5 strata: recent (20%), weekend (20%), flagged (20%), high-value (20%), random (20%)
   - Ensures representative sample across time/risk/value dimensions
   - Target: 50k transactions < 2s (p95)

2. **Baseline vs Proposed Comparison**
   ```javascript
   {
     sample_size: 50000,
     matches: 237,
     match_rate: "0.47%",
     baseline_rates: { block: "1.2%", review: "5.3%", allow: "93.5%" },
     proposed_rates: { block: "1.2%", review: "5.77%", allow: "93.03%" },
     deltas: { block: "+0.0%", review: "+0.47%", allow: "-0.47%" },
     false_positive_risk: "low" // heuristic based on unflagged matches
   }
   ```

3. **Change Examples (PII-Stripped)**
   - Top 10 transactions affected by new rule
   - Show: txn_id, amount, device, hour, current_decision → new_decision
   - Strip PII: user_id → "[REDACTED]", seller_name → "[REDACTED]"

4. **Performance Optimization**
   - Use `transactions_proj` table (lean columns, no JSON parsing)
   - Parallel rule evaluation (Promise.all for multiple rules)
   - Query optimization with EXPLAIN ANALYZE
   - Target: 50k transactions evaluated in < 2s

**Files:**
- `src/lib/impactAnalyzer.js` (enhance existing)
- `tests/integration/impactAnalyzer.test.js` (new)

---

### B. Rule Linter (Days 1-2)

**Linter Implementation** (`src/lib/linter.js` - new)

**Detects:**
1. **Always-true conditions**
   ```javascript
   // Bad: amount > 0 (always true since catalog min is 0)
   // Lint: "Condition 'amount > 0' is always true (min: 0)"
   ```

2. **Always-false conditions**
   ```javascript
   // Bad: amount > 1000000 (max is 1000000)
   // Lint: "Condition 'amount > 1000000' is always false (max: 1000000)"
   ```

3. **Contradictions**
   ```javascript
   // Bad: amount > 5000 AND amount < 1000
   // Lint: "Contradictory conditions: amount cannot be > 5000 AND < 1000"
   ```

4. **Redundant conditions**
   ```javascript
   // Bad: device == "mobile" AND device == "mobile"
   // Lint: "Duplicate condition: device == 'mobile' appears 2 times"
   ```

5. **Overly complex rules**
   ```javascript
   // Bad: 11 conditions (policy max is 10)
   // Already caught by validator, but linter warns at 7+
   ```

6. **Broad negations** (already in policy gate)
   ```javascript
   // Bad: agent_id != "openai" (allows all others)
   // Suggest: agent_id in ["anthropic", "gemini", ...] (explicit allow-list)
   ```

**Linter Output:**
```javascript
{
  warnings: [
    { type: "always_true", field: "amount", message: "..." },
    { type: "redundant", field: "device", message: "..." }
  ],
  errors: [
    { type: "contradiction", fields: ["amount"], message: "..." }
  ],
  blocking: false // warnings don't block, errors do
}
```

**Files:**
- `src/lib/linter.js` (new)
- `tests/unit/linter.test.js` (new, 20+ tests)

---

### C. Integration Tests with Mocks (Days 3-5)

**Implement Test Doubles:**

1. **Supabase Mock** (`tests/doubles/supabase.mock.js` - skeleton exists)
   - In-memory query engine (supports select, where, order, limit)
   - Fixtures: 1000 sample transactions, 20 sample rules
   - Helper: `mockSupabase(fixtures)` injects mock before imports

2. **OpenAI Mock** (`tests/doubles/openai.mock.js` - skeleton exists)
   - Fixture-based responses (10+ pre-defined LLM outputs)
   - Response mapping by keyword (e.g., "mobile" → mobile_rule_fixture)
   - Helper: `mockOpenAI(responsesMap)` injects mock

3. **Fixtures** (new)
   - `tests/doubles/fixtures/llm-responses.json` (10+ valid/invalid rule responses)
   - `tests/doubles/fixtures/db-transactions.json` (1000 diverse transactions)
   - `tests/doubles/fixtures/db-rules.json` (20 sample fraud rules)

**Integration Tests:**

1. **API Suggest Endpoint** (`tests/integration/api.suggest.test.js`)
   ```javascript
   test('POST /api/rules/suggest - end-to-end with mocks', async () => {
     // Mock Supabase with fixtures
     const supabase = mockSupabase({ transactions: [...], rules: [...] });

     // Mock OpenAI with valid response
     const openai = mockOpenAI({ defaultResponse: validRuleFixture });

     const res = await request(app)
       .post('/api/rules/suggest')
       .send({ instruction: 'Review mobile over $10k', actor: 'test@example.com' });

     assert.equal(res.status, 200);
     assert.ok(res.body.suggestion_id);
     assert.ok(res.body.impact_analysis.matches > 0);
     assert.equal(res.body.validation.valid, true);
   });
   ```

2. **API Apply Endpoint** (`tests/integration/api.apply.test.js`)
   - Test two-person rule enforcement
   - Test DB inserts (rule_versions, audits)
   - Test approval flow

3. **API Reject Endpoint** (`tests/integration/api.reject.test.js`)
   - Test suggestion status update
   - Test audit logging

4. **LLM Client** (`tests/integration/llm.client.test.js`)
   - Test function calling with mocked responses
   - Test caching logic
   - Test error handling (malformed JSON, timeout)

5. **Impact Analyzer** (`tests/integration/impactAnalyzer.test.js`)
   - Test stratified sampling logic
   - Test baseline vs proposed calculation
   - Test PII stripping in change examples
   - Test performance (50k fixtures < 2s)

**Target:** Add 30+ integration tests (77 → 107+ total)

**Files:**
- `tests/integration/api.suggest.test.js` (new, 10 tests)
- `tests/integration/api.apply.test.js` (new, 8 tests)
- `tests/integration/api.reject.test.js` (new, 5 tests)
- `tests/integration/llm.client.test.js` (new, 7 tests)
- `tests/integration/impactAnalyzer.test.js` (new, 10 tests)

---

### D. Contract Tests Migration (Day 5)

**Migrate existing contract tests to use mocks:**

Currently `tests/contract/api.contract.test.js` is skipped in CI because it requires real DB/LLM.

**Changes:**
1. Inject Supabase mock at top of file
2. Inject OpenAI mock at top of file
3. Update assertions to match mocked responses
4. Add to CI pipeline (remove from skip list)

**Target:** All contract tests pass with mocks

---

### E. CI/CD Enhancements (Day 6)

**Update `.github/workflows/test.yml`:**

1. **Add integration test job**
   ```yaml
   - name: Run integration tests (with mocks)
     run: npm run test:integration
     env:
       ALLOW_NETWORK_KEYS_FOR_TESTS: true  # Allow mocks to run
   ```

2. **Add contract test job** (now that mocks are implemented)
   ```yaml
   - name: Run contract tests (with mocks)
     run: npm run test:contract
   ```

3. **Performance baseline check** (Sprint 2 Week 2)
   ```yaml
   - name: Check performance regressions
     run: node scripts/checkPerfBaseline.js
   ```

4. **Coverage gates remain strict**
   - Lines ≥80%, Branches ≥70%
   - Now includes integration tests

---

### F. Documentation Updates (Day 7)

**Update docs with Sprint 2 features:**

1. **SPRINT2_COMPLETE.md** (new)
   - Dry-run implementation details
   - Integration test coverage (107+ tests)
   - Linter rules and examples
   - Performance benchmarks (50k dry-run < 2s)

2. **CLAUDE.md** (update)
   - Add integration testing section
   - Add linter usage examples
   - Add dry-run API documentation

3. **README_AI_COPILOT.md** (update)
   - Add dry-run feature to "What Was Built"
   - Update architecture diagram with dry-run flow
   - Add linter to "Safety Backbone" section

---

## Sprint 2 Acceptance Criteria

### Must Have ✅
- [ ] Dry-run returns baseline vs proposed comparison
- [ ] Dry-run completes 50k transactions < 2s (p95)
- [ ] Linter detects always-true, always-false, contradictions
- [ ] Integration tests pass with mocks (30+ new tests)
- [ ] Contract tests pass with mocks (migrated from skip)
- [ ] All 107+ tests pass in CI (unit + fuzz + perf + golden + integration + contract)
- [ ] Coverage ≥80% lines, ≥70% branches (including new code)

### Should Have 🎯
- [ ] PII stripping in change examples
- [ ] Stratified sampling (5 strata)
- [ ] False positive risk heuristic
- [ ] Linter warnings shown in UI
- [ ] Performance baseline check in CI

### Nice to Have 💡
- [ ] Overlap analysis (Jaccard similarity with existing rules)
- [ ] Rule explanation (LLM generates human-readable summary)
- [ ] Async dry-run with SSE progress updates

---

## Risk Mitigation

### Risk 1: Dry-run too slow (> 2s for 50k)
**Mitigation:**
- Use `transactions_proj` table (no JSON parsing)
- Add compound indexes on frequently queried columns
- Run EXPLAIN ANALYZE on dry-run queries
- Cache rule compilation results

### Risk 2: Integration tests flaky
**Mitigation:**
- Use deterministic fixtures (no random data)
- Reset mocks between tests
- Use in-memory mocks (no external services)
- Clear call logs after each test

### Risk 3: Linter false positives
**Mitigation:**
- Start with conservative rules (only obvious errors)
- Make lint warnings non-blocking
- Add escape hatch: `// lint-ignore: always-true`
- Iterate based on user feedback

---

## Sprint 2 Timeline

| Day | Tasks | Deliverable |
|-----|-------|-------------|
| 1 | Linter implementation | linter.js + 20 unit tests |
| 2 | Dry-run core (stratified sampling) | impactAnalyzer.js enhanced |
| 3 | Supabase/OpenAI mocks + fixtures | Test doubles complete |
| 4 | Integration tests (suggest/apply/reject) | 20+ integration tests |
| 5 | Integration tests (LLM/impact) + contract migration | 10+ tests, contract passing |
| 6 | CI enhancements + perf baseline check | CI fully green |
| 7 | Documentation + Sprint 2 wrap-up | SPRINT2_COMPLETE.md |

---

## Success Metrics

**Before Sprint 2:**
- Tests: 77 (unit + fuzz + perf + golden)
- Coverage: ~85%
- CI time: ~1 minute
- Features: Validators, policy gate, schema

**After Sprint 2:**
- Tests: 107+ (adds integration + contract)
- Coverage: ≥80% (with new dry-run/linter code)
- CI time: ~2 minutes (adds integration tests)
- Features: + Dry-run, linter, mocked integration tests

**Key Outcomes:**
- ✅ Dry-run feature complete and tested
- ✅ Linter catches logical errors
- ✅ Full integration test coverage with mocks
- ✅ No dependency on real Supabase/OpenAI in CI
- ✅ Performance benchmarks established

---

## Next Sprint Preview (Sprint 3)

- Async dry-run with SSE (for large samples)
- Overlap analysis (compare with existing rules)
- UI enhancements (linter warnings, impact dashboard)
- E2E tests (full flow with UI automation)
- Rule versioning and rollback

---

**Sprint 2 Status:** 📋 Ready to start
**Prerequisites:** ✅ Sprint 1 complete (77/77 tests passing)
**Estimated effort:** 5-7 days (40-56 hours)
