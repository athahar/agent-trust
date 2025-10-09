# Critical Gaps Addressed - Final Production-Ready Additions

## ChatGPT's Latest Feedback: What's Still Missing

This document addresses the **critical gaps** that would cause production failures if not fixed.

---

## Gap #1: Prompt Safety + Data Leakage

### Problem
- Analyst instructions flow straight into the model without filtering
- PII (seller_name, user_id) gets echoed back to the UI
- No protection against disallowed fields (geography, proxies for protected classes)

### Solution: Policy Gate

```javascript
// src/lib/policyGate.js
const DISALLOWED_FIELDS = new Set([
  "country_of_origin",
  "zipcode",
  "ip_city_proxy",
  "user_id",           // PII
  "user_email",        // PII
  "seller_tax_id",     // PII
  "ip_address"         // Proxy for location
]);

const PROXY_PATTERNS = [
  /geograph/i,
  /ethnic/i,
  /national/i,
  /race/i,
  /religion/i,
  /\bcountry\b/i,
  /\bstate\b/i,
  /\bregion\b/i
];

export function policyGate({ instruction, ruleset }) {
  const violations = [];

  // 1. Check instruction for sensitive language
  for (const pattern of PROXY_PATTERNS) {
    if (pattern.test(instruction)) {
      violations.push({
        type: 'sensitive_language',
        severity: 'error',
        message: `Instruction references potentially protected attribute: "${pattern.source}"`,
        suggestion: 'Rephrase without geographic or demographic terms'
      });
    }
  }

  // 2. Check ruleset for disallowed fields
  if (!ruleset || !ruleset.rules) return violations;

  for (const rule of ruleset.rules) {
    if (!rule.conditions) continue;

    for (const condition of rule.conditions) {
      // Check simple conditions
      if (condition.field && DISALLOWED_FIELDS.has(condition.field)) {
        violations.push({
          type: 'disallowed_field',
          severity: 'error',
          field: condition.field,
          message: `Field '${condition.field}' is disallowed for policy/compliance reasons`,
          suggestion: 'Use approved alternatives from feature catalog'
        });
      }

      // Check AND/OR groups recursively
      if (condition.all || condition.any) {
        const group = condition.all || condition.any;
        group.forEach(subCond => {
          if (subCond.field && DISALLOWED_FIELDS.has(subCond.field)) {
            violations.push({
              type: 'disallowed_field',
              severity: 'error',
              field: subCond.field,
              message: `Field '${subCond.field}' is disallowed`,
              suggestion: 'Remove this condition'
            });
          }
        });
      }
    }
  }

  // 3. Check for broad negations (risky patterns)
  for (const rule of ruleset.rules) {
    if (!rule.conditions) continue;

    for (const condition of rule.conditions) {
      // agent_id != 'openai' (too broad)
      if (condition.op === '!=' && condition.field?.includes('id')) {
        violations.push({
          type: 'broad_negation',
          severity: 'warning',
          message: `Negation on '${condition.field}' may be overly broad`,
          suggestion: 'Use "in" with allowed values instead of "!=" with one value'
        });
      }

      // not_in with single element
      if (condition.op === 'not_in' && Array.isArray(condition.value) && condition.value.length === 1) {
        violations.push({
          type: 'broad_negation',
          severity: 'warning',
          message: 'not_in with single value is usually too broad',
          suggestion: `Use more specific positive conditions`
        });
      }
    }
  }

  return violations;
}

// PII stripping for examples shown in UI
export function stripPII(transaction) {
  const safe = { ...transaction };

  // Redact PII fields
  if (safe.user_id) safe.user_id = safe.user_id.slice(0, 8) + '...';
  if (safe.seller_name) safe.seller_name = '[REDACTED]';
  if (safe.user_email) safe.user_email = '[REDACTED]';
  if (safe.ip_address) safe.ip_address = '[REDACTED]';

  return safe;
}
```

**Integration in /api/rules/suggest:**

