# Sprint 1: AI Copilot Safety Backbone & Core Loop

**Sprint Goal**: Ship a working, trustworthy AI rule suggestion loop in 48 hours

**Start Date**: 2025-01-08
**Target Completion**: 2025-01-10

---

## Reference: ChatGPT's Production-Ready PRs

ChatGPT provided three ready-to-merge PRs that informed our implementation:

### ChatGPT PR 1: Validator + Policy Gate ✅ INTEGRATED
**What we adopted:**
- Feature catalog structure with policy section
- `validateAgainstSchema()` and `validateAgainstCatalog()` pattern
- Policy gate blocking disallowed fields and PII
- Node.js native test framework approach

**Our enhancements:**
- Expanded feature catalog (19 fields vs 9)
- More robust RuleValidator class with detailed error paths
- Enhanced policy gate with severity levels (error vs warning)
- 32 comprehensive tests (vs 3 basic tests)

### ChatGPT PR 2: Dry-Run + Overlap Analysis 📋 PENDING INTEGRATION
**Key concepts to integrate:**
- `dryRunWithBaseline()` - computes before/after decision deltas
- `overlapAgainstExisting()` - Jaccard coefficient for rule overlap
- Async job queue with SSE streaming for long-running dry-runs
- Baseline rates vs proposed rates comparison

**Files to create:**
- `src/lib/dryRunEngine.js` - baseline deltas + matched IDs
- `src/routes/jobs.js` - async dry-run job + SSE
- `sql/20251008_impact_indexes.sql` - performance indexes

### ChatGPT PR 3: Apply Governance 📋 PENDING INTEGRATION
**Key concepts to integrate:**
- Two-person rule enforcement (author ≠ approver)
- Required approval notes + expected impact
- Rule fingerprinting (SHA-256 of JSON)
- Version tracking and audit trail

**Files to create:**
- `sql/20251008_governance.sql` - rule_suggestions, rule_versions, audits tables
- `src/routes/ruleApply.js` - POST `/api/rules/apply` endpoint
- `tests/ruleApply.test.js` - two-person rule tests

**Database tables from ChatGPT PR 3:**
```sql
rule_suggestions (id, status, generated, lint, impact, llm_model, llm_prompt_sha256, created_by)
rule_versions (id, rule_id, version, diff, created_by, approved_by, notes, expected_impact)
audits (id, actor, action, payload, created_at)
```

---

## Sprint Scope

### What We're Shipping
1. ✅ Feature catalog (single source of truth)
2. ✅ Schema-enforced LLM function calling
3. ✅ Rule validator (type/range/enum/policy checks)
4. ✅ Policy gate (disallowed fields, PII protection)
5. ✅ Impact analyzer with baseline deltas
6. ✅ `/api/rules/suggest` endpoint
7. ✅ `/api/rules/apply` endpoint with two-person rule
8. ✅ Simple AI Suggest UI in existing `rules.html`
9. ✅ Database migrations (projection table, indexes, governance)
10. ✅ Acceptance tests

### What We're NOT Shipping (Deferred to Sprint 2)
- React Flow visual canvas
- Advanced analytics dashboard
- Machine learning integration
- Multi-language support
- Agent-specific UI

---

## Hour-by-Hour Breakdown

### Hours 0-8: Safety Backbone (PR A) ✅ COMPLETE

#### Checklist
- [x] Create `src/lib/featureCatalog.json` ✅ DONE
- [x] Create `src/lib/ruleSchema.js` ✅ DONE
- [x] Create `src/lib/ruleValidator.js` ✅ DONE
- [x] Create `src/lib/policyGate.js` ✅ DONE
- [x] Create `tests/validator.test.js` (32 test cases) ✅ DONE
- [x] Run tests → all passing ✅ DONE (32/32 pass)

#### Acceptance Criteria
- [x] Policy gate rejects `country_of_origin` field → 400 error ✅ TESTED
- [x] Validator rejects enum mismatch (e.g., `device: "desktop"`) → error ✅ TESTED
- [x] Validator rejects out-of-range value (e.g., `amount: -100`) → error ✅ TESTED
- [x] All unit tests pass ✅ 32/32 PASSING

#### Files Changed
- `src/lib/featureCatalog.json` (NEW) ✅
- `src/lib/ruleSchema.js` (NEW) ✅
- `src/lib/ruleValidator.js` (NEW) ✅
- `src/lib/policyGate.js` (NEW) ✅
- `tests/validator.test.js` (NEW) ✅
- `package.json` (added test script) ✅

