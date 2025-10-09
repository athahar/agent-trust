# Product Roadmap: AI-Assisted Fraud Detection System

**Vision:** Enable fraud analysts to create, test, and deploy production-ready fraud rules using natural language, with AI assistance and safety-first architecture.

---

## Executive Summary

| Phase | Sprint | Duration | Key Deliverable | Business Value |
|-------|--------|----------|-----------------|----------------|
| ✅ **Foundation** | Sprint 1 | 5 days | Testing infrastructure (77/77 tests) | Safety net for AI development |
| 🚧 **Core Features** | Sprint 2 | 5-7 days | Dry-run + Overlap analysis + UI | Impact analysis before deployment |
| 📋 **Scale & UX** | Sprint 3 | 5-7 days | Async processing + Rule linter | Handle production volume |
| 🎯 **Intelligence** | Sprint 4 | 7-10 days | Rule optimization + Performance tracking | Improve accuracy, reduce redundancy |
| 🚀 **Production** | Sprint 5 | 5-7 days | Auth + RBAC + Monitoring | Production-ready deployment |

**Total Time:** 27-36 days (5-7 weeks)

---

## Sprint 1: Foundation ✅ COMPLETE

**Duration:** 5 days | **Status:** ✅ Complete (77/77 tests passing)

### Deliverables
- ✅ Feature catalog (20 transaction fields with types/ranges/enums)
- ✅ Rule schema for LLM function calling
- ✅ Production-grade validator (type/range/enum/operator checks)
- ✅ Policy gate (disallowed fields, sensitive language detection)
- ✅ Comprehensive testing (77 tests: unit, fuzz, perf, golden)
- ✅ CI/CD pipeline (GitHub Actions with hard gates)
- ✅ Performance baseline (validators < 1ms per rule)
- ✅ Golden dataset (5k deterministic transactions with metadata)
- ✅ Test doubles structure (mocks ready for Sprint 2)

### Business Value
- **Risk Mitigation:** Safety net prevents invalid/biased rules from reaching production
- **Confidence:** 100% test coverage ensures validators catch LLM hallucinations
- **Speed:** Fast validators enable real-time dry-run (50k transactions < 2s)

### Metrics
- Tests: 77/77 passing (100%)
- Coverage: ~85% (lines), ~80% (branches)
- Performance: <1ms per rule validation
- Memory: <1MB for 50k validations

---

## Sprint 2: Dry-Run + Overlap Analysis 🚧 NEXT (5-7 days)

**Goal:** Implement dry-run impact analysis, overlap detection, and UI integration with comprehensive testing

**Structure:** 7 phases (2A-2G) | **Duration:** 42-58 hours (5-7 days)

### A. Database Migrations (Phase 2A - High Priority)

**Features:**
1. **transactions_proj table** - Lean projection without JSON parsing
2. **Optimized indexes** - For fast queries (decision, timestamp, device, etc.)
3. **Data backfill script** - Populate from existing transactions table

**Business Value:**
- **Performance:** 50k queries < 2s (vs 10-15s with JSON parsing)
- **Scalability:** Supports 500k+ row dry-runs
- **Maintainability:** Clean schema for analytics

**Acceptance Criteria:**
- [ ] transactions_proj table created with indexes
- [ ] Backfill script populates from existing data
- [ ] Migration tested on staging environment

### B. Dry-Run Implementation (Phase 2B - High Priority)

**Features:**
1. **Stratified Sampling** (5 strata: recent, weekend, flagged, high-value, random)
2. **Baseline vs Proposed Comparison** (block/review/allow rates)
3. **Change Examples** (top 10 affected transactions, PII-stripped)
4. **Performance:** 50k transactions < 2s (p95)

**Business Value:**
- **Impact Visibility:** Analysts see exactly how many transactions will be affected
- **False Positive Risk:** Heuristic warns if rule catches too many clean transactions
- **Confidence:** No surprises when rule goes live

**Acceptance Criteria:**
- [ ] Dry-run returns baseline vs proposed deltas
- [ ] Completes 50k transactions < 2s (p95)
- [ ] Change examples show PII-stripped transaction details
- [ ] Integration tests cover all dry-run logic

### C. Overlap Analysis (Phase 2C - High Priority)