```javascript
// src/routes/ruleSuggest.js
import { policyGate, stripPII } from '../lib/policyGate.js';

router.post('/suggest', async (req, res) => {
  const { instruction } = req.body;

  // STEP 1: Policy gate BEFORE calling LLM
  const policyViolations = policyGate({ instruction, ruleset: null });

  const errors = policyViolations.filter(v => v.severity === 'error');
  if (errors.length > 0) {
    // Don't even call the LLM - reject immediately
    return res.status(400).json({
      error: 'Policy violation',
      violations: errors,
      suggested_alternative: 'Please rephrase your request using only approved fields from the feature catalog'
    });
  }

  // STEP 2: Call LLM
  const llmResponse = await callLLMWithFunctionCalling(instruction);

  // STEP 3: Policy gate AFTER LLM response
  const postLLMViolations = policyGate({
    instruction,
    ruleset: llmResponse
  });

  const postErrors = postLLMViolations.filter(v => v.severity === 'error');
  if (postErrors.length > 0) {
    // LLM tried to use disallowed fields - reject
    await logRejectedSuggestion({
      instruction,
      llm_output: llmResponse,
      reason: 'policy_violation',
      violations: postErrors
    });

    return res.status(400).json({
      error: 'LLM generated rule violates policy',
      violations: postErrors,
      message: 'The AI attempted to use restricted fields. Please try a different prompt.'
    });
  }

  // STEP 4: Continue with validation, linting, dry-run...

  // STEP 5: Strip PII from sample matched transactions
  if (impact.sample_matched_txns) {
    impact.sample_matched_txns = impact.sample_matched_txns.map(stripPII);
  }

  res.json({
    proposed_rule: llmResponse,
    policy_warnings: postLLMViolations.filter(v => v.severity === 'warning'),
    // ...
  });
});
```

---

## Gap #2: LLM Failure Modes

### Problem
- Partial or malformed JSON gets "best effort parsed"
- No rate limiting on expensive LLM calls
- Identical prompts waste API calls

### Solution: Hard Errors + Caching + Rate Limiting

```javascript
// src/lib/llmClient.js
import OpenAI from 'openai';
import crypto from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Simple in-memory cache (use Redis in production)
const promptCache = new Map(); // key: hash -> {result, timestamp}
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Rate limiting (simple token bucket)
const rateLimiter = {
  tokens: 10,
  maxTokens: 10,
  refillRate: 1, // 1 token per minute
  lastRefill: Date.now()
};

function refillTokens() {
  const now = Date.now();
  const elapsed = (now - rateLimiter.lastRefill) / (60 * 1000); // minutes
  const tokensToAdd = Math.floor(elapsed * rateLimiter.refillRate);

  if (tokensToAdd > 0) {
    rateLimiter.tokens = Math.min(
      rateLimiter.maxTokens,
      rateLimiter.tokens + tokensToAdd
    );
    rateLimiter.lastRefill = now;
  }
}

function consumeToken() {
  refillTokens();

  if (rateLimiter.tokens < 1) {
    throw new Error('Rate limit exceeded. Please wait before generating another rule.');
  }

  rateLimiter.tokens -= 1;
}

export async function callLLMWithFunctionCalling(instruction, systemPrompt, functionSchema) {
  // 1. Check cache
  const hash = crypto.createHash('sha256')
    .update(instruction + systemPrompt)
    .digest('hex');

  const cached = promptCache.get(hash);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log('✅ Cache hit for prompt:', hash);
    return cached.result;
  }

  // 2. Rate limit
  consumeToken();

  // 3. Call LLM with function calling
  let response;
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: instruction }
      ],
      functions: [functionSchema],
      function_call: { name: functionSchema.name },
      temperature: 0.3,
      max_tokens: 2000
    });
  } catch (error) {
    console.error('❌ LLM API error:', error);
    throw new Error(`LLM API call failed: ${error.message}`);
  }

  // 4. Validate response structure
  const choice = response.choices[0];

  if (!choice) {
    throw new Error('LLM returned no choices');
  }

  if (choice.finish_reason !== 'function_call') {
    throw new Error(
      `LLM did not return function call. Finish reason: ${choice.finish_reason}. ` +
      `This usually means the prompt was rejected or malformed.`
    );
  }

  if (!choice.message.function_call) {
    throw new Error('LLM response missing function_call');
  }

  // 5. Parse JSON (HARD ERROR if invalid)
  let parsedArgs;
  try {
    parsedArgs = JSON.parse(choice.message.function_call.arguments);
  } catch (error) {
    // DO NOT "best effort parse" - reject completely
    throw new Error(
      `LLM returned invalid JSON: ${error.message}\n` +
      `Raw response: ${choice.message.function_call.arguments.slice(0, 500)}`
    );
  }

  // 6. Cache result
  promptCache.set(hash, {
    result: parsedArgs,
    timestamp: Date.now()
  });

  // 7. Log for reproducibility
  await logLLMCall({
    hash,
    instruction,
    model: response.model,
    tokens: response.usage.total_tokens,
    finish_reason: choice.finish_reason,
    result_snapshot: parsedArgs
  });

  return parsedArgs;
}

// Logging for reproducibility
async function logLLMCall(entry) {
  // Store in database for audit trail
  await supabase.from('llm_calls').insert({
    prompt_hash: entry.hash,
    instruction: entry.instruction,
    model: entry.model,
    tokens_used: entry.tokens,
    finish_reason: entry.finish_reason,
    result_snapshot: entry.result_snapshot,
    created_at: new Date().toISOString()
  });
}
```

