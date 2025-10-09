// src/lib/ruleValidator.js
// Production-grade validator with type/range/enum checks based on feature catalog

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load feature catalog
const catalogPath = path.join(__dirname, 'featureCatalog.json');
const FEATURE_CATALOG = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

export class RuleValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate a complete rule object
   * @param {Object} rule - Rule to validate
   * @returns {Object} {valid: boolean, errors: [], warnings: []}
   */
  validate(rule) {
    this.errors = [];
    this.warnings = [];

    // 1. Required fields
    this.validateRequiredFields(rule);

    // 2. Ruleset name format
    this.validateRulesetName(rule.ruleset_name);

    // 3. Description length
    this.validateDescription(rule.description);

    // 4. Decision enum
    this.validateDecision(rule.decision);

    // 5. Conditions array
    if (rule.conditions && Array.isArray(rule.conditions)) {
      this.validateConditionsArray(rule.conditions);
    }

    // 6. Category (if present)
    if (rule.category) {
      this.validateCategory(rule.category);
    }

    return this.getResult();
  }

  validateRequiredFields(rule) {
    const required = ['ruleset_name', 'description', 'decision', 'conditions'];

    required.forEach(field => {
      if (!rule[field]) {
        this.errors.push(`${field} is required`);
      }
    });

    if (!rule.conditions || !Array.isArray(rule.conditions)) {
      this.errors.push("conditions must be a non-empty array");
    }
  }

  validateRulesetName(name) {
    if (!name) return;

    // Must be kebab-case
    if (!/^[a-z0-9-]+$/.test(name)) {
      this.errors.push(
        "ruleset_name must be kebab-case (lowercase letters, numbers, hyphens only). " +
        `Got: "${name}"`
      );
    }

    // Length constraints
    if (name.length < 3) {
      this.errors.push("ruleset_name must be at least 3 characters");
    }

    if (name.length > 100) {
      this.errors.push("ruleset_name must be at most 100 characters");
    }
  }

  validateDescription(description) {
    if (!description) return;

    if (description.length < 10) {
      this.errors.push("description must be at least 10 characters (policy: require_explanation)");
    }

    if (description.length > 500) {
      this.errors.push("description must be at most 500 characters");
    }
  }

  validateDecision(decision) {
    if (!decision) return;

    const validDecisions = ['allow', 'review', 'block'];
    if (!validDecisions.includes(decision)) {
      this.errors.push(
        `decision must be one of: ${validDecisions.join(', ')}. Got: "${decision}"`
      );
    }
  }

  validateCategory(category) {
    const validCategories = ['high_risk', 'validation', 'velocity', 'behavioral', 'compliance'];
    if (!validCategories.includes(category)) {
      this.warnings.push(
        `category should be one of: ${validCategories.join(', ')}. Got: "${category}"`
      );
    }
  }

  validateConditionsArray(conditions) {
    if (conditions.length === 0) {
      this.errors.push("conditions array cannot be empty");
      return;
    }

    const maxConditions = FEATURE_CATALOG.policy?.max_conditions_per_rule || 10;
    if (conditions.length > maxConditions) {
      this.errors.push(
        `conditions array cannot have more than ${maxConditions} items (policy: max_conditions_per_rule)`
      );
      // Short-circuit: don't validate individual conditions if we're already over limit
      return;
    }

    conditions.forEach((cond, idx) => {
      this.validateCondition(cond, `conditions[${idx}]`);
    });
  }

  validateCondition(cond, path) {
    // 1. Required fields
    if (!cond.field) {
      this.errors.push(`${path}: field is required`);
      return;
    }

    if (!cond.op) {
      this.errors.push(`${path}: op (operator) is required`);
      return;
    }

    // 2. Field must exist in catalog
    const feature = this.getFeature(cond.field);
    if (!feature) {
      this.errors.push(
        `${path}: Unknown field "${cond.field}". Must be one of: ` +
        FEATURE_CATALOG.features.map(f => f.name).join(', ')
      );
      return;
    }

    // 3. Operator must be valid for field type
    if (!this.isValidOperator(feature, cond.op)) {
      const validOps = this.getValidOperators(feature);
      this.errors.push(
        `${path}: Operator "${cond.op}" not valid for field "${cond.field}" (type: ${feature.type}). ` +
        `Valid operators: ${validOps.join(', ')}`
      );
      return;
    }

    // 4. Value must be present (except for special cases)
    if (cond.value === undefined && cond.op !== 'is_null') {
      this.errors.push(`${path}: value is required for operator "${cond.op}"`);
      return;
    }

    // 5. Check for null values on not_null fields
    if (cond.value === null) {
      if (feature.nullability === 'not_null') {
        this.errors.push(`${path}: ${cond.field} cannot be null (field is not_null)`);
        return;
      }
    }

    // 6. Validate value type and constraints
    if (cond.value !== undefined && cond.value !== null) {
      this.validateValue(cond.field, cond.value, cond.op, path, feature);
    }
  }

  validateValue(fieldName, value, operator, path, feature) {
    // Handle array operators
    if (['in', 'not_in'].includes(operator)) {
      if (!Array.isArray(value)) {
        this.errors.push(`${path}: Operator "${operator}" requires an array value`);
        return;
      }

      if (value.length === 0) {
        this.errors.push(`${path}: Operator "${operator}" requires a non-empty array`);
        return;
      }

      // Validate each element
      value.forEach((v, idx) => {
        this.validateSingleValue(fieldName, v, `${path}.value[${idx}]`, feature);
      });
    } else {
      // Single value
      this.validateSingleValue(fieldName, value, `${path}.value`, feature);
    }
  }

  validateSingleValue(fieldName, value, path, feature) {
    // Type checking
    const expectedType = feature.type === 'integer' ? 'number' : feature.type;
    const actualType = typeof value;

    if (feature.type === 'boolean') {
      if (actualType !== 'boolean') {
        this.errors.push(
          `${path}: Field "${fieldName}" requires boolean, got ${actualType}`
        );
        return;
      }
    } else if (feature.type === 'integer' || feature.type === 'number') {
      if (actualType !== 'number') {
        this.errors.push(
          `${path}: Field "${fieldName}" requires number, got ${actualType}`
        );
        return;
      }

      // Integer check
      if (feature.type === 'integer' && !Number.isInteger(value)) {
        this.errors.push(
          `${path}: Field "${fieldName}" requires integer, got float: ${value}`
        );
        return;
      }

      // Range check
      if (feature.range) {
        const [min, max] = feature.range;
        if (value < min || value > max) {
          this.errors.push(
            `${path}: Value ${value} out of range for "${fieldName}". ` +
            `Valid range: [${min}, ${max}]`
          );
        }
      }
    } else if (feature.type === 'string') {
      if (actualType !== 'string') {
        this.errors.push(
          `${path}: Field "${fieldName}" requires string, got ${actualType}`
        );
        return;
      }

      // Max length check
      if (feature.max_length && value.length > feature.max_length) {
        this.errors.push(
          `${path}: String too long for "${fieldName}". ` +
          `Max ${feature.max_length} chars, got ${value.length}`
        );
      }
    } else if (feature.type === 'enum') {
      // Enum value check
      if (!feature.values.includes(value)) {
        this.errors.push(
          `${path}: "${value}" is not a valid value for "${fieldName}". ` +
          `Valid values: ${feature.values.join(', ')}`
        );
      }
    }
  }

  getFeature(fieldName) {
    return FEATURE_CATALOG.features.find(f => f.name === fieldName);
  }

  getValidOperators(feature) {
    const typeKey = feature.type === 'enum' ? 'enum' : feature.type;
    return FEATURE_CATALOG.operators[typeKey] || [];
  }

  isValidOperator(feature, operator) {
    const validOps = this.getValidOperators(feature);
    return validOps.includes(operator);
  }

  getResult() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