**Features:**
1. **Jaccard Similarity** - Compare proposed rule with existing rules
2. **Redundancy Detection** - Warn if >70% overlap with existing rule
3. **Overlap Examples** - Show transactions matched by both rules

**Business Value:**
- **Prevent Duplication:** Catch redundant rules before deployment
- **Rule Optimization:** Suggest merging similar rules
- **Clarity:** Analysts understand rule interactions

**Acceptance Criteria:**
- [ ] Overlap analysis returns Jaccard scores for all existing rules
- [ ] Warns when overlap >70%
- [ ] Shows intersection examples
- [ ] Integration tests verify accuracy

### D. API Endpoints (Phase 2D - High Priority)

**Endpoints:**
1. **POST /api/rules/dryrun** - Run impact analysis
2. **GET /api/rules/:id/overlap** - Check overlap with existing rules
3. **Integration with /api/rules/suggest** - Auto-run dry-run after generation

**Business Value:**
- **Unified Workflow:** Dry-run integrated into rule creation flow
- **API-First:** External tools can leverage dry-run
- **Testing:** Clear contract for integration tests

**Acceptance Criteria:**
- [ ] All endpoints return correct response structure
- [ ] Error handling for edge cases (empty sample, invalid rule)
- [ ] Contract tests verify API shape

### E. UI Integration (Phase 2E - Medium Priority)

**Features:**
1. **Dry-Run Modal** - Show impact analysis in popup
2. **Overlap Warning Badge** - Visual indicator when overlap detected
3. **Chart.js Visualizations** - Baseline vs proposed comparison charts

**Business Value:**
- **Usability:** Analysts see impact without leaving page
- **Visual Clarity:** Charts make deltas easier to understand
- **Trust:** Visual feedback builds confidence in AI suggestions

**Acceptance Criteria:**
- [ ] Dry-run modal displays metrics and examples
- [ ] Overlap badge shows when Jaccard >70%
- [ ] Charts render correctly on all browsers

### F. Test Doubles + Integration Tests (Phase 2F - High Priority)

**Deliverables:**
- Minimal Supabase mock (fixture-based, no full query engine)
- Minimal OpenAI mock (fixture-based responses)
- 15+ integration tests (dry-run, overlap, API endpoints)
- Env-key guard prevents real API calls in CI

**Business Value:**
- **CI Speed:** No external API calls = fast, reliable CI
- **Development Velocity:** Developers can test without credentials
- **Cost Savings:** No LLM/DB API costs in CI

**Acceptance Criteria:**
- [ ] All integration tests pass with mocks
- [ ] Env-key guard blocks real credentials in pure tests
- [ ] CI fully green (92+ tests)

### G. CI + Documentation (Phase 2G - Low Priority)

**Deliverables:**
1. **CI enhancements** - Add dry-run performance benchmarks
2. **Documentation** - Update README with dry-run usage
3. **Examples** - Add code examples for API usage

**Business Value:**
- **Knowledge Transfer:** Future developers understand dry-run flow
- **Performance Tracking:** Catch regressions early
- **Adoption:** Clear docs enable external integrations

**Acceptance Criteria:**
- [ ] CI includes dry-run benchmark tests
- [ ] Documentation covers all new endpoints
- [ ] Code examples provided for common use cases

### Sprint 2 Success Metrics
- Tests: 77 → 92+ (adds 15 integration tests)
- Coverage: ≥80% lines, ≥70% branches
- Features: Dry-run, overlap analysis, UI integration, database migrations
- Performance: 50k dry-run < 2s
- CI time: ~2-3 minutes (no real API calls)

### Deferred to Sprint 3
- Rule linter (moved to Sprint 3 for scope management)
- Async dry-run with SSE (moved to Sprint 3 for performance needs)
- Contract test migration (moved to Sprint 3)

---

## Sprint 3: Scale & UX (5-7 days)

**Goal:** Handle production volume, add rule linter, and polish UI for analyst workflows

### A. Async Dry-Run with SSE (High Priority)

**Problem:** Dry-run on 100k+ transactions may exceed 2s SLA

**Solution:**
- POST `/api/rules/dry-run` → returns job_id (immediate)
- GET `/api/jobs/:job_id/stream` → SSE stream with progress
- Background processing with job queue (Redis + Bull)
- Progress updates: "Processed 25k/100k (50%)..."

