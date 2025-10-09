// src/routes/ruleSuggest.js
// POST /api/rules/suggest - AI-assisted rule generation endpoint
// Full pipeline: policy gate → LLM → validator → dry-run → save suggestion

import '../loadEnv.js'; // Must be first to load environment variables
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { generateRule } from '../lib/llmClient.js';
import { RuleValidator } from '../lib/ruleValidator.js';
import { policyGate, hasBlockingViolations, summarizeViolations, stripPII } from '../lib/policyGate.js';
import { dryRunWithBaseline, overlapWithAllRules } from '../lib/impactAnalyzer.js';

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/rules/suggest
 *
 * Request body:
 * {
 *   "instruction": "Review mobile transactions over $10k outside business hours",
 *   "filters": { "device": "mobile" }, // optional
 *   "sample_size": 10000, // optional
 *   "actor": "analyst@example.com" // optional
 * }
 *
 * Response:
 * {
 *   "suggestion_id": "uuid",
 *   "proposed_rule": { ... },
 *   "validation": { valid: true, errors: [] },
 *   "policy_check": { violations: [] },
 *   "impact_analysis": { ... },
 *   "overlap_analysis": [ ... ],
 *   "status": "ready" | "has_warnings" | "blocked"
 * }
 */
router.post('/suggest', async (req, res) => {
  const startTime = Date.now();
  const {
    instruction,
    filters = {},
    sample_size = 10000,
    actor = 'unknown'
  } = req.body;

  // 1. Validate input
  if (!instruction || typeof instruction !== 'string' || instruction.trim().length < 10) {
    return res.status(400).json({
      error: 'Instruction required (min 10 characters)',
      code: 'INVALID_INPUT'
    });
  }

  try {
    // 2. Policy gate PRE-CHECK (instruction only)
    console.log('[SUGGEST] Step 1: Policy gate pre-check...');
    const preCheckViolations = policyGate({
      instruction,
      ruleset: { rules: [] }
    });

    if (hasBlockingViolations(preCheckViolations)) {
      const summary = summarizeViolations(preCheckViolations);

      // Log rejection
      await logAudit({
        actor,
        action: 'suggest_rule_rejected',
        resourceType: 'instruction',
        success: false,
        payload: { instruction, violations: summary },
        errorMessage: 'Policy gate rejected instruction'
      });

      return res.status(400).json({
        error: 'Policy violation in instruction',
        code: 'POLICY_VIOLATION',
        violations: preCheckViolations,
        summary: summary.summary
      });
    }

    // 3. Generate rule via LLM
    console.log('[SUGGEST] Step 2: Generating rule via LLM...');
    const { rule: proposedRule, metadata: llmMetadata } = await generateRule(instruction, {
      actor,
      suggestionId: null // Will update after creating suggestion
    });

    console.log('[SUGGEST] LLM returned rule:', proposedRule.ruleset_name);

    // 4. Validate rule structure & catalog compliance
    console.log('[SUGGEST] Step 3: Validating rule...');
    const validator = new RuleValidator();
    const validationResult = validator.validate(proposedRule);

    if (!validationResult.valid) {
      // LLM generated invalid rule - this is a hard error
      await logAudit({
        actor,
        action: 'suggest_rule_validation_failed',
        resourceType: 'rule',
        success: false,
        payload: { instruction, proposedRule, validation: validationResult },
        errorMessage: 'LLM generated invalid rule'
      });

      return res.status(400).json({
        error: 'LLM generated invalid rule - please retry',
        code: 'VALIDATION_FAILED',
        validation: validationResult,
        proposed_rule: proposedRule,
        suggestion: 'Try rephrasing your instruction or contact support if this persists'
      });
    }

    // 5. Policy gate POST-CHECK (generated rule)
    console.log('[SUGGEST] Step 4: Policy gate post-check...');
    const postCheckViolations = policyGate({
      instruction,
      ruleset: { rules: [proposedRule] }
    });

    if (hasBlockingViolations(postCheckViolations)) {
      const summary = summarizeViolations(postCheckViolations);

      await logAudit({
        actor,
        action: 'suggest_rule_rejected',
        resourceType: 'rule',
        success: false,
        payload: { instruction, proposedRule, violations: summary },
        errorMessage: 'Policy gate rejected generated rule'
      });

      return res.status(400).json({
        error: 'Generated rule violates policy',
        code: 'POLICY_VIOLATION',
        violations: postCheckViolations,
        proposed_rule: proposedRule,
        summary: summary.summary
      });
    }

    // 6. Dry-run impact analysis
    console.log('[SUGGEST] Step 5: Running impact analysis...');
    const impactAnalysis = await dryRunWithBaseline(proposedRule, {
      filters,
      sampleSize: sample_size,
      useStratified: true
    });

    console.log('[SUGGEST] Impact analysis complete:', {
      matches: impactAnalysis.matches,
      match_rate: impactAnalysis.match_rate,
      deltas: impactAnalysis.deltas
    });

    // 7. Overlap analysis with existing rules
    console.log('[SUGGEST] Step 6: Analyzing overlap with existing rules...');
    const proposedMatches = []; // txn_ids matched by proposed rule
    // Note: We'd need to extract these from dry-run, simplified for now
    const overlapAnalysis = impactAnalysis.matches > 0
      ? await overlapWithAllRules(proposedMatches)
      : [];

    // 8. Save suggestion to database
    console.log('[SUGGEST] Step 7: Saving suggestion to database...');
    const { data: suggestion, error: suggestionError } = await supabase
      .from('rule_suggestions')
      .insert({
        status: 'pending',
        instruction,
        generated_rule: proposedRule,
        validation_result: validationResult,
        lint_issues: [], // TODO: Implement linter
        impact_analysis: impactAnalysis,
        llm_model: llmMetadata.model,
        llm_prompt_sha256: null, // TODO: Get from LLM client
        llm_tokens_used: llmMetadata.tokens,
        llm_latency_ms: llmMetadata.latency_ms,
        llm_cached: llmMetadata.cached,
        created_by: actor
      })
      .select()
      .single();

    if (suggestionError) {
      console.error('[SUGGEST] Failed to save suggestion:', suggestionError);
      throw new Error(`Database error: ${suggestionError.message}`);
    }

    // 9. Log success
    await logAudit({
      actor,
      action: 'suggest_rule',
      resourceType: 'suggestion',
      resourceId: suggestion.id,
      success: true,
      payload: {
        instruction,
        ruleset_name: proposedRule.ruleset_name,
        match_rate: impactAnalysis.match_rate,
        deltas: impactAnalysis.deltas
      }
    });

    // 10. Determine status
    let status = 'ready';
    if (postCheckViolations.length > 0) {
      status = 'has_warnings'; // Has warnings but no blocking errors
    }

    const totalLatency = Date.now() - startTime;

    // 11. Strip PII from change examples before sending to client
    const safeChangeExamples = impactAnalysis.change_examples.map(stripPII);

    // 12. Return response
    res.json({
      suggestion_id: suggestion.id,
      proposed_rule: proposedRule,
      validation: {
        valid: validationResult.valid,
        errors: validationResult.errors
      },
      policy_check: {
        violations: postCheckViolations,
        has_blocking: false,
        summary: summarizeViolations(postCheckViolations)
      },
      impact_analysis: {
        ...impactAnalysis,
        change_examples: safeChangeExamples // PII-stripped
      },
      overlap_analysis: overlapAnalysis,
      status,
      metadata: {
        llm_model: llmMetadata.model,
        llm_cached: llmMetadata.cached,
        llm_latency_ms: llmMetadata.latency_ms,
        total_latency_ms: totalLatency
      },
      message: status === 'ready'
        ? 'Rule suggestion ready for approval'
        : 'Rule suggestion has warnings - review carefully before approving'
    });

  } catch (error) {
    console.error('[SUGGEST] Error:', error);

    await logAudit({
      actor,
      action: 'suggest_rule',
      resourceType: 'suggestion',
      success: false,
      payload: { instruction, filters },
      errorMessage: error.message
    });

    // Determine error type
    if (error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: error.message,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    if (error.message.includes('OpenAI') || error.message.includes('LLM')) {
      return res.status(503).json({
        error: 'AI service temporarily unavailable',
        code: 'LLM_SERVICE_ERROR',
        details: error.message
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/rules/suggest/:id
 * Retrieve a specific suggestion by ID
 */
router.get('/suggest/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: suggestion, error } = await supabase
      .from('rule_suggestions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !suggestion) {
      return res.status(404).json({
        error: 'Suggestion not found',
        code: 'NOT_FOUND'
      });
    }

    // Strip PII from impact analysis examples
    if (suggestion.impact_analysis?.change_examples) {
      suggestion.impact_analysis.change_examples =
        suggestion.impact_analysis.change_examples.map(stripPII);
    }

    res.json(suggestion);

  } catch (error) {
    console.error('[SUGGEST GET] Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/rules/suggest
 * List recent suggestions with filters
 */
router.get('/suggest', async (req, res) => {
  const {
    status = 'pending',
    created_by,
    limit = 20,
    offset = 0
  } = req.query;

  try {
    let query = supabase
      .from('rule_suggestions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (created_by) {
      query = query.eq('created_by', created_by);
    }

    const { data: suggestions, error, count } = await query;

    if (error) {
      throw error;
    }

    // Strip PII from all suggestions
    const safeSuggestions = suggestions.map(s => ({
      ...s,
      impact_analysis: s.impact_analysis
        ? {
            ...s.impact_analysis,
            change_examples: s.impact_analysis.change_examples?.map(stripPII) || []
          }
        : null
    }));

    res.json({
      suggestions: safeSuggestions,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('[SUGGEST LIST] Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Helper: Log audit trail
 */
async function logAudit({
  actor,
  action,
  resourceType,
  resourceId = null,
  success,
  payload = {},
  errorMessage = null
}) {
  try {
    await supabase.from('audits').insert({
      actor,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      payload,
      success,
      error_message: errorMessage
    });
  } catch (err) {
    console.error('Failed to log audit:', err);
  }
}

export default router;

