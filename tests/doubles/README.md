# Test Doubles for Sprint 2+

This directory contains test doubles (mocks, stubs, fakes) for external dependencies.

## Purpose

Sprint 1 tests avoid external services by:
- Unit tests: Pure function testing (no DB, no LLM)
- Fuzz tests: Property-based testing (no external calls)
- Perf tests: Performance benchmarks (no external calls)
- Golden tests: Deterministic dataset validation (no external calls)

**Sprint 2+ needs integration tests that:**
- Test `/api/rules/suggest` end-to-end (requires LLM mock)
- Test `/api/rules/apply` with DB queries (requires Supabase mock)
- Test dry-run impact analyzer (requires DB mock with fixtures)

## Structure

```
tests/doubles/
├── README.md                    - This file
├── supabase.mock.js             - Mock Supabase client
├── openai.mock.js               - Mock OpenAI client
├── fixtures/
│   ├── llm-responses.json       - Sample LLM function call responses
│   ├── db-transactions.json     - Sample transaction rows for dry-run
│   └── db-rules.json            - Sample fraud_rules rows
└── helpers/
    ├── mockSupabase.js          - Helper to inject Supabase mock
    └── mockOpenAI.js            - Helper to inject OpenAI mock
```

## Usage

### Mocking Supabase

```javascript
// tests/integration/api.suggest.test.js
import { mockSupabase } from '../doubles/helpers/mockSupabase.js';
import { ruleSuggestRouter } from '../../src/routes/ruleSuggest.js';

test('POST /api/rules/suggest - end-to-end with mocks', async () => {
  // Inject mock before importing route
  const supabaseMock = mockSupabase({
    transactions: require('../doubles/fixtures/db-transactions.json'),
    rules: require('../doubles/fixtures/db-rules.json')
  });

  const res = await request(app)
    .post('/api/rules/suggest')
    .send({
      instruction: 'Review mobile transactions over $10k',
      actor: 'test@example.com'
    });

  assert.equal(res.status, 200);
  assert.ok(res.body.suggestion_id);
  assert.ok(res.body.impact_analysis.matches > 0);
});
```

### Mocking OpenAI

```javascript
// tests/integration/llm.client.test.js
import { mockOpenAI } from '../doubles/helpers/mockOpenAI.js';
import { llmClient } from '../../src/lib/llmClient.js';

test('LLM client returns valid rule JSON', async () => {
  // Inject mock response
  const openaiMock = mockOpenAI({
    response: require('../doubles/fixtures/llm-responses.json').valid_rule_1
  });

  const result = await llmClient.generateRule('Review high-value mobile', 'test@example.com');

  assert.ok(result.ruleset_name);
  assert.ok(result.conditions.length > 0);
  assert.equal(openaiMock.callCount, 1);
});
```

## Implementation Checklist (Sprint 2)

### Phase 1: Mock Infrastructure
- [ ] Create `supabase.mock.js` with in-memory query engine
- [ ] Create `openai.mock.js` with fixture response mapper
- [ ] Create `fixtures/llm-responses.json` with 10+ sample responses
- [ ] Create `fixtures/db-transactions.json` with 1000 sample transactions
- [ ] Create `fixtures/db-rules.json` with 20 sample rules

### Phase 2: Helper Functions
- [ ] Create `mockSupabase()` helper for dependency injection
- [ ] Create `mockOpenAI()` helper for dependency injection
- [ ] Add `resetMocks()` helper for test isolation
- [ ] Add `assertMockCalled()` helper for verification

### Phase 3: Integration Tests
- [ ] Test POST `/api/rules/suggest` with mocked LLM + DB
- [ ] Test POST `/api/rules/apply` with mocked DB
- [ ] Test POST `/api/rules/reject` with mocked DB
- [ ] Test GET `/api/rules/suggest/:id` with mocked DB

### Phase 4: Contract Tests Migration
- [ ] Move `tests/contract/api.contract.test.js` to use mocks
- [ ] Add to CI pipeline (currently skipped)
- [ ] Ensure all contract tests pass with mocks

## Design Principles

1. **In-Memory Only**: No external service calls (fast CI)
2. **Deterministic**: Same input = same output (reproducible)
3. **Realistic**: Fixtures match production data shape
4. **Minimal**: Only mock what's needed (avoid over-mocking)
5. **Isolated**: Each test resets mocks (no test pollution)

## Example Fixtures

### LLM Response Fixture

```json
{
  "valid_rule_1": {
    "id": "chatcmpl-123",
    "choices": [{
      "message": {
        "role": "assistant",
        "function_call": {
          "name": "generate_fraud_rule",
          "arguments": "{\"ruleset_name\":\"high-value-mobile\",\"description\":\"Review mobile transactions over $10k\",\"decision\":\"review\",\"conditions\":[{\"field\":\"amount\",\"op\":\">\",\"value\":10000},{\"field\":\"device\",\"op\":\"==\",\"value\":\"mobile\"}]}"
        }
      },
      "finish_reason": "function_call"
    }],
    "usage": {
      "prompt_tokens": 450,
      "completion_tokens": 120,
      "total_tokens": 570
    }
  }
}
```

### DB Transaction Fixture

```json
[
  {
    "txn_id": "tx_00001",
    "amount": 12000,
    "device": "mobile",
    "hour": 14,
    "partner": "stripe",
    "intent": "ecommerce_booking",
    "flagged": false,
    "account_age_days": 30,
    "is_first_transaction": false
  }
]
```

## FAQ

**Q: Why not use real Supabase test instance?**
A: Mocks are faster (no network), deterministic (no data drift), and work offline (no credentials).

**Q: Why not use real OpenAI with fixtures?**
A: LLM calls are slow, costly, and non-deterministic. Mocks ensure fast, free, predictable tests.

**Q: When should I use real services?**
A: For E2E tests in staging environment (not CI). CI should only use mocks.

**Q: How do I update fixtures?**
A: Run real services locally, capture responses, sanitize PII, save to fixtures.

## Next Steps

1. **Sprint 2 Week 1**: Implement Supabase mock + fixtures
2. **Sprint 2 Week 2**: Implement OpenAI mock + fixtures
3. **Sprint 2 Week 3**: Add integration tests using mocks
4. **Sprint 2 Week 4**: Migrate contract tests to use mocks, enable in CI

---

**Note**: This structure is a skeleton. Actual implementation in Sprint 2.