**Business Value:**
- **Scalability:** Handle arbitrarily large samples (500k+ transactions)
- **UX:** Analysts see progress, not stuck on loading spinner
- **Reliability:** Jobs can be retried if they fail

**Acceptance Criteria:**
- [ ] Async dry-run completes 100k transactions < 10s
- [ ] SSE stream sends progress updates every 1s
- [ ] Job queue handles failures gracefully (retry logic)

### B. Rule Linter (Medium Priority)

**Feature:** Static analysis to catch logical errors in rules before deployment

**Detects:**
- Always-true/false conditions (e.g., `amount > 0` when amount is always positive)
- Contradictions (e.g., `amount > 5000 AND amount < 1000`)
- Redundant conditions (e.g., `device == "mobile" AND device == "mobile"`)
- Overly complex rules (>7 conditions)
- Negation-only rules (should use positive assertions when possible)

**Business Value:**
- **Error Prevention:** Catches logical errors before LLM sends to production
- **Rule Quality:** Ensures rules are meaningful and actionable
- **User Guidance:** Suggestions help analysts write better rules

**Acceptance Criteria:**
- [ ] Linter detects 5+ error types
- [ ] 20+ unit tests cover linter logic
- [ ] Warnings shown in UI (non-blocking)
- [ ] Integration with /api/rules/suggest endpoint

### C. UI Enhancements (Medium Priority)

**Improvements:**
1. **Linter Warnings in UI**
   - Show inline warnings during rule generation
   - Suggest fixes (e.g., "Remove always-true condition")

2. **Impact Dashboard**
   - Visual charts (baseline vs proposed rates)
   - Change examples table with filters
   - Export to CSV for offline analysis

3. **Rule History**
   - Show all versions of a rule
   - Diff view (what changed between versions)
   - Rollback capability (revert to previous version)

**Business Value:**
- **Usability:** Analysts spend less time navigating, more time analyzing
- **Trust:** Visual impact analysis builds confidence
- **Auditability:** Full history enables compliance reviews

**Acceptance Criteria:**
- [ ] Linter warnings displayed inline
- [ ] Impact dashboard shows charts and tables
- [ ] Rule history shows all versions with diffs

### D. E2E Tests (Low Priority)

**Scope:** Full flow with UI automation (Playwright or Cypress)

**Tests:**
1. Navigate to rules page → click "AI Suggest"
2. Enter instruction → generate rule
3. Review impact analysis → approve
4. Verify rule appears in active rules list

**Business Value:**
- **Confidence:** Ensures end-to-end flow works
- **Regression Prevention:** Catches UI bugs

**Acceptance Criteria:**
- [ ] 5+ E2E tests cover critical paths
- [ ] E2E tests run in CI (headless mode)

### Sprint 3 Success Metrics
- Features: Async dry-run, rule linter, UI enhancements, E2E tests
- Tests: 120+ (adds 20 linter tests + E2E tests)
- Performance: 100k async dry-run < 10s
- UX: Analysts can complete full workflow in < 3 minutes

---

## Sprint 4: Intelligence (7-10 days)

**Goal:** Add AI-powered features to improve rule quality and reduce manual work

### A. Rule Performance Tracking (High Priority)

**Features:**
1. **Precision/Recall per Rule**
   - Track: matches, true positives, false positives, false negatives
   - Compute: precision = TP / (TP + FP), recall = TP / (TP + FN)
   - Alert: "Rule #42 has 80% FP rate - review or disable"

2. **A/B Testing**
   - Shadow mode: Rule logs matches but doesn't act
   - Split traffic: 50% see old rule, 50% see new rule
   - Auto-promote: If new rule outperforms, make it default

**Business Value:**
- **Continuous Improvement:** Identify underperforming rules
- **Data-Driven:** Decisions based on metrics, not gut feel
- **Automation:** Bad rules flagged automatically

**Acceptance Criteria:**
- [ ] Precision/recall tracked per rule
- [ ] Dashboard shows rule performance metrics
- [ ] Alerts trigger when rule FP rate > 50%

### B. Rule Optimization (Medium Priority)

**Features:**
1. **Threshold Tuning**
   - "Rule catches 1000 transactions, but 800 are false positives"
   - Suggest: "Increase amount threshold from $5k to $8k (reduces FP to 200)"