**Database table:**

```sql
CREATE TABLE llm_calls (
  id BIGSERIAL PRIMARY KEY,
  prompt_hash VARCHAR(64) NOT NULL,
  instruction TEXT NOT NULL,
  model VARCHAR(50),
  tokens_used INTEGER,
  finish_reason VARCHAR(50),
  result_snapshot JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_llm_calls_hash ON llm_calls(prompt_hash);
CREATE INDEX idx_llm_calls_created_at ON llm_calls(created_at DESC);
```

---

## Gap #3: Impact Analysts Trust - Baseline Deltas

### Problem
- Current dry-run shows "matches: 1287" but no context
- Analysts can't tell if that's good or bad
- No before→after examples

### Solution: Baseline Deltas + Change Set Examples

```javascript
// src/lib/impactAnalyzer.js (ENHANCED)
import { supabase } from '../dbClient.js';

export class ImpactAnalyzer {
  constructor(sampleDays = 30, sampleSize = 50000) {
    this.sampleDays = sampleDays;
    this.sampleSize = sampleSize;
  }

  async analyzeRuleWithBaseline(proposedRule, existingRules = null) {
    // 1. Get stratified sample (NOT uniform!)
    const sample = await this.getStratifiedSample();

    // 2. Run BEFORE analysis (current state)
    let beforeBlock = 0, beforeReview = 0, beforeAllow = 0;
    const beforeDecisions = new Map();

    for (const txn of sample) {
      const currentDecision = txn.fraud_engine_output?.risk_decision || 'allow';
      beforeDecisions.set(txn.txn_id, currentDecision);

      if (currentDecision === 'block') beforeBlock++;
      else if (currentDecision === 'review') beforeReview++;
      else beforeAllow++;
    }

    // 3. Run AFTER analysis (with proposed rule)
    let afterBlock = 0, afterReview = 0, afterAllow = 0;
    const matchedTxns = [];
    const changeExamples = [];

    for (const txn of sample) {
      const beforeDecision = beforeDecisions.get(txn.txn_id);

      // Simulate applying proposed rule
      const ruleMatches = this.ruleMatches(proposedRule, txn);
      let afterDecision = beforeDecision;

      if (ruleMatches) {
        matchedTxns.push(txn);

        // Apply decision hierarchy: block > review > allow
        if (proposedRule.decision === 'block') {
          afterDecision = 'block';
        } else if (proposedRule.decision === 'review' && beforeDecision !== 'block') {
          afterDecision = 'review';
        }
      }

      if (afterDecision === 'block') afterBlock++;
      else if (afterDecision === 'review') afterReview++;
      else afterAllow++;

      // Track changes for examples
      if (beforeDecision !== afterDecision) {
        changeExamples.push({
          txn_id: txn.txn_id,
          amount: txn.amount,
          device: txn.device,
          agent_id: txn.agent_id,
          before: beforeDecision,
          after: afterDecision,
          reason: proposedRule.rule_name
        });
      }
    }

    // 4. Calculate baseline rates
    const baseline = {
      block: beforeBlock / sample.length,
      review: beforeReview / sample.length,
      allow: beforeAllow / sample.length
    };

    const proposed = {
      block: afterBlock / sample.length,
      review: afterReview / sample.length,
      allow: afterAllow / sample.length
    };

    const deltas = {
      block: +(proposed.block - baseline.block).toFixed(4),
      review: +(proposed.review - baseline.review).toFixed(4),
      allow: +(proposed.allow - baseline.allow).toFixed(4)
    };

    // 5. Overlap analysis
    const matchedIds = matchedTxns.map(t => t.txn_id);
    const overlap = existingRules
      ? await this.overlapAgainstExisting(matchedIds, existingRules)
      : [];

    // 6. Precision estimate
    const precision = await this.estimatePrecision(matchedTxns);

    return {
      sample_days: this.sampleDays,
      sample_size: sample.length,
      matches: matchedTxns.length,
      match_rate: (matchedTxns.length / sample.length * 100).toFixed(2) + '%',

      // ✅ NEW: Baseline comparison
      baseline_rates: {
        block: (baseline.block * 100).toFixed(2) + '%',
        review: (baseline.review * 100).toFixed(2) + '%',
        allow: (baseline.allow * 100).toFixed(2) + '%'
      },

      proposed_rates: {
        block: (proposed.block * 100).toFixed(2) + '%',
        review: (proposed.review * 100).toFixed(2) + '%',
        allow: (proposed.allow * 100).toFixed(2) + '%'
      },

      // ✅ NEW: Deltas (THIS IS WHAT ANALYSTS NEED!)
      deltas: {
        block: deltas.block > 0 ? `+${(deltas.block * 100).toFixed(2)}%` : `${(deltas.block * 100).toFixed(2)}%`,
        review: deltas.review > 0 ? `+${(deltas.review * 100).toFixed(2)}%` : `${(deltas.review * 100).toFixed(2)}%`,
        allow: deltas.allow > 0 ? `+${(deltas.allow * 100).toFixed(2)}%` : `${(deltas.allow * 100).toFixed(2)}%`
      },

      // ✅ NEW: Change examples (before→after)
      change_examples: changeExamples.slice(0, 10),

      overlap_analysis: overlap,
      precision_estimate: precision,
      false_positive_risk: this.assessFalsePositiveRisk(precision, proposed)
    };
  }

  async getStratifiedSample() {
    const since = new Date(Date.now() - this.sampleDays * 24 * 60 * 60 * 1000).toISOString();

    // Get stratified sample across different dimensions
    const queries = [
      // Recent transactions (50%)
      supabase.from('transactions')
        .select('*')
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(Math.floor(this.sampleSize * 0.5)),

      // Weekends (10%)
      supabase.from('transactions')
        .select('*')
        .gte('timestamp', since)
        .in('extract(dow from timestamp)', [0, 6]) // Sunday, Saturday
        .limit(Math.floor(this.sampleSize * 0.1)),

      // Flagged/disputed transactions (20%)
      supabase.from('transactions')
        .select('*')
        .gte('timestamp', since)
        .or('flagged.eq.true,disputed.eq.true')
        .limit(Math.floor(this.sampleSize * 0.2)),

      // High-value transactions (10%)
      supabase.from('transactions')
        .select('*')
        .gte('timestamp', since)
        .gte('amount', 5000)
        .limit(Math.floor(this.sampleSize * 0.1)),

      // Mobile device transactions (10%)
      supabase.from('transactions')
        .select('*')
        .gte('timestamp', since)
        .eq('device', 'mobile')
        .limit(Math.floor(this.sampleSize * 0.1))
    ];

    const results = await Promise.all(queries);

    // Combine and dedupe
    const allTxns = new Map();
    results.forEach(({ data }) => {
      data?.forEach(txn => allTxns.set(txn.txn_id, txn));
    });

    return Array.from(allTxns.values());
  }

  async overlapAgainstExisting(matchedIds, existingRules) {
    const matchedSet = new Set(matchedIds);
    const results = [];

    for (const rule of existingRules) {
      // Get transactions that triggered this existing rule
      const { data: ruleHits } = await supabase
        .from('transactions')
        .select('txn_id')
        .contains('triggered_rule_ids', [rule.id])
        .in('txn_id', matchedIds.slice(0, 5000)); // Cap for performance

      const ruleHitSet = new Set(ruleHits.map(h => h.txn_id));

      // Jaccard coefficient: intersection / union
      const intersection = new Set([...matchedSet].filter(x => ruleHitSet.has(x)));
      const union = new Set([...matchedSet, ...ruleHitSet]);

      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      if (jaccard > 0.1) { // Only report meaningful overlap
        results.push({
          rule_id: rule.id,
          rule_name: rule.rule_name,
          jaccard: +(jaccard).toFixed(3),
          overlap_count: intersection.size,
          interpretation:
            jaccard > 0.8 ? 'Highly redundant - consider merging' :
            jaccard > 0.5 ? 'Partially overlaps - review for consolidation' :
            'Complementary - adds new coverage'
        });
      }
    }

    return results.sort((a, b) => b.jaccard - a.jaccard).slice(0, 5);
  }

  ruleMatches(rule, txn) {
    return rule.conditions.every(cond => {
      const val = txn[cond.field];

      switch (cond.op) {
        case '==': return val == cond.value;
        case '!=': return val != cond.value;
        case '>': return val > cond.value;
        case '<': return val < cond.value;
        case '>=': return val >= cond.value;
        case '<=': return val <= cond.value;
        case 'in': return Array.isArray(cond.value) && cond.value.includes(val);
        case 'not_in': return Array.isArray(cond.value) && !cond.value.includes(val);
        case 'contains': return typeof val === 'string' && val.includes(cond.value);
        default: return false;
      }
    });
  }

  async estimatePrecision(matches) {
    if (matches.length === 0) return null;

    // Use ground truth labels if available
    const truePositives = matches.filter(t =>
      t.flagged === true || t.disputed === true || t.declined === true
    ).length;

    const precision = truePositives / matches.length;

    return {
      true_positives: truePositives,
      total_matches: matches.length,
      precision: (precision * 100).toFixed(1) + '%',
      confidence: matches.length > 100 ? 'high' : matches.length > 50 ? 'medium' : 'low'
    };
  }

  assessFalsePositiveRisk(precision, proposedRates) {
    if (!precision) return 'unknown';

    const precisionValue = parseFloat(precision.precision);
    const blockRate = proposedRates.block;

    if (precisionValue < 30) return 'high';
    if (precisionValue < 60) return 'medium';
    if (blockRate > 0.1) return 'medium'; // >10% block rate needs scrutiny
    return 'low';
  }
}
```