// Utility functions
export function getFeature(fieldName) {
  return FEATURE_CATALOG.features.find(f => f.name === fieldName);
}

export function getValidOperators(fieldName) {
  const feature = getFeature(fieldName);
  if (!feature) return [];

  const typeKey = feature.type === 'enum' ? 'enum' : feature.type;
  return FEATURE_CATALOG.operators[typeKey] || [];
}

export function isValidOperator(fieldName, operator) {
  return getValidOperators(fieldName).includes(operator);
}

export function validateValue(fieldName, value) {
  const feature = getFeature(fieldName);
  if (!feature) {
    return { valid: false, error: `Unknown field: ${fieldName}` };
  }

  // Null check
  if (value === null || value === undefined) {
    if (feature.nullability === "not_null") {
      return { valid: false, error: `${fieldName} cannot be null` };
    }
    return { valid: true };
  }

  // Type check
  const expectedType = feature.type === 'integer' ? 'number' : feature.type;
  const actualType = typeof value;

  if (expectedType !== actualType && feature.type !== 'enum') {
    return {
      valid: false,
      error: `${fieldName} must be ${expectedType}, got ${actualType}`
    };
  }

  // Range check
  if (feature.range && (value < feature.range[0] || value > feature.range[1])) {
    return {
      valid: false,
      error: `${fieldName} must be between ${feature.range[0]} and ${feature.range[1]}, got ${value}`
    };
  }

  // Enum check
  if (feature.type === 'enum' && !feature.values.includes(value)) {
    return {
      valid: false,
      error: `${fieldName} must be one of: ${feature.values.join(', ')}, got ${value}`
    };
  }

  return { valid: true };
}

export { FEATURE_CATALOG };