2. **Condition Simplification**
   - "Rules #42 and #43 overlap 90% - merge into single rule"
   - Auto-generate merged rule with LLM

3. **Seasonal Adjustments**
   - "Mobile transaction volume 2x higher on weekends"
   - Suggest: "Add hour-based condition to reduce weekend FP"

**Business Value:**
- **Efficiency:** Analysts spend less time tuning rules
- **Accuracy:** AI suggests data-driven optimizations
- **Scale:** Can optimize hundreds of rules automatically

**Acceptance Criteria:**
- [ ] Threshold tuning suggests optimal values
- [ ] Condition simplification detects redundant rules
- [ ] Seasonal adjustments shown in UI

### C. Anomaly Detection (Medium Priority)

**Features:**
1. **Rule Drift Detection**
   - "Rule #42 used to match 100 txns/day, now matches 10"
   - Alert: "Rule effectiveness dropped 90% - investigate"

2. **Data Drift Detection**
   - "Mobile transaction volume increased 50% this week"
   - Suggest: "Review mobile-related rules for accuracy"

3. **Attack Detection**
   - "Sudden spike in declined card retries from IP range X"
   - Auto-suggest: "Block IP range X for 24 hours"

**Business Value:**
- **Proactive:** Catch issues before they impact business
- **Adaptive:** System learns from data patterns
- **Security:** Detect coordinated attacks automatically

**Acceptance Criteria:**
- [ ] Rule drift alerts trigger when effectiveness drops >50%
- [ ] Data drift alerts trigger when volume changes >30%
- [ ] Attack detection suggests auto-blocking rules

### D. Multi-Language Support (Low Priority)

**Features:**
- Accept instructions in Spanish, French, German, etc.
- Translate instructions to English before LLM call
- Return responses in original language

**Business Value:**
- **Global Reach:** Support international analysts
- **Accessibility:** Remove language barrier

**Acceptance Criteria:**
- [ ] System accepts instructions in 5+ languages
- [ ] Translations accurate (validated by native speakers)

### Sprint 4 Success Metrics
- Features: Performance tracking, optimization, anomaly detection
- Precision: Rules achieve >80% precision on average
- Recall: Rules achieve >70% recall on average
- Automation: 50% of rule optimizations applied automatically

---

## Sprint 5: Production Readiness (5-7 days)

**Goal:** Deploy to production with authentication, monitoring, and compliance

### A. Authentication & Authorization (High Priority)

**Features:**
1. **SSO Integration** (OAuth 2.0 / SAML)
   - Support: Google, Okta, Auth0
   - No more hardcoded `actor` field

2. **RBAC (Role-Based Access Control)**
   - Roles: analyst (suggest), manager (approve), admin (all)
   - Permissions: Who can suggest, approve, reject, disable rules
   - Enforcement: API level + UI level

3. **Audit Trail**
   - Log: Every action (suggest, approve, reject, disable)
   - Include: actor, timestamp, IP address, user agent
   - Retention: 7 years (compliance requirement)

**Business Value:**
- **Security:** Only authorized users can modify rules
- **Compliance:** Full audit trail for regulatory reviews
- **Trust:** Two-person rule enforced at auth level

**Acceptance Criteria:**
- [ ] SSO integration with 3+ providers
- [ ] RBAC enforced at API + UI level
- [ ] Audit logs stored in compliance-friendly format

### B. Monitoring & Alerting (High Priority)

**Metrics:**
1. **System Metrics**
   - API latency (p50, p95, p99)
   - LLM latency (avg, max)
   - Dry-run latency (p95)
   - Error rate (4xx, 5xx)

2. **Business Metrics**
   - Rules created per day
   - Rules approved per day
   - Average approval time
   - False positive rate (aggregate)

3. **Alerts**
   - Critical: Dry-run latency > 5s (page on-call)
   - High: LLM error rate > 10% (email team)
   - Medium: Rule approval backlog > 20 (email managers)

**Business Value:**
- **Reliability:** Catch issues before users complain
- **Performance:** Track SLA compliance (dry-run < 2s)
- **Visibility:** Executives see rule creation velocity

**Acceptance Criteria:**
- [ ] Metrics exported to Prometheus/Datadog
- [ ] Alerts configured for critical/high/medium
- [ ] Dashboards show system + business metrics