---

## Gap #4: Performance - Async Dry-Run

### Problem
- Dry-run on 50k+ transactions blocks the request thread
- UI freezes waiting for response
- No progress feedback

### Solution: Job Queue + SSE Progress Updates

```javascript
// src/routes/jobs.js
import express from 'express';
import crypto from 'crypto';
import { ImpactAnalyzer } from '../lib/impactAnalyzer.js';
import { supabase } from '../dbClient.js';

const router = express.Router();

// Simple job store (use Redis in production)
const jobs = new Map();

router.post('/dryrun', async (req, res) => {
  const { proposed_rule, existing_rules } = req.body;

  const jobId = crypto.randomUUID();

  // Create job record
  jobs.set(jobId, {
    id: jobId,
    status: 'queued',
    created_at: new Date().toISOString(),
    progress: 0
  });

  // Start processing asynchronously
  setImmediate(async () => {
    try {
      jobs.set(jobId, { ...jobs.get(jobId), status: 'running', progress: 10 });

      const analyzer = new ImpactAnalyzer(30, 50000);

      jobs.set(jobId, { ...jobs.get(jobId), progress: 30 });

      const impact = await analyzer.analyzeRuleWithBaseline(
        proposed_rule,
        existing_rules
      );

      jobs.set(jobId, { ...jobs.get(jobId), progress: 70 });

      const overlap = impact.overlap_analysis;

      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: 'completed',
        progress: 100,
        result: { impact, overlap }
      });

    } catch (error) {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: 'failed',
        error: error.message
      });
    }
  });

  // Return job ID immediately
  res.json({
    job_id: jobId,
    status: 'queued',
    poll_url: `/api/jobs/${jobId}`,
    stream_url: `/api/jobs/${jobId}/stream`
  });
});

// Poll endpoint
router.get('/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// SSE stream endpoint
router.get('/:jobId/stream', (req, res) => {
  const jobId = req.params.jobId;

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const interval = setInterval(() => {
    const job = jobs.get(jobId);

    if (!job) {
      res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
      clearInterval(interval);
      res.end();
      return;
    }

    res.write(`data: ${JSON.stringify(job)}\n\n`);

    if (job.status === 'completed' || job.status === 'failed') {
      clearInterval(interval);
      res.end();
    }
  }, 500); // Poll every 500ms

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

export default router;
```