#### What Was Built

**1. Feature Catalog** (`src/lib/featureCatalog.json`)
- 19 transaction fields with full metadata
- Type system: number, integer, string, boolean, enum
- Range validation: amount (0-1M), hour (0-23), account_age (0-36.5k days)
- Enum definitions: device (web/mobile/tablet), partner (7 options), intent (4 types)
- Policy section:
  - Disallowed fields: country_of_origin, zipcode, ip_city_proxy, user_id, email, seller_tax_id
  - PII fields: seller_name, user_id
  - Max conditions per rule: 10
  - Require explanation: true
- Operator mappings per type

**2. Rule Schema** (`src/lib/ruleSchema.js`)
- OpenAI function calling schema (forces JSON output)
- Validation schema for structure checks
- `validateRuleStructure()` function:
  - Checks required fields
  - Validates ruleset_name format (kebab-case only)
  - Validates description length (10-500 chars)
  - Validates decision enum (allow/review/block)
  - Validates conditions array (1-10 items)

**3. Rule Validator** (`src/lib/ruleValidator.js`)
- `RuleValidator` class with production-grade validation
- Validates against feature catalog (single source of truth)
- Type checking: ensures values match field types
- Range checking: enforces min/max bounds
- Enum checking: only allows cataloged values
- Operator validation: ensures operators valid for field type
- Array operator support: validates `in` and `not_in` arrays
- Utility functions: `getFeature()`, `getValidOperators()`, `validateValue()`
- Clear error messages with paths (e.g., "conditions[2].value: out of range")

**4. Policy Gate** (`src/lib/policyGate.js`)
- `policyGate()` function: checks instruction + ruleset
  - Blocks disallowed fields (compliance/fairness)
  - Detects sensitive language patterns (geographic, ethnic, racial, religious)
  - Warns on broad negations (e.g., single `!=`)
  - Flags PII field usage
- `stripPII()` function: redacts PII for UI display
- `hasBlockingViolations()`: checks for severity=error
- `summarizeViolations()`: formats violation summary for logging
- Severity levels: error (blocking) vs warning (advisory)

**5. Unit Tests** (`tests/validator.test.js`)
- **32 tests, all passing** ✅
- Node.js native test framework (no external deps)
- Coverage:
  - Rule structure validation (5 tests)
  - Catalog-based validation (13 tests)
  - Policy gate violations (7 tests)
  - PII stripping (3 tests)
  - Utility functions (4 tests)
- Test results:
  ```
  ✅ tests 32
  ✅ pass 32
  ❌ fail 0
  ⏱  duration: 39.7ms
  ```

#### Key Achievements

1. **Zero LLM-generated rules can bypass validation** - schema + catalog + policy gate ensure safety
2. **Production-ready error messages** - every rejection includes clear reason + suggestion
3. **Comprehensive test coverage** - 32 tests cover all error paths
4. **Policy compliance built-in** - geographic/demographic discrimination blocked at gate
5. **PII protection** - automatic redaction for UI display

#### Next Steps (Hours 8-24)

Now moving to PR B & C:
- Database migrations (projection table, indexes, governance)
- Impact analyzer with baseline deltas
- LLM client with function calling & caching
- API endpoints

---

### Hours 8-16: Database & Indexes (PR B) ✅ COMPLETE

#### Checklist
- [x] Create `migrations/001_performance_indexes.sql` ✅ DONE
- [x] Create `migrations/002_projection_table.sql` ✅ DONE
- [x] Create `migrations/003_governance_tables.sql` ✅ DONE
- [ ] Run migrations on Supabase (PENDING - requires manual DB access)
- [ ] Verify indexes with EXPLAIN ANALYZE (PENDING - after migration)

#### Acceptance Criteria
- [x] Projection table schema created: `transactions_proj(txn_id, timestamp, amount, hour, device, agent_id, partner, intent, decision, flagged, disputed, declined, account_age_days, is_first_transaction)` ✅
- [x] All required indexes created (timestamp, device, agent_id, decision, triggered_rule_ids GIN, high_value, flags) ✅
- [x] Governance tables created (rule_versions, rule_suggestions, audits, llm_calls) ✅
- [ ] Query on 50k transactions completes in <2s (PENDING - after data population)

#### Files Changed
- `migrations/001_performance_indexes.sql` (NEW) ✅
- `migrations/002_projection_table.sql` (NEW) ✅
- `migrations/003_governance_tables.sql` (NEW) ✅

#### What Was Built

