// src/lib/ruleSchema.js
// JSON schema for OpenAI function calling - forces LLM to output structured rules

export const RULE_FUNCTION_SCHEMA = {
  name: "generate_fraud_rule",
  description: "Generate a fraud detection rule based on analyst's instruction",
  parameters: {
    type: "object",
    properties: {
      ruleset_name: {
        type: "string",
        description: "Descriptive name for this ruleset (kebab-case, e.g., 'high-value-mobile-off-hours')"
      },
      description: {
        type: "string",
        description: "Clear explanation of what this rule does and why it's needed"
      },
      decision: {
        type: "string",
        enum: ["allow", "review", "block"],
        description: "Action to take when this rule matches"
      },
      category: {
        type: "string",
        enum: ["high_risk", "validation", "velocity", "behavioral", "compliance"],
        description: "Category of this fraud rule"
      },
      conditions: {
        type: "array",
        description: "Array of conditions that must ALL be true for this rule to match",
        items: {
          type: "object",
          properties: {
            field: {
              type: "string",
              description: "Field name from feature catalog"
            },
            op: {
              type: "string",
              enum: ["==", "!=", ">", "<", ">=", "<=", "in", "not_in", "contains", "not_contains"],
              description: "Comparison operator"
            },
            value: {
              description: "Value to compare against (type must match field type)"
            }
          },
          required: ["field", "op", "value"]
        },
        minItems: 1,
        maxItems: 10
      }
    },
    required: ["ruleset_name", "description", "decision", "category", "conditions"]
  }
};

// Validation schema for rule structure (used by validator)
export const RULE_VALIDATION_SCHEMA = {
  type: "object",
  required: ["ruleset_name", "description", "decision", "category", "conditions"],
  properties: {
    ruleset_name: {
      type: "string",
      minLength: 3,
      maxLength: 100,
      pattern: "^[a-z0-9-]+$"  // kebab-case only
    },
    description: {
      type: "string",
      minLength: 10,
      maxLength: 500
    },
    decision: {
      type: "string",
      enum: ["allow", "review", "block"]
    },
    category: {
      type: "string",
      enum: ["high_risk", "validation", "velocity", "behavioral", "compliance"]
    },
    conditions: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        required: ["field", "op"],
        properties: {
          field: { type: "string" },
          op: {
            type: "string",
            enum: ["==", "!=", ">", "<", ">=", "<=", "in", "not_in", "contains", "not_contains"]
          },
          value: {} // Type varies by field
        }
      }
    },
    applies_to: {
      type: "string",
      default: "transactions"
    }
  }
};

export function validateRuleStructure(rule) {
  const errors = [];

  // Required fields
  if (!rule.ruleset_name) errors.push("ruleset_name is required");
  if (!rule.description) errors.push("description is required");
  if (!rule.decision) errors.push("decision is required");
  if (!rule.conditions || !Array.isArray(rule.conditions)) {
    errors.push("conditions must be a non-empty array");
  }

  // Ruleset name format
  if (rule.ruleset_name && !/^[a-z0-9-]+$/.test(rule.ruleset_name)) {
    errors.push("ruleset_name must be kebab-case (lowercase letters, numbers, hyphens only)");
  }

  // Description length
  if (rule.description && rule.description.length < 10) {
    errors.push("description must be at least 10 characters");
  }

  // Decision enum
  if (rule.decision && !["allow", "review", "block"].includes(rule.decision)) {
    errors.push(`decision must be 'allow', 'review', or 'block', got '${rule.decision}'`);
  }

  // Conditions array
  if (rule.conditions) {
    if (rule.conditions.length === 0) {
      errors.push("conditions array cannot be empty");
    }

    if (rule.conditions.length > 10) {
      errors.push("conditions array cannot have more than 10 items (max_conditions_per_rule policy)");
    }

    rule.conditions.forEach((cond, idx) => {
      if (!cond.field) {
        errors.push(`conditions[${idx}]: field is required`);
      }
      if (!cond.op) {
        errors.push(`conditions[${idx}]: op (operator) is required`);
      }
      if (cond.value === undefined && cond.op !== "is_null") {
        errors.push(`conditions[${idx}]: value is required for operator '${cond.op}'`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