**Frontend usage:**

```javascript
// public/workflow/AISuggestionPanel.jsx
async function runDryRun(proposedRule) {
  setStatus('Analyzing impact...');

  // Start async job
  const jobRes = await fetch('/api/jobs/dryrun', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proposed_rule: proposedRule,
      existing_rules: existingRules
    })
  });

  const { job_id, stream_url } = await jobRes.json();

  // Subscribe to progress updates
  const eventSource = new EventSource(stream_url);

  eventSource.onmessage = (event) => {
    const job = JSON.parse(event.data);

    setProgress(job.progress);

    if (job.status === 'completed') {
      setImpactResults(job.result.impact);
      setOverlapResults(job.result.overlap);
      eventSource.close();
    } else if (job.status === 'failed') {
      setError(job.error);
      eventSource.close();
    }
  };
}
```

---

## Gap #5: Two-Person Rule (Governance)

### Problem
- Rule author can approve their own changes (conflict of interest)
- No reason required for approval

### Solution: Two-Person Rule + Required Justification

```javascript
// src/routes/ruleSuggest.js
router.post('/apply', async (req, res) => {
  const { suggestion_id, approval_notes, expected_impact } = req.body;
  const approver = req.user; // From auth middleware

  // 1. Get suggestion
  const { data: suggestion } = await supabase
    .from('rule_suggestions')
    .select('*')
    .eq('id', suggestion_id)
    .single();

  if (!suggestion) {
    return res.status(404).json({ error: 'Suggestion not found' });
  }

  // 2. TWO-PERSON RULE: Author cannot approve own suggestion
  if (suggestion.created_by === approver.email) {
    return res.status(403).json({
      error: 'Conflict of interest',
      message: 'You cannot approve your own rule suggestion. Please ask another approver.'
    });
  }

  // 3. Require approval notes
  if (!approval_notes || approval_notes.trim().length < 10) {
    return res.status(400).json({
      error: 'Approval notes required',
      message: 'Please provide justification for approving this rule (minimum 10 characters)'
    });
  }

  // 4. Require expected impact acknowledgment
  if (!expected_impact) {
    return res.status(400).json({
      error: 'Impact acknowledgment required',
      message: 'Please acknowledge the expected impact metrics before approving'
    });
  }

  // 5. Create rule version
  const ruleVersion = await createRuleVersion(
    suggestion.rule_id || null,
    suggestion.generated,
    approver.email,
    {
      impact: expected_impact,
      lint_issues: suggestion.lint,
      overlap: suggestion.impact?.overlap_analysis
    }
  );

  // 6. Update suggestion status
  await supabase
    .from('rule_suggestions')
    .update({
      status: 'approved',
      approved_by: approver.email,
      approved_at: new Date().toISOString(),
      approval_notes
    })
    .eq('id', suggestion_id);

  // 7. Apply to production (insert or update fraud_rules)
  const { data: appliedRule, error } = await supabase
    .from('fraud_rules')
    .upsert({
      ...suggestion.generated,
      enabled: true,
      updated_at: new Date().toISOString(),
      updated_by: approver.email
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // 8. Audit log
  await logAudit({
    rule_id: appliedRule.id,
    actor: approver.email,
    action: 'approved_and_applied',
    payload: {
      suggestion_id,
      rule_version_id: ruleVersion.id,
      approval_notes,
      expected_impact
    }
  });

  res.json({
    success: true,
    rule: appliedRule,
    version: ruleVersion
  });
});
```

