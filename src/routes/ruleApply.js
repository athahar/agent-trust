// src/routes/ruleApply.js
// POST /api/rules/apply - Apply suggested rule to production with governance
// Implements: two-person rule, version tracking, audit trail

import '../loadEnv.js'; // Must be first to load environment variables
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/rules/apply
 *
 * Apply a suggested rule to production (fraud_rules table)
 *
 * Request body:
 * {
 *   "suggestion_id": "uuid",
 *   "approver": "approver@example.com",
 *   "approval_notes": "Reviewed impact analysis, FP risk acceptable",
 *   "expected_impact": "Will block 120 additional transactions per day (+2.3%)",
 *   "acknowledge_impact": true
 * }
 *
 * Response:
 * {
 *   "rule_id": 123,
 *   "version": 1,
 *   "status": "applied",
 *   "message": "Rule successfully applied to production"
 * }
 */
router.post('/apply', async (req, res) => {
  const {
    suggestion_id,
    approver,
    approval_notes,
    expected_impact,
    acknowledge_impact
  } = req.body;

  // 1. Validate input
  const validation = validateApplyRequest({
    suggestion_id,
    approver,
    approval_notes,
    expected_impact,
    acknowledge_impact
  });

  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error,
      code: 'INVALID_INPUT',
      field: validation.field
    });
  }

  try {
    // 2. Fetch suggestion from database
    const { data: suggestion, error: fetchError } = await supabase
      .from('atd_rule_suggestions')
      .select('*')
      .eq('id', suggestion_id)
      .single();

    if (fetchError || !suggestion) {
      return res.status(404).json({
        error: 'Suggestion not found',
        code: 'NOT_FOUND'
      });
    }

    // 3. Check suggestion status
    if (suggestion.status === 'approved') {
      return res.status(409).json({
        error: 'Suggestion already approved',
        code: 'ALREADY_APPROVED'
      });
    }

    if (suggestion.status === 'rejected') {
      return res.status(409).json({
        error: 'Suggestion was rejected',
        code: 'REJECTED'
      });
    }

    if (suggestion.status === 'expired') {
      return res.status(410).json({
        error: 'Suggestion has expired',
        code: 'EXPIRED'
      });
    }

    // 4. TWO-PERSON RULE: Verify approver ≠ author
    if (suggestion.created_by === approver) {
      await logAudit({
        actor: approver,
        action: 'apply_rule_rejected_two_person',
        resourceType: 'suggestion',
        resourceId: suggestion_id,
        success: false,
        payload: { reason: 'Author cannot approve own rule' },
        errorMessage: 'Two-person rule violation'
      });

      return res.status(403).json({
        error: 'You cannot approve your own rule suggestion',
        code: 'TWO_PERSON_RULE_VIOLATION',
        created_by: suggestion.created_by,
        approver: approver,
        message: 'A different analyst must review and approve this rule'
      });
    }

    // 5. Check if rule is valid
    if (!suggestion.validation_result?.valid) {
      return res.status(400).json({
        error: 'Cannot apply invalid rule',
        code: 'INVALID_RULE',
        validation_errors: suggestion.validation_result?.errors || []
      });
    }

    // 6. Create rule in fraud_rules table
    const proposedRule = suggestion.generated_rule;
    const ruleFingerprint = hashRule(proposedRule);

    const { data: newRule, error: insertError } = await supabase
      .from('atd_fraud_rules')
      .insert({
        ruleset_name: proposedRule.ruleset_name,
        description: proposedRule.description || '',
        category: proposedRule.category || 'ai-generated',
        decision: proposedRule.decision,
        conditions: proposedRule.conditions,
        enabled: true,
        created_by: suggestion.created_by,
        updated_by: approver
      })
      .select()
      .single();

    if (insertError) {
      console.error('[APPLY] Failed to insert rule:', insertError);
      throw new Error(`Failed to create rule: ${insertError.message}`);
    }

    console.log('[APPLY] Created rule:', newRule.id);

    // 7. Create rule version record
    const { data: version, error: versionError } = await supabase
      .from('atd_rule_versions')
      .insert({
        rule_id: newRule.id,
        version: 1,
        change_type: 'created',
        diff: { type: 'created', source: 'ai_suggestion' },
        rule_snapshot: proposedRule,
        rule_fingerprint: ruleFingerprint,
        created_by: suggestion.created_by,
        approved_by: approver,
        approval_notes,
        expected_impact,
        suggestion_id: suggestion.id
      })
      .select()
      .single();

    if (versionError) {
      console.error('[APPLY] Failed to create version:', versionError);
      // Rollback rule creation
      await supabase.from('atd_fraud_rules').delete().eq('id', newRule.id);
      throw new Error(`Failed to create version: ${versionError.message}`);
    }

    console.log('[APPLY] Created version:', version.id);

    // 8. Update suggestion status
    const { error: updateError } = await supabase
      .from('atd_rule_suggestions')
      .update({
        status: 'approved',
        approved_by: approver,
        approval_notes,
        expected_impact,
        approved_at: new Date().toISOString()
      })
      .eq('id', suggestion_id);

    if (updateError) {
      console.error('[APPLY] Failed to update suggestion:', updateError);
      // Don't rollback - rule is already created
    }

    // 9. Log audit trail
    await logAudit({
      actor: approver,
      action: 'apply_rule',
      resourceType: 'rule',
      resourceId: newRule.id.toString(),
      success: true,
      payload: {
        suggestion_id,
        rule_id: newRule.id,
        ruleset_name: proposedRule.ruleset_name,
        created_by: suggestion.created_by,
        approved_by: approver,
        approval_notes,
        expected_impact,
        impact_analysis: {
          match_rate: suggestion.impact_analysis?.match_rate,
          deltas: suggestion.impact_analysis?.deltas
        }
      }
    });

    // 10. Return success response
    res.json({
      rule_id: newRule.id,
      version: version.version,
      status: 'applied',
      ruleset_name: proposedRule.ruleset_name,
      message: 'Rule successfully applied to production',
      metadata: {
        created_by: suggestion.created_by,
        approved_by: approver,
        suggestion_id: suggestion.id,
        enabled: true
      }
    });

  } catch (error) {
    console.error('[APPLY] Error:', error);

    await logAudit({
      actor: approver || 'unknown',
      action: 'apply_rule',
      resourceType: 'suggestion',
      resourceId: suggestion_id,
      success: false,
      payload: { suggestion_id, approver },
      errorMessage: error.message
    });

    res.status(500).json({
      error: 'Failed to apply rule',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/rules/reject
 *
 * Reject a suggested rule
 *
 * Request body:
 * {
 *   "suggestion_id": "uuid",
 *   "reviewer": "reviewer@example.com",
 *   "rejection_notes": "FP risk too high"
 * }
 */
router.post('/reject', async (req, res) => {
  const { suggestion_id, reviewer, rejection_notes } = req.body;

  if (!suggestion_id || !reviewer || !rejection_notes || rejection_notes.length < 10) {
    return res.status(400).json({
      error: 'suggestion_id, reviewer, and rejection_notes (min 10 chars) required',
      code: 'INVALID_INPUT'
    });
  }

  try {
    // Update suggestion status
    const { data: suggestion, error } = await supabase
      .from('atd_rule_suggestions')
      .update({
        status: 'rejected',
        approved_by: reviewer, // Track who rejected it
        approval_notes: rejection_notes
      })
      .eq('id', suggestion_id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Log audit
    await logAudit({
      actor: reviewer,
      action: 'reject_rule',
      resourceType: 'suggestion',
      resourceId: suggestion_id,
      success: true,
      payload: {
        suggestion_id,
        rejection_notes,
        created_by: suggestion.created_by
      }
    });

    res.json({
      suggestion_id,
      status: 'rejected',
      message: 'Rule suggestion rejected'
    });

  } catch (error) {
    console.error('[REJECT] Error:', error);
    res.status(500).json({
      error: 'Failed to reject suggestion',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Validate apply request
 */
function validateApplyRequest(data) {
  if (!data.suggestion_id) {
    return { valid: false, error: 'suggestion_id required', field: 'suggestion_id' };
  }

  if (!data.approver || typeof data.approver !== 'string' || data.approver.length === 0) {
    return { valid: false, error: 'approver required', field: 'approver' };
  }

  if (!data.approval_notes || typeof data.approval_notes !== 'string' || data.approval_notes.length < 10) {
    return { valid: false, error: 'approval_notes required (min 10 characters)', field: 'approval_notes' };
  }

  if (!data.expected_impact || typeof data.expected_impact !== 'string' || data.expected_impact.length < 10) {
    return { valid: false, error: 'expected_impact required (min 10 characters)', field: 'expected_impact' };
  }

  if (data.acknowledge_impact !== true) {
    return { valid: false, error: 'acknowledge_impact must be true', field: 'acknowledge_impact' };
  }

  return { valid: true };
}

/**
 * Hash rule for fingerprinting (SHA-256 of JSON)
 */
function hashRule(rule) {
  const canonical = JSON.stringify(rule, Object.keys(rule).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

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