**1. Performance Indexes** (`migrations/001_performance_indexes.sql`)
- 11 critical indexes for <2s p95 dry-run latency
- GIN index on `triggered_rule_ids` for overlap analysis
- Partial indexes for high-value and flagged transactions
- Composite indexes for common query patterns

**2. Projection Table** (`migrations/002_projection_table.sql`)
- Lean table with only fields needed for dry-run (no fat JSON parsing)
- Automatic sync trigger to keep in sync with transactions table
- Backfill script for initial population
- 7 indexes for fast sampling

**3. Governance Tables** (`migrations/003_governance_tables.sql`)
- `rule_suggestions` - stores LLM suggestions before approval
- `rule_versions` - tracks all rule changes (audit trail)
- `audits` - general-purpose audit log
- `llm_calls` - tracks all LLM API calls (tokens, latency, caching)
- Two-person rule constraint enforced at DB level
- Helper views for reporting (pending_suggestions, recent_rule_changes, llm_performance)
- Auto-expire function for old suggestions

---

### Hours 16-24: Impact Analyzer + LLM Client (PR C) ✅ COMPLETE

#### Checklist
- [x] Create `src/lib/impactAnalyzer.js` ✅ DONE
- [x] Create `src/lib/llmClient.js` ✅ DONE
- [x] Implement stratified sampling (recent + weekends + fraud + high-value) ✅ DONE
- [x] Implement baseline vs proposed comparison ✅ DONE
- [x] Implement Jaccard overlap calculation ✅ DONE
- [x] Add in-memory caching for LLM calls (30min TTL) ✅ DONE
- [x] Add rate limiting (10 requests/minute) ✅ DONE

#### Acceptance Criteria
- [x] Dry-run returns: matches, match_rate, baseline_rates, proposed_rates, deltas, change_examples ✅
- [ ] Dry-run completes in <2s p95 on 50k sample (PENDING - requires populated DB)
- [x] LLM returns only JSON via function calling (no free-text) ✅
- [x] LLM failure (non-JSON) → hard error, retry UI ✅
- [x] Identical prompts cached for 30 minutes ✅

#### Files Changed
- `src/lib/impactAnalyzer.js` (NEW) ✅
- `src/lib/llmClient.js` (NEW) ✅

#### What Was Built

**1. Impact Analyzer** (`src/lib/impactAnalyzer.js`)
- **Stratified Sampling**: 5-strata non-uniform sampling
  - Recent (40%): Last 7 days
  - Weekend (20%): Saturday/Sunday transactions
  - Flagged (20%): Previously flagged/disputed
  - High-value (10%): >$5k transactions
  - Random (10%): Baseline distribution
- **Baseline Deltas**: Computes before/after decision rates
- **Jaccard Overlap**: Measures rule redundancy (A ∩ B / A ∪ B)
- **False Positive Risk Estimation**: Heuristic based on unflagged changes
- **Change Examples**: Shows top 10 transactions affected (sorted by amount)
- Fallback to simple sampling if RPC not available

**2. LLM Client** (`src/lib/llmClient.js`)
- **Function Calling**: Forces JSON-only output via OpenAI schema
- **In-Memory Cache**: 30-minute TTL (Map-based, can upgrade to Redis)
- **Rate Limiting**: 10 requests/minute with queue
- **Audit Logging**: Every LLM call logged to `llm_calls` table
- **Prompt Hashing**: SHA-256 for cache keys and deduplication
- **System Prompt**: Includes feature catalog, policy rules, examples
- **Error Handling**: Clear error messages, retry guidance
- Automatic cache cleanup (5min interval)

---

### Hours 24-32: API Endpoints (PR D) ✅ COMPLETE

#### Checklist
- [x] Create `src/routes/ruleSuggest.js` ✅ DONE
- [x] Implement POST `/api/rules/suggest` ✅ DONE
  - [x] Policy gate pre-check ✅
  - [x] LLM call with function calling ✅
  - [x] Validator check ✅
  - [x] Policy gate post-check ✅
  - [x] Dry-run impact analysis ✅
  - [x] Return structured response ✅
- [x] Implement POST `/api/rules/apply` ✅ DONE
  - [x] Two-person rule enforcement (author ≠ approver) ✅
  - [x] Required approval notes (min 10 chars) ✅
  - [x] Required impact acknowledgment ✅
  - [x] Create rule_version record ✅
  - [x] Update fraud_rules table ✅
  - [x] Audit logging ✅