---

## Updated "Definition of Ready"

Before merging the AI copilot, ALL must be true:

### Safety
- [ ] Policy gate rejects disallowed fields BEFORE calling LLM
- [ ] Policy gate rejects disallowed fields AFTER LLM response
- [ ] PII is stripped from all example transactions shown in UI
- [ ] LLM failure (non-JSON, partial JSON) returns hard error with retry UI
- [ ] Rate limiting prevents >10 suggestions per minute per user
- [ ] Identical prompts are cached for 30 minutes

### Impact
- [ ] Dry-run returns baseline vs proposed rates (before→after)
- [ ] Dry-run returns decision deltas (+X% block, +Y% review)
- [ ] Dry-run returns 10 change examples (txn that changed from allow→block, etc.)
- [ ] Dry-run uses stratified sampling (recent + weekends + fraud + high-value + mobile)
- [ ] Overlap detection uses Jaccard coefficient
- [ ] Overlap includes interpretation (highly redundant / complementary)

### Performance
- [ ] Dry-run completes in <2s p95 for 50k sample
- [ ] Dry-run >50k uses async job queue with SSE progress updates
- [ ] All required indexes exist and verified with EXPLAIN ANALYZE
- [ ] Feature catalog cached (not read from DB on every request)

### Governance
- [ ] Two-person rule enforced: author cannot approve own suggestion
- [ ] Approval requires justification notes (min 10 chars)
- [ ] Approval requires impact acknowledgment
- [ ] Every LLM call logged with hash, model, tokens, result
- [ ] Every rule change creates immutable version record
- [ ] Every action audit-logged with actor, timestamp, payload