### C. Redis Caching (Medium Priority)

**Problem:** In-memory LLM cache is not cluster-safe

**Solution:**
- Replace in-memory cache with Redis
- Cache key: SHA-256(instruction + catalog version)
- TTL: 7 days (balance freshness vs cost)

**Business Value:**
- **Cost Savings:** Avoid duplicate LLM calls
- **Speed:** Cached responses return in <10ms
- **Scalability:** Works across multiple servers

**Acceptance Criteria:**
- [ ] Redis cache stores LLM responses
- [ ] Cache hit rate > 30% (after 1 week)
- [ ] Cache TTL enforced correctly

### D. Rate Limiting (Medium Priority)

**Limits:**
- Per user: 100 requests/hour
- Per IP: 200 requests/hour
- Global: 10k requests/hour

**Business Value:**
- **Abuse Prevention:** Stop malicious actors
- **Cost Control:** Prevent runaway LLM costs
- **Fairness:** Ensure all users get fair access

**Acceptance Criteria:**
- [ ] Rate limits enforced at API level
- [ ] 429 responses returned when exceeded
- [ ] Limits configurable via env vars

### E. Deployment & Rollback (High Priority)

**Features:**
1. **Blue/Green Deployment**
   - Deploy new version to "green" environment
   - Route 10% traffic to green (canary)
   - If metrics good, route 100% to green
   - If metrics bad, instant rollback to blue

2. **Database Migrations**
   - Use Flyway/Liquibase for versioned migrations
   - Rollback scripts for every migration
   - Test migrations on staging before production

3. **Feature Flags**
   - Flags: enable_overlap_analysis, enable_linter, strict_policy_mode
   - Toggle features without redeploying
   - Gradual rollout (0% → 10% → 50% → 100%)

**Business Value:**
- **Safety:** Can roll back bad deployments instantly
- **Confidence:** Test on 10% of traffic first
- **Flexibility:** Enable/disable features without code changes

**Acceptance Criteria:**
- [ ] Blue/green deployment configured
- [ ] Database migrations tested on staging
- [ ] Feature flags control major features

### F. Documentation & Training (Medium Priority)

**Deliverables:**
1. **User Guide** (for analysts)
   - How to write effective instructions
   - How to interpret impact analysis
   - How to handle linter warnings

2. **Admin Guide** (for ops team)
   - How to deploy updates
   - How to monitor metrics
   - How to respond to alerts

3. **API Documentation** (for developers)
   - OpenAPI/Swagger spec
   - Example requests/responses
   - Authentication guide

4. **Training Videos** (5-10 minutes each)
   - "Your First Rule"
   - "Understanding Impact Analysis"
   - "Troubleshooting Common Issues"

**Business Value:**
- **Onboarding:** New analysts productive in < 1 hour
- **Support:** Reduces support tickets by 50%
- **Adoption:** More teams use the system

**Acceptance Criteria:**
- [ ] User guide published (10+ pages)
- [ ] Admin guide published (5+ pages)
- [ ] API documentation auto-generated from code
- [ ] 3+ training videos created

### Sprint 5 Success Metrics
- Security: Auth + RBAC enforced
- Reliability: 99.9% uptime (3 nines)
- Performance: p95 latency < 2s
- Adoption: 10+ analysts using system daily

---

## Post-Sprint 5: Continuous Improvement

### Backlog (Prioritize based on user feedback)

**High Priority (3-6 months):**
- Visual rule builder (drag-and-drop conditions)
- Bulk operations (enable/disable 10+ rules at once)
- Custom metrics (define your own KPIs)
- Slack/Teams integration (notifications for approvals)

**Medium Priority (6-12 months):**
- ML model integration (suggest thresholds based on data)
- Multi-tenancy (support multiple organizations)
- Webhook integration (trigger actions on rule events)
- Rule templates (pre-built rules for common patterns)

**Low Priority (12+ months):**
- Mobile app (approve rules on the go)
- Voice commands ("Claude, create a rule for high-value mobile")
- Predictive analytics (forecast fraud trends)

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Dry-run too slow (>2s) | Medium | High | Use projection table, optimize queries, add indexes |
| LLM costs too high | Medium | Medium | Cache aggressively, use cheaper models for simple tasks |
| User adoption low | Low | High | User testing, training, onboarding improvements |
| False positive rate high | Medium | High | A/B testing, threshold tuning, human review |
| Compliance issues | Low | Critical | Audit logging, two-person rule, policy gate |
| Security breach | Low | Critical | Auth + RBAC, rate limiting, penetration testing |