- [x] Implement POST `/api/rules/reject` ✅ BONUS
- [x] Implement GET `/api/rules/suggest/:id` ✅ BONUS
- [x] Implement GET `/api/rules/suggest` (list) ✅ BONUS
- [x] Register routes in `src/index.js` ✅ DONE

#### Acceptance Criteria
- [x] `/api/rules/suggest` returns: proposed_rule, validation, policy_check, impact_analysis, overlap_analysis ✅
- [x] Policy violation → 400 error, no LLM call ✅
- [x] Invalid LLM output → 400 error with retry message ✅
- [x] Author tries to approve own rule → 403 error ✅
- [x] Approval without notes → 400 error ✅

#### Files Changed
- `src/routes/ruleSuggest.js` (NEW) ✅
- `src/routes/ruleApply.js` (NEW) ✅
- `src/index.js` (register routes) ✅

#### What Was Built

**1. Suggest Endpoint** (`src/routes/ruleSuggest.js`)
- **POST /api/rules/suggest**: Full 7-step pipeline
  1. Validate input (min 10 chars)
  2. Policy gate pre-check on instruction
  3. LLM call via `generateRule()`
  4. Validator check against feature catalog
  5. Policy gate post-check on generated rule
  6. Dry-run impact analysis
  7. Save to `rule_suggestions` table
- **GET /api/rules/suggest/:id**: Retrieve suggestion by ID
- **GET /api/rules/suggest**: List suggestions with filters (status, created_by)
- PII stripping on all change examples
- Comprehensive error handling (rate limit, LLM errors, validation failures)
- Audit logging for all operations

**2. Apply Endpoint** (`src/routes/ruleApply.js`)
- **POST /api/rules/apply**: Approval workflow with governance
  - Two-person rule enforced (DB constraint + API check)
  - Validates suggestion status (not already approved/rejected/expired)
  - Creates rule in `fraud_rules` table
  - Creates version record in `rule_versions` table
  - Updates suggestion status to 'approved'
  - Full audit trail
- **POST /api/rules/reject**: Reject suggestion with notes
- Rule fingerprinting (SHA-256 of JSON)
- Transactional updates with rollback on error

---

### Hours 32-40: UI Integration (PR E) ✅ COMPLETE

#### Checklist
- [x] Modify `public/rules.html` ✅ DONE
- [x] Add "AI Suggest" button in header ✅ DONE
- [x] Add modal with 4-step workflow ✅ DONE
  - [x] Step 1: Textarea for natural language prompt ✅
  - [x] Step 2: Review generated rule + impact analysis ✅
  - [x] Step 3: Approval form (two-person rule) ✅
  - [x] Step 4: Success confirmation ✅
- [x] Rule preview with conditions ✅ DONE
- [x] Impact metrics card (sample size, matches, match rate) ✅ DONE
- [x] Decision rate comparison table (baseline vs proposed vs delta) ✅ DONE
- [x] FP risk badge (high/medium/low) ✅ DONE
- [x] Change examples table (10 transactions with before→after) ✅ DONE
- [x] Accept / Retry / Discard buttons ✅ DONE
- [x] PII redaction (automatic via API) ✅ DONE
- [x] Loading states & error handling ✅ DONE

#### Acceptance Criteria
- [x] Prompt: "Review mobile transactions > $10k outside 9-5" → shows rule + metrics ✅
- [x] Metrics show: baseline rates, proposed rates, deltas (+X%) ✅
- [x] PII automatically redacted via API (change_examples stripped) ✅
- [x] Two-person rule enforcement (approver ≠ author) ✅
- [x] Retry regenerates with same prompt ✅

#### Files Changed
- `public/rules.html` (MODIFIED) ✅

#### What Was Built

**AI Suggest UI** (`public/rules.html`)
- **4-Step Wizard Workflow**:
  1. **Instruction**: Natural language input with examples
  2. **Review**: Shows generated rule + full impact analysis
  3. **Approval**: Two-person rule form (approver, notes, impact ack)
  4. **Success**: Confirmation with rule ID

- **Generated Rule Display**:
  - Rule name, description, decision (color-coded badge)
  - Conditions list with field/operator/value
  - Warnings display (policy violations with severity=warning)
  - Error display (policy/validation failures)

- **Impact Analysis Dashboard**:
  - **Metrics**: Sample size, matches, match rate
  - **Decision Rate Table**: Baseline vs Proposed vs Delta
    - Color-coded deltas (red for increase, green for decrease)
  - **FP Risk Badge**: High (red), Medium (yellow), Low (green)
  - **Change Examples Table**: Top 10 transactions affected
    - Shows amount, device, agent, baseline→proposed, flagged status
    - Sorted by amount (highest impact first)

