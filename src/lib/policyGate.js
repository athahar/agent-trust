// src/lib/policyGate.js
// Policy gate: blocks disallowed fields, detects sensitive language, strips PII

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load feature catalog
const catalogPath = path.join(__dirname, 'featureCatalog.json');
const FEATURE_CATALOG = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const DISALLOWED_FIELDS = new Set(FEATURE_CATALOG.policy?.disallowed_fields || []);
const PII_FIELDS = new Set(FEATURE_CATALOG.policy?.pii_fields || []);

// Proxy patterns from catalog + additional ones
const PROXY_PATTERNS = [
  /geograph/i,
  /ethnic/i,
  /national/i,
  /\brace\b/i,
  /relig/i,
  /gender/i,
  /\bcountry\b/i,
  /\bstate\b/i,
  /\bregion\b/i,
  /\bzipcode\b/i,
  /\bpostal\b/i,
  /user_?id|email|ssn|tax|passport|phone|address/i
];

/**
 * Check instruction and ruleset for policy violations
 * @param {Object} params
 * @param {string} params.instruction - Natural language instruction from analyst
 * @param {Object} params.ruleset - Proposed ruleset to validate
 * @returns {Array} violations - Array of violation objects
 */
export function policyGate({ instruction = "", ruleset }) {
  const violations = [];

  // 1. Check instruction for sensitive language
  if (typeof instruction === "string" && instruction.length > 0) {
    for (const pattern of PROXY_PATTERNS) {
      if (pattern.test(instruction)) {
        violations.push({
          type: 'sensitive_language',
          severity: 'error',
          pattern: pattern.source,
          message: `Instruction contains potentially protected/sensitive attribute pattern: "${pattern.source}"`,
          suggestion: 'Rephrase without geographic, demographic, or personal identifiers'
        });
      }
    }
  }

  // 2. Check ruleset for disallowed fields
  if (!ruleset || !ruleset.rules) return violations;

  for (const rule of ruleset.rules) {
    if (!rule.conditions) continue;

    for (const condition of rule.conditions) {
      // Check for disallowed fields
      if (condition.field && DISALLOWED_FIELDS.has(condition.field)) {
        violations.push({
          type: 'disallowed_field',
          severity: 'error',
          field: condition.field,
          message: `Field "${condition.field}" is disallowed by policy (compliance/fairness reasons)`,
          suggestion: 'Use approved fields from feature catalog only'
        });
      }

      // Check for PII fields (warning, not blocker)
      if (condition.field && PII_FIELDS.has(condition.field)) {
        violations.push({
          type: 'pii_field',
          severity: 'warning',
          field: condition.field,
          message: `Field "${condition.field}" contains PII - ensure proper handling`,
          suggestion: 'PII will be masked in UI displays'
        });
      }
    }
  }

  // 3. Check for broad negations (risky patterns)
  for (const rule of ruleset.rules) {
    if (!rule.conditions) continue;

    for (const condition of rule.conditions) {
      // Single negation without other conditions (e.g., agent_id != 'openai' alone)
      if (condition.op === '!=' && rule.conditions.length === 1) {
        violations.push({
          type: 'broad_negation',
          severity: 'warning',
          field: condition.field,
          message: `Single negation on "${condition.field}" is overly broad`,
          suggestion: 'Use positive conditions (e.g., "in" with allowed values) instead of "!=" with one value'
        });
      }

      // not_in with single element
      if (condition.op === 'not_in' && Array.isArray(condition.value) && condition.value.length === 1) {
        violations.push({
          type: 'broad_negation',
          severity: 'warning',
          field: condition.field,
          message: `"not_in" with single value is usually too broad`,
          suggestion: 'Use more specific positive conditions'
        });
      }
    }
  }

  return violations;
}

/**
 * Strip PII from transaction object for display
 * @param {Object} transaction - Transaction object
 * @returns {Object} transaction with PII redacted
 */
export function stripPII(transaction) {
  if (!transaction) return transaction;

  const safe = { ...transaction };

  // Redact PII fields from catalog
  for (const piiField of PII_FIELDS) {
    if (safe[piiField]) {
      safe[piiField] = '[REDACTED]';
    }
  }

  // Also redact commonly sensitive fields not in catalog
  if (safe.user_email) {
    safe.user_email = '[REDACTED]';
  }

  if (safe.ip_address) {
    safe.ip_address = '[REDACTED]';
  }

  return safe;
}

/**
 * Check if violations include any hard errors (severity: error)
 * @param {Array} violations
 * @returns {boolean}
 */
export function hasBlockingViolations(violations) {
  return violations.some(v => v.severity === 'error');
}

/**
 * Get summary of policy violations for logging
 * @param {Array} violations
 * @returns {string}
 */
export function summarizeViolations(violations) {
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  return {
    total: violations.length,
    errors: errors.length,
    warnings: warnings.length,
    summary: violations.map(v => `[${v.severity}] ${v.type}: ${v.message}`).join('; ')
  };
}