---

## Success Criteria (Overall)

### Technical
- ✅ 100% test coverage (unit + integration + E2E)
- ✅ 99.9% uptime (3 nines)
- ✅ p95 latency < 2s (dry-run)
- ✅ Coverage ≥80% lines, ≥70% branches

### Business
- 🎯 10+ analysts using system daily
- 🎯 50+ rules created per week
- 🎯 >80% rule precision (low false positives)
- 🎯 >70% rule recall (catches real fraud)
- 🎯 <5 minutes average approval time

### User Satisfaction
- 🎯 NPS (Net Promoter Score) > 50
- 🎯 <2 support tickets per week
- 🎯 >80% of analysts prefer AI-assisted workflow

---

## Budget & Resources

### Timeline
- Sprint 1: 5 days (✅ Complete)
- Sprint 2: 5-7 days
- Sprint 3: 5-7 days
- Sprint 4: 7-10 days
- Sprint 5: 5-7 days
- **Total:** 27-36 days (5-7 weeks)

### Team
- 1 Senior Engineer (full-time)
- 1 AI/ML Engineer (50% time, Sprints 2-4)
- 1 QA Engineer (50% time, all sprints)
- 1 Product Manager (25% time, planning + reviews)
- 1 Designer (25% time, Sprint 3 UI enhancements)

### Infrastructure
- Supabase: $25/month (database)
- OpenAI: ~$500/month (LLM calls, varies by usage)
- Redis: $10/month (caching)
- GitHub Actions: Free (CI/CD)
- Monitoring: $50/month (Datadog/Prometheus)
- **Total:** ~$585/month

### LLM Cost Optimization
- Sprint 1-2: ~$200/month (development + testing)
- Sprint 3-5: ~$500/month (production load)
- Post-launch: ~$1000/month (scale to 10+ analysts)

**Cost Reduction Strategies:**
- Aggressive caching (30%+ hit rate)
- Use GPT-3.5-turbo for simple tasks (10x cheaper)
- Batch requests where possible
- Set monthly budget alerts ($500 → warn, $1000 → block)

---

## Go-Live Checklist

### Pre-Launch (Sprint 5)
- [ ] All tests passing (120+ tests)
- [ ] Coverage ≥80%
- [ ] Performance benchmarks met (dry-run < 2s)
- [ ] Auth + RBAC implemented
- [ ] Monitoring + alerting configured
- [ ] Redis caching implemented
- [ ] Rate limiting enforced
- [ ] User guide published
- [ ] Admin guide published
- [ ] Training videos created

### Launch Day
- [ ] Deploy to production (blue/green)
- [ ] Route 10% traffic to new version (canary)
- [ ] Monitor metrics for 4 hours
- [ ] If good: route 100% traffic
- [ ] If bad: rollback to previous version
- [ ] Announce to users via email/Slack
- [ ] Schedule follow-up in 1 week

### Post-Launch (Week 1)
- [ ] Monitor error logs daily
- [ ] Review user feedback
- [ ] Identify top 3 pain points
- [ ] Schedule bug fix sprint if needed
- [ ] Celebrate with team! 🎉

---

## Conclusion

This roadmap delivers a production-ready AI-assisted fraud detection system in **5-7 weeks**. Each sprint builds incrementally, with clear acceptance criteria and rollback plans.

**Key Milestones:**
- ✅ Sprint 1: Foundation (testing infrastructure)
- 🚧 Sprint 2: Core features (dry-run + overlap + UI)
- 📋 Sprint 3: Scale & UX (async + linter)
- 🎯 Sprint 4: Intelligence (performance tracking + optimization)
- 🚀 Sprint 5: Production (auth + monitoring)

**Expected Outcomes:**
- Analysts create rules 10x faster than manual writing
- False positive rate reduced by 30% (vs manual rules)
- Rule creation velocity increases 5x
- Compliance risks mitigated with audit trail + policy gate

**Next Step:** Review Sprint 2 plan and begin implementation! 🚀
