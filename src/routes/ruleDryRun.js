// src/routes/ruleDryRun.js
// API endpoint for dry-run analysis (Sprint 2 Phase 2D)

import express from 'express';
import { dryRunRule } from '../lib/dryRunEngine.js';
import { analyzeOverlap, getOverlapExamples } from '../lib/overlapAnalyzer.js';
import { policyGate } from '../lib/policyGate.js';
import { RuleValidator } from '../lib/ruleValidator.js';

const router = express.Router();

/**
 * POST /api/rules/dryrun
 * Run impact analysis on a proposed rule
 *
 * Body:
 *   - rule: Rule object with conditions, decision, etc.
 *   - sample_size: (optional) Number of transactions to analyze (default 50000)
 *   - include_overlap: (optional) Whether to run overlap analysis (default true)
 *
 * Response:
 *   - rule: The submitted rule
 *   - validation: Validation result
 *   - policy_check: Policy gate result
 *   - dryrun: Impact analysis metrics
 *   - overlap: Overlap analysis with existing rules (if include_overlap=true)
 */
router.post('/dryrun', async (req, res) => {
  try {
    const { rule, sample_size = 50000, include_overlap = true } = req.body;

    // 1. Validate request
    if (!rule) {
      return res.status(400).json({
        error: 'Missing required field: rule'
      });
    }

    // 2. Policy gate check
    // Adapt rule to policy gate format (expects { instruction, ruleset })
    const violations = policyGate({
      instruction: rule.description || '',
      ruleset: { rules: [rule] }
    });

    const errors = violations.filter(v => v.severity === 'error');
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Policy violation',
        code: 'POLICY_VIOLATION',
        violations: { errors, warnings: violations.filter(v => v.severity === 'warning') }
      });
    }

    // 3. Validation check
    const validator = new RuleValidator();
    const validation = validator.validate(rule);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.errors
      });
    }

    // 4. Run dry-run analysis
    console.log(`[POST /api/rules/dryrun] Starting dry-run for rule: ${rule.ruleset_name || 'unnamed'}`);
    const startTime = Date.now();

    const dryrunResult = await dryRunRule(rule, sample_size);

    const elapsed = Date.now() - startTime;
    console.log(`[POST /api/rules/dryrun] Dry-run completed in ${elapsed}ms`);

    // 5. Run overlap analysis (if requested)
    let overlapResult = null;
    if (include_overlap) {
      console.log(`[POST /api/rules/dryrun] Running overlap analysis...`);
      const overlapStartTime = Date.now();

      overlapResult = await analyzeOverlap(rule, Math.min(sample_size, 10000));

      const overlapElapsed = Date.now() - overlapStartTime;
      console.log(`[POST /api/rules/dryrun] Overlap analysis completed in ${overlapElapsed}ms`);
    }

    // 6. Return results
    return res.json({
      rule: {
        ruleset_name: rule.ruleset_name,
        description: rule.description,
        decision: rule.decision,
        conditions_count: rule.conditions?.length || 0
      },
      validation: {
        valid: validation.valid,
        warnings: violations.filter(v => v.severity === 'warning')
      },
      dryrun: dryrunResult,
      overlap: overlapResult,
      performance: {
        dryrun_time_ms: elapsed,
        total_time_ms: Date.now() - startTime
      }
    });

  } catch (err) {
    console.error('[POST /api/rules/dryrun] Error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
});

/**
 * GET /api/rules/:ruleId/overlap
 * Get overlap analysis for a specific existing rule
 *
 * Query params:
 *   - sample_size: (optional) Number of transactions (default 10000)
 *
 * Response:
 *   - rule_id: The rule ID
 *   - overlaps: Array of overlap results
 */
router.get('/:ruleId/overlap', async (req, res) => {
  try {
    const { ruleId } = req.params;
    const { sample_size = 10000 } = req.query;

    if (!ruleId) {
      return res.status(400).json({ error: 'Missing rule ID' });
    }

    // TODO: Fetch rule from database by ID
    // For now, return placeholder
    return res.status(501).json({
      error: 'Not implemented',
      message: 'GET /:ruleId/overlap will be implemented in Phase 2E (UI integration)'
    });

  } catch (err) {
    console.error('[GET /api/rules/:ruleId/overlap] Error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
});

/**
 * POST /api/rules/overlap-examples
 * Get detailed examples of overlapping transactions between two rules
 *
 * Body:
 *   - proposed_rule: The proposed rule
 *   - existing_rule_id: ID of existing rule to compare
 *   - limit: (optional) Number of examples (default 10)
 *
 * Response:
 *   - examples: Array of transaction examples
 */
router.post('/overlap-examples', async (req, res) => {
  try {
    const { proposed_rule, existing_rule_id, limit = 10 } = req.body;

    if (!proposed_rule || !existing_rule_id) {
      return res.status(400).json({
        error: 'Missing required fields: proposed_rule, existing_rule_id'
      });
    }

    // TODO: Fetch existing rule from database
    // For now, return placeholder
    return res.status(501).json({
      error: 'Not implemented',
      message: 'POST /overlap-examples will be implemented in Phase 2E (UI integration)'
    });

  } catch (err) {
    console.error('[POST /api/rules/overlap-examples] Error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
});

export default router;