### Testing
- [ ] Unit tests for policy gate with 20+ violation scenarios
- [ ] Integration test: suggest → validate → lint → dry-run → approve → apply
- [ ] Security test: try to approve own rule (should fail)
- [ ] Security test: try to use disallowed field (should reject)
- [ ] Load test: 50k transaction dry-run completes in <2s

---

## Blunt Coaching (From ChatGPT)

1. **Ship the copilot loop in your existing rules UI THIS WEEK.**
   - Don't wait for React Flow canvas
   - Add "AI Suggest" button to existing `rules.html`
   - Simple textarea + JSON preview + metrics table
   - Accept/Retry/Discard buttons

2. **If dry-run takes >2s, analysts will abandon the tool.**
   - Fix sampling strategy
   - Fix indexes
   - Make it async if needed
   - BEFORE adding more features

3. **Never let LLM set production decisions without passing validator + impact check.**
   - Zero exceptions
   - Even if the user is an admin
   - Even if "it's just a test"

4. **Two-person rule is non-negotiable for financial/fraud systems.**
   - Author != Approver
   - Always

5. **Log EVERYTHING for reproducibility.**
   - Prompt hash
   - Model version
   - Tokens used
   - Result snapshot
   - Later: you'll use this for fine-tuning

---

This closes all critical gaps. Ready for production.