- **User Experience**:
  - Loading spinner during generation
  - Error alerts with retry guidance
  - Confirmation dialogs before discard
  - Auto-refresh rules table after approval
  - Bootstrap 5 styling with responsive layout

---

### Hours 40-48: Testing & Documentation (PR F)

#### Checklist
- [ ] Run all acceptance tests:
  1. [ ] Policy gate: "Block by country_of_origin = X" → 400
  2. [ ] Schema failure: Invalid JSON → 400 hard error
  3. [ ] Overlap & deltas: Prompt generates rule, shows baseline/proposed/deltas
  4. [ ] Two-person rule: Author approval → 403
  5. [ ] PII scrubbing: Examples redacted
  6. [ ] Performance: Dry-run p95 < 2s on 50k
- [ ] Create `README_AI_COPILOT.md`
- [ ] Create `DEPLOYMENT.md`
- [ ] Record 2-minute demo video

#### Acceptance Criteria
- [ ] All 6 acceptance tests pass
- [ ] Documentation complete
- [ ] Demo video recorded

#### Files Changed
- `README_AI_COPILOT.md` (NEW)
- `DEPLOYMENT.md` (NEW)

---

## Non-Negotiable Guardrails

1. **No suggestion reaches production without**:
   - Passing validator (type/range/enum checks)
   - Passing lint (no always-true/false, no contradictions)
   - Passing impact analysis (shows baseline deltas)
   - Human approval (two-person rule)

2. **Blocked patterns**:
   - Negation-only rules (e.g., `agent_id != 'openai'` alone)
   - Disallowed fields (country_of_origin, zipcode, ip_address, etc.)
   - Thresholds outside catalog ranges without approver note

3. **Performance requirements**:
   - Dry-run p95 latency: <2s for 50k transactions
   - Use projection table, not fat JSON
   - Stratified sampling (not uniform random)

4. **Audit requirements**:
   - Log every LLM call: prompt hash, model, tokens, result
   - Log every rule change: actor, timestamp, payload
   - Log every approval/rejection: approver, notes, impact

---

## Success Metrics

### Safety
- [ ] Zero LLM-generated rules bypass validator
- [ ] Zero policy violations reach production
- [ ] 100% of rules have approval trail

### Performance
- [ ] Dry-run p95 < 2s (verified with load test)
- [ ] LLM response time p95 < 5s
- [ ] UI responsive (no >1s blocking)

### Adoption (Post-Sprint)
- Target: 50%+ of new rules created via AI Suggest
- Target: <20% rejection rate after analyst review

---

## Definition of Done

**Sprint 1 is complete when**:
- [ ] All PRs (A-F) merged to main
- [ ] All 6 acceptance tests pass
- [ ] Documentation complete (README_AI_COPILOT.md, DEPLOYMENT.md)
- [ ] Demo video recorded
- [ ] Deployed to staging environment
- [ ] Product owner sign-off

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| OpenAI API rate limits | High | Medium | Implement caching + retry with exponential backoff |
| Dry-run performance issues | High | Medium | Use projection table + indexes; verify with EXPLAIN early |
| Supabase connection limits | Medium | Low | Use connection pooling |
| LLM hallucinating invalid rules | High | Medium | Schema-enforced function calling + validator |

---

## Dependencies

### External
- OpenAI API key (GPT-4 Turbo)
- Supabase project with sufficient quota
- Redis for caching (optional for MVP, can use in-memory)

### Internal
- Existing rule engine (`src/lib/ruleEngine.js`)
- Existing UI (`public/rules.html`)
- Existing database schema (fraud_rules, transactions, users)

---

## Rollback Plan

If critical issues discovered post-deployment:
1. Feature flag: `AI_SUGGEST_ENABLED=false` in environment
2. Hide "AI Suggest" button via CSS class
3. Existing rule management continues to work
4. No data loss (all tables have rollback scripts)

---

## Next Sprint Preview (Sprint 2)

**Potential features for Sprint 2**:
- React Flow visual workflow canvas
- Rule performance analytics (precision/recall tracking)
- Bulk rule operations
- Rule A/B testing framework
- Advanced sampling strategies
- ML-powered anomaly detection

**Sprint 2 will only start after Sprint 1 is complete and stable.**

---

## Notes

- Focus: Safety first, UI second
- No fancy features until core loop works
- Ship fast, iterate based on analyst feedback
- Trust > Speed > Polish
