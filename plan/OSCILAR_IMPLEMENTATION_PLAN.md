# Building an Oscilar-Style AI Copilot for Agent Trust Demo

## Comparative Analysis: Two Approaches

### ChatGPT's Key Strengths ✅

1. **Feature Catalog as Foundation** - Typed schema that constrains both LLM and validator
2. **Validation-First Mindset** - Type checking, range validation, linting for always-true/false
3. **Impact Preview / Dry-Run** - Running proposed rules on historical data with metrics
4. **Governance from Day 1** - Versioning, approvals, audit trails as core features
5. **Structured LLM Outputs** - Forcing JSON-only responses, no prose
6. **Overlap Analysis** - Detecting redundant/conflicting rules
7. **Concrete Implementation Timeline** - Specific tasks with realistic time estimates
8. **Safety Guardrails** - Strong emphasis on "never let LLM free-type into production"

### Claude's Key Strengths ✅

1. **Visual Workflow Architecture** - Detailed React Flow implementation, DAG editor
2. **End-to-End System Design** - Complete architecture from frontend to database
3. **Technology Stack Specifics** - Concrete library recommendations (Monaco, React Flow)
4. **Natural Language Examples** - User-facing prompt examples
5. **Codebase Integration** - Better mapping to existing Agent Trust Demo structure
6. **Diff Preview System** - Detailed before/after visualization logic
7. **Long-term Roadmap** - Multi-phase vision with analytics, ML, collaboration
8. **Broader Context** - Holistic view of the entire platform

### What ChatGPT Got Right That I Missed ❌

- **Feature Catalog** is THE non-negotiable foundation (I mentioned schemas but didn't emphasize this enough)
- **Dry-run metrics** on historical data (I mentioned testing but not impact analysis)
- **Overlap detection** between existing and proposed rules
- **Rule linter** for logical contradictions (always-true/false, redundancy)
- **Approval workflow** as a core feature, not an afterthought
- **Specific time estimates** and prioritization
- **Stronger safety warnings** about LLM outputs

### What I Got Right That ChatGPT Missed ✅

- **Visual workflow builder** implementation details (React Flow, node types, canvas)
- **Diff preview UI** with before/after state visualization
- **Complete architecture diagram** showing all system layers
- **Better integration** with existing codebase (file-by-file mapping)
- **Monaco Editor** for rule editing with syntax highlighting
- **WebSocket integration** for collaborative editing
- **Multi-phase roadmap** beyond just the copilot

---

## Unified Best-of-Both Plan

This plan combines ChatGPT's safety-first, validation-heavy approach with my visual workflow and system architecture strengths.

---

## Phase 0: Foundation (Week 1) - NON-NEGOTIABLE

### 1. Feature Catalog (Day 1-2) ⭐ CRITICAL

**Why This Matters:**
The feature catalog is your single source of truth. It constrains what the LLM can generate and what your validator accepts. Without this, you're asking for chaos.

**Implementation:**

```javascript
// src/lib/featureCatalog.js
export const FEATURE_CATALOG = {
  version: "1.0",
  last_updated: "2025-10-08",

  features: [
    {
      name: "amount",
      type: "number",
      range: [0, 1000000],
      unit: "USD",
      description: "Transaction amount in dollars",
      examples: [50.00, 1250.99, 10000.00],
      nullability: "not_null",
      pii: false
    },
    {
      name: "hour",
      type: "integer",
      range: [0, 23],
      description: "Hour of day when transaction occurred",
      examples: [9, 14, 22],
      nullability: "not_null",
      pii: false
    },
    {
      name: "agent_id",
      type: "string",
      enum: ["openai", "anthropic", "gemini", "ramp", "stripe", "payman", "nekuda"],
      description: "Agent/partner executing the transaction",
      examples: ["user_123_openai", "user_456_anthropic"],
      nullability: "not_null",
      pii: false
    },
    {
      name: "device",
      type: "string",
      enum: ["web", "mobile", "tablet"],
      description: "Device type used for transaction",
      examples: ["mobile", "web"],
      nullability: "not_null",
      pii: false
    },
    {
      name: "delegation_duration_hours",
      type: "number",
      range: [0, 8760], // 1 year max
      description: "Hours since agent was delegated",
      examples: [2, 48, 168],
      nullability: "nullable",
      pii: false
    },
    {
      name: "account_age_days",
      type: "integer",
      range: [0, 36500], // 100 years max
      description: "Days since user account was created",
      examples: [0, 30, 365, 1000],
      nullability: "nullable",
      pii: false
    },
    {
      name: "seller_name",
      type: "string",
      max_length: 200,
      description: "Merchant/seller name",
      examples: ["Amazon", "Walmart", "Target"],
      nullability: "nullable",
      pii: false
    },
    {
      name: "seller_url",
      type: "string",
      format: "url",
      description: "Merchant website URL",
      examples: ["https://amazon.com", "https://walmart.com"],
      nullability: "nullable",
      pii: false
    },
    {
      name: "intent",
      type: "string",
      enum: ["ecommerce_booking", "travel_booking", "invoice_payment", "subscription"],
      description: "Transaction intent/purpose",
      examples: ["ecommerce_booking", "subscription"],
      nullability: "not_null",
      pii: false
    },
    {
      name: "risk_score",
      type: "integer",
      range: [0, 100],
      description: "Current computed risk score",
      examples: [25, 50, 85],
      nullability: "nullable",
      pii: false
    },
    {
      name: "flagged",
      type: "boolean",
      description: "Whether transaction is flagged",
      examples: [true, false],
      nullability: "not_null",
      pii: false
    },
    {
      name: "delegated",
      type: "boolean",
      description: "Whether transaction was delegated to an agent",
      examples: [true, false],
      nullability: "not_null",
      pii: false
    },
    {
      name: "user_id",
      type: "string",
      format: "uuid",
      description: "User identifier",
      examples: ["550e8400-e29b-41d4-a716-446655440000"],
      nullability: "not_null",
      pii: true
    },
    {
      name: "agent_scope",
      type: "string",
      enum: ["read", "write", "transact", "refund", "delete", "cancel"],
      description: "Permissions scope of the agent",
      examples: ["transact", "read", "write"],
      nullability: "nullable",
      pii: false
    }
  ],

  operators: {
    number: ["==", "!=", ">", "<", ">=", "<=", "in", "not_in"],
    integer: ["==", "!=", ">", "<", ">=", "<=", "in", "not_in"],
    string: ["==", "!=", "in", "not_in", "contains", "not_contains"],
    boolean: ["==", "!="],
    enum: ["==", "!=", "in", "not_in"]
  },

  actions: [
    {
      type: "goto",
      description: "Jump to another node in the workflow",
      params: { target: "string (node_id)" }
    },
    {
      type: "set_value",
      description: "Set a field value",
      params: { field: "string", value: "any" }
    },
    {
      type: "decide",
      description: "Make a fraud decision",
      params: { decision: "allow|review|block" }
    },
    {
      type: "flag",
      description: "Add a risk flag/tag",
      params: { tag: "string" }
    }
  ]
};

// Utility functions
export function getFeature(name) {
  return FEATURE_CATALOG.features.find(f => f.name === name);
}

export function getValidOperators(fieldName) {
  const feature = getFeature(fieldName);
  if (!feature) return [];
  return FEATURE_CATALOG.operators[feature.type] || [];
}

export function isValidOperator(fieldName, operator) {
  return getValidOperators(fieldName).includes(operator);
}

export function getFeatureType(fieldName) {
  const feature = getFeature(fieldName);
  return feature?.type;
}

export function isEnumField(fieldName) {
  const feature = getFeature(fieldName);
  return !!feature?.enum;
}

export function getEnumValues(fieldName) {
  const feature = getFeature(fieldName);
  return feature?.enum || [];
}

export function validateValue(fieldName, value) {
  const feature = getFeature(fieldName);
  if (!feature) return { valid: false, error: `Unknown field: ${fieldName}` };

  // Check null
  if (value === null || value === undefined) {
    if (feature.nullability === "not_null") {
      return { valid: false, error: `${fieldName} cannot be null` };
    }
    return { valid: true };
  }

  // Check type
  if (typeof value !== feature.type && feature.type !== 'integer') {
    return { valid: false, error: `${fieldName} must be ${feature.type}, got ${typeof value}` };
  }

  // Check range
  if (feature.range && (value < feature.range[0] || value > feature.range[1])) {
    return { valid: false, error: `${fieldName} must be between ${feature.range[0]} and ${feature.range[1]}` };
  }

  // Check enum
  if (feature.enum && !feature.enum.includes(value)) {
    return { valid: false, error: `${fieldName} must be one of: ${feature.enum.join(', ')}` };
  }

  return { valid: true };
}
```

**Database Migration:**

```sql
-- Create feature_catalog table (optional, for versioning)
CREATE TABLE feature_catalog (
  id SERIAL PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  catalog JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100),
  active BOOLEAN DEFAULT true
);

-- Index for fast lookups
CREATE INDEX idx_feature_catalog_active ON feature_catalog(active) WHERE active = true;
```

### 2. Rule Validator & Linter (Day 2-3) ⭐ CRITICAL

**Implementation:**

```javascript
// src/lib/ruleValidator.js
import {
  getFeature,
  isValidOperator,
  validateValue,
  isEnumField,
  getEnumValues
} from './featureCatalog.js';

export class RuleValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  validate(rule) {
    this.errors = [];
    this.warnings = [];

    // 1. Required fields
    if (!rule.rule_name) {
      this.errors.push("rule_name is required");
    }

    if (!rule.conditions || !Array.isArray(rule.conditions)) {
      this.errors.push("conditions must be a non-empty array");
      return this.getResult();
    }

    // 2. Validate each condition
    rule.conditions.forEach((cond, idx) => {
      this.validateCondition(cond, `conditions[${idx}]`);
    });

    // 3. Validate actions
    if (rule.actions && Array.isArray(rule.actions)) {
      rule.actions.forEach((action, idx) => {
        this.validateAction(action, `actions[${idx}]`);
      });
    }

    // 4. Check decision
    if (rule.decision && !['allow', 'review', 'block'].includes(rule.decision)) {
      this.errors.push(`Invalid decision: ${rule.decision}. Must be allow, review, or block.`);
    }

    return this.getResult();
  }

  validateCondition(cond, path) {
    // Check for logical groupings (AND/OR)
    if (cond.all || cond.any) {
      const group = cond.all || cond.any;
      if (!Array.isArray(group)) {
        this.errors.push(`${path}: 'all' or 'any' must be an array`);
        return;
      }
      group.forEach((subCond, idx) => {
        this.validateCondition(subCond, `${path}.${cond.all ? 'all' : 'any'}[${idx}]`);
      });
      return;
    }

    // Simple condition
    const { field, op, value } = cond;

    // 1. Field exists in catalog?
    const feature = getFeature(field);
    if (!feature) {
      this.errors.push(`${path}: Unknown field '${field}'`);
      return;
    }

    // 2. Operator valid for this field type?
    if (!isValidOperator(field, op)) {
      this.errors.push(
        `${path}: Operator '${op}' not valid for field '${field}' (type: ${feature.type})`
      );
      return;
    }

    // 3. Value type matches field type?
    if (value !== null && value !== undefined) {
      // For 'in' and 'not_in', value should be an array
      if (['in', 'not_in'].includes(op)) {
        if (!Array.isArray(value)) {
          this.errors.push(`${path}: Operator '${op}' requires an array value`);
          return;
        }
        // Validate each element
        value.forEach((v, vIdx) => {
          const valResult = validateValue(field, v);
          if (!valResult.valid) {
            this.errors.push(`${path}.value[${vIdx}]: ${valResult.error}`);
          }
        });
      } else {
        // Single value
        const valResult = validateValue(field, value);
        if (!valResult.valid) {
          this.errors.push(`${path}: ${valResult.error}`);
        }
      }
    }

    // 4. Enum value check
    if (isEnumField(field) && !['in', 'not_in'].includes(op)) {
      const enumVals = getEnumValues(field);
      if (value && !enumVals.includes(value)) {
        this.errors.push(
          `${path}: '${value}' is not a valid value for ${field}. Valid: ${enumVals.join(', ')}`
        );
      }
    }
  }

  validateAction(action, path) {
    if (!action.type) {
      this.errors.push(`${path}: action.type is required`);
      return;
    }

    const validTypes = ['goto', 'set_value', 'decide', 'flag'];
    if (!validTypes.includes(action.type)) {
      this.errors.push(`${path}: Invalid action type '${action.type}'`);
    }

    // Type-specific validation
    if (action.type === 'goto' && !action.target) {
      this.errors.push(`${path}: 'goto' action requires a target`);
    }

    if (action.type === 'set_value') {
      if (!action.field) {
        this.errors.push(`${path}: 'set_value' action requires a field`);
      }
      if (action.value === undefined) {
        this.errors.push(`${path}: 'set_value' action requires a value`);
      }
    }

    if (action.type === 'decide') {
      if (!['allow', 'review', 'block'].includes(action.decision)) {
        this.errors.push(`${path}: Invalid decision '${action.decision}'`);
      }
    }
  }

  getResult() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

// src/lib/ruleLinter.js
export class RuleLinter {
  constructor() {
    this.issues = [];
  }

  lint(rule) {
    this.issues = [];

    // 1. Detect always-true conditions
    this.checkAlwaysTrue(rule.conditions);

    // 2. Detect always-false conditions
    this.checkAlwaysFalse(rule.conditions);

    // 3. Detect redundant conditions
    this.checkRedundancy(rule.conditions);

    // 4. Detect conflicting conditions
    this.checkConflicts(rule.conditions);

    return this.issues;
  }

  checkAlwaysTrue(conditions) {
    conditions.forEach((cond, idx) => {
      // Example: amount >= 0 when amount range is [0, inf]
      if (cond.field === 'amount' && cond.op === '>=' && cond.value === 0) {
        this.issues.push({
          severity: 'warning',
          type: 'always_true',
          message: `Condition ${idx}: 'amount >= 0' is always true (amount is never negative)`,
          suggestion: 'Remove this condition or make it more specific'
        });
      }

      // Recursively check logical groups
      if (cond.all) this.checkAlwaysTrue(cond.all);
      if (cond.any) this.checkAlwaysTrue(cond.any);
    });
  }

  checkAlwaysFalse(conditions) {
    conditions.forEach((cond, idx) => {
      const feature = getFeature(cond.field);
      if (!feature) return;

      // Example: amount < 0 when range is [0, inf]
      if (feature.range && cond.op === '<' && cond.value <= feature.range[0]) {
        this.issues.push({
          severity: 'error',
          type: 'always_false',
          message: `Condition ${idx}: '${cond.field} < ${cond.value}' is always false`,
          suggestion: `${cond.field} minimum value is ${feature.range[0]}`
        });
      }

      // Example: hour > 24
      if (feature.range && cond.op === '>' && cond.value >= feature.range[1]) {
        this.issues.push({
          severity: 'error',
          type: 'always_false',
          message: `Condition ${idx}: '${cond.field} > ${cond.value}' is always false`,
          suggestion: `${cond.field} maximum value is ${feature.range[1]}`
        });
      }

      // Recursively check logical groups
      if (cond.all) this.checkAlwaysFalse(cond.all);
      if (cond.any) this.checkAlwaysFalse(cond.any);
    });
  }

  checkRedundancy(conditions) {
    // Check for duplicate conditions
    for (let i = 0; i < conditions.length; i++) {
      for (let j = i + 1; j < conditions.length; j++) {
        if (this.conditionsEqual(conditions[i], conditions[j])) {
          this.issues.push({
            severity: 'warning',
            type: 'redundant',
            message: `Conditions ${i} and ${j} are identical`,
            suggestion: 'Remove duplicate condition'
          });
        }
      }
    }

    // Check for subsumed conditions (e.g., amount > 100 AND amount > 50)
    for (let i = 0; i < conditions.length; i++) {
      for (let j = 0; j < conditions.length; j++) {
        if (i === j) continue;
        if (this.subsumes(conditions[i], conditions[j])) {
          this.issues.push({
            severity: 'info',
            type: 'subsumed',
            message: `Condition ${j} is subsumed by condition ${i}`,
            suggestion: `Condition ${j} is redundant when ${i} is present`
          });
        }
      }
    }
  }

  checkConflicts(conditions) {
    // Check for contradictory conditions (e.g., amount > 100 AND amount < 50)
    for (let i = 0; i < conditions.length; i++) {
      for (let j = i + 1; j < conditions.length; j++) {
        if (this.contradicts(conditions[i], conditions[j])) {
          this.issues.push({
            severity: 'error',
            type: 'conflict',
            message: `Conditions ${i} and ${j} contradict each other`,
            suggestion: 'These conditions can never both be true'
          });
        }
      }
    }
  }

  conditionsEqual(c1, c2) {
    return c1.field === c2.field && c1.op === c2.op && c1.value === c2.value;
  }

  subsumes(c1, c2) {
    // Check if c1 makes c2 redundant
    if (c1.field !== c2.field) return false;

    // amount > 100 subsumes amount > 50
    if (c1.op === '>' && c2.op === '>' && c1.value > c2.value) return true;
    if (c1.op === '<' && c2.op === '<' && c1.value < c2.value) return true;
    if (c1.op === '>=' && c2.op === '>=' && c1.value > c2.value) return true;
    if (c1.op === '<=' && c2.op === '<=' && c1.value < c2.value) return true;

    return false;
  }

  contradicts(c1, c2) {
    if (c1.field !== c2.field) return false;

    // amount > 100 AND amount < 50
    if (c1.op === '>' && c2.op === '<' && c1.value >= c2.value) return true;
    if (c1.op === '<' && c2.op === '>' && c1.value <= c2.value) return true;

    // amount == 100 AND amount == 50
    if (c1.op === '==' && c2.op === '==' && c1.value !== c2.value) return true;

    return false;
  }
}
```

### 3. Rule Versioning & Audit (Day 3-4)

**Database Schema:**

```sql
-- Rule versions table
CREATE TABLE rule_versions (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES fraud_rules(id),
  version INTEGER NOT NULL,
  rule_snapshot JSONB NOT NULL,
  diff JSONB,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  approved_by VARCHAR(100),
  approved_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'draft', -- draft, pending_approval, approved, rejected, rolled_back
  rollback_of INTEGER REFERENCES rule_versions(id),
  impact_analysis JSONB,
  notes TEXT,
  UNIQUE(rule_id, version)
);

-- Audit log
CREATE TABLE rule_audit_log (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER,
  rule_version_id INTEGER REFERENCES rule_versions(id),
  actor VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL, -- created, updated, approved, rejected, enabled, disabled, rolled_back
  payload JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Workflow versions
CREATE TABLE workflow_versions (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  workflow_snapshot JSONB NOT NULL,
  diff JSONB,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'draft',
  notes TEXT,
  UNIQUE(workflow_id, version)
);

-- Indexes
CREATE INDEX idx_rule_versions_rule_id ON rule_versions(rule_id);
CREATE INDEX idx_rule_versions_status ON rule_versions(status);
CREATE INDEX idx_rule_audit_log_rule_id ON rule_audit_log(rule_id);
CREATE INDEX idx_rule_audit_log_actor ON rule_audit_log(actor);
CREATE INDEX idx_rule_audit_log_created_at ON rule_audit_log(created_at DESC);
```

**Implementation:**

```javascript
// src/lib/ruleVersioning.js
import { supabase } from '../dbClient.js';

export async function createRuleVersion(ruleId, ruleData, userId, impactAnalysis = null) {
  // Get current version
  const { data: currentVersion } = await supabase
    .from('rule_versions')
    .select('version')
    .eq('rule_id', ruleId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const newVersion = (currentVersion?.version || 0) + 1;

  // Calculate diff if there's a previous version
  let diff = null;
  if (currentVersion) {
    const { data: prevSnapshot } = await supabase
      .from('rule_versions')
      .select('rule_snapshot')
      .eq('rule_id', ruleId)
      .eq('version', currentVersion.version)
      .single();

    diff = calculateDiff(prevSnapshot.rule_snapshot, ruleData);
  }

  // Insert new version
  const { data, error } = await supabase
    .from('rule_versions')
    .insert({
      rule_id: ruleId,
      version: newVersion,
      rule_snapshot: ruleData,
      diff,
      created_by: userId,
      status: 'draft',
      impact_analysis: impactAnalysis
    })
    .select()
    .single();

  if (error) throw error;

  // Log audit
  await logAudit({
    rule_id: ruleId,
    rule_version_id: data.id,
    actor: userId,
    action: 'created_version',
    payload: { version: newVersion, diff }
  });

  return data;
}

export async function approveRuleVersion(versionId, approverId) {
  const { data, error } = await supabase
    .from('rule_versions')
    .update({
      status: 'approved',
      approved_by: approverId,
      approved_at: new Date().toISOString()
    })
    .eq('id', versionId)
    .select()
    .single();

  if (error) throw error;

  // Apply to production (update fraud_rules table)
  await supabase
    .from('fraud_rules')
    .update(data.rule_snapshot)
    .eq('id', data.rule_id);

  // Log audit
  await logAudit({
    rule_id: data.rule_id,
    rule_version_id: versionId,
    actor: approverId,
    action: 'approved',
    payload: { version: data.version }
  });

  return data;
}

export async function rollbackToVersion(ruleId, targetVersion, userId) {
  const { data: targetSnapshot } = await supabase
    .from('rule_versions')
    .select('*')
    .eq('rule_id', ruleId)
    .eq('version', targetVersion)
    .single();

  if (!targetSnapshot) {
    throw new Error(`Version ${targetVersion} not found for rule ${ruleId}`);
  }

  // Create a new version that's a copy of the target
  const newVersion = await createRuleVersion(
    ruleId,
    targetSnapshot.rule_snapshot,
    userId
  );

  // Mark as rollback
  await supabase
    .from('rule_versions')
    .update({ rollback_of: targetSnapshot.id })
    .eq('id', newVersion.id);

  // Log audit
  await logAudit({
    rule_id: ruleId,
    rule_version_id: newVersion.id,
    actor: userId,
    action: 'rolled_back',
    payload: { from_version: targetVersion, to_version: newVersion.version }
  });

  return newVersion;
}

async function logAudit(entry) {
  await supabase.from('rule_audit_log').insert(entry);
}

function calculateDiff(oldRule, newRule) {
  const diff = {
    added: {},
    removed: {},
    modified: {}
  };

  // Compare fields
  const allKeys = new Set([...Object.keys(oldRule), ...Object.keys(newRule)]);

  for (const key of allKeys) {
    if (!(key in oldRule)) {
      diff.added[key] = newRule[key];
    } else if (!(key in newRule)) {
      diff.removed[key] = oldRule[key];
    } else if (JSON.stringify(oldRule[key]) !== JSON.stringify(newRule[key])) {
      diff.modified[key] = {
        old: oldRule[key],
        new: newRule[key]
      };
    }
  }

  return diff;
}
```

---

## Phase 1: AI Suggestion Engine (Week 2)

### 4. Dry-Run / Impact Analysis (Day 5-7) ⭐ CRITICAL

This is where ChatGPT's approach really shines. Before accepting any rule, show:
- How many transactions would have been affected
- Overlap with existing rules
- Estimated precision/false positive rate

**Implementation:**

```javascript
// src/lib/impactAnalyzer.js
import { supabase } from '../dbClient.js';
import { evaluateTransaction } from './ruleEngine.js';

export class ImpactAnalyzer {
  constructor(sampleDays = 30) {
    this.sampleDays = sampleDays;
  }

  async analyzeRule(proposedRule, existingRules = null) {
    // 1. Get sample transactions from last N days
    const since = new Date(Date.now() - this.sampleDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: sampleTxns, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(10000); // Sample size

    if (error) throw error;

    // 2. Run proposed rule on sample
    const matches = [];
    const matchedTxnIds = new Set();

    for (const txn of sampleTxns) {
      if (this.ruleMatches(proposedRule, txn)) {
        matches.push(txn);
        matchedTxnIds.add(txn.txn_id);
      }
    }

    // 3. Calculate decision distribution
    const decisions = {
      block: matches.filter(t => proposedRule.decision === 'block').length,
      review: matches.filter(t => proposedRule.decision === 'review').length,
      allow: matches.filter(t => proposedRule.decision === 'allow').length
    };

    // 4. Analyze overlap with existing rules
    let overlap = [];
    if (existingRules) {
      overlap = await this.calculateOverlap(matchedTxnIds, existingRules);
    }

    // 5. Estimate precision (requires ground truth labels)
    const precision = await this.estimatePrecision(matches);

    // 6. Get sample matched transactions
    const sampleMatches = matches.slice(0, 10).map(t => ({
      txn_id: t.txn_id,
      amount: t.amount,
      user_id: t.user_id,
      agent_id: t.agent_id,
      timestamp: t.timestamp,
      current_decision: t.risk_decision,
      proposed_decision: proposedRule.decision
    }));

    return {
      sample_days: this.sampleDays,
      sample_size: sampleTxns.length,
      matches: matches.length,
      match_rate: (matches.length / sampleTxns.length * 100).toFixed(2) + '%',
      projected_decisions: decisions,
      overlap_analysis: overlap,
      precision_estimate: precision,
      false_positive_risk: this.assessFalsePositiveRisk(precision, decisions),
      sample_matched_txns: sampleMatches
    };
  }

  ruleMatches(rule, txn) {
    // Simplified rule matching (reuse logic from ruleEngine.js)
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

  async calculateOverlap(matchedTxnIds, existingRules) {
    const overlapResults = [];

    for (const existingRule of existingRules) {
      // Get transactions that matched this existing rule
      const { data: existingMatches } = await supabase
        .from('transactions')
        .select('txn_id')
        .contains('triggered_rule_ids', [existingRule.id]);

      const existingMatchSet = new Set(existingMatches.map(t => t.txn_id));

      // Calculate overlap
      const overlapTxns = [...matchedTxnIds].filter(id => existingMatchSet.has(id));
      const overlapPct = (overlapTxns.length / matchedTxnIds.size * 100).toFixed(1);

      if (overlapTxns.length > 0) {
        overlapResults.push({
          rule_id: existingRule.id,
          rule_name: existingRule.rule_name,
          overlap_count: overlapTxns.length,
          overlap_pct: parseFloat(overlapPct),
          interpretation: overlapPct > 80 ? 'Highly redundant' :
                         overlapPct > 50 ? 'Partially redundant' :
                         'Complementary'
        });
      }
    }

    return overlapResults.sort((a, b) => b.overlap_pct - a.overlap_pct);
  }

  async estimatePrecision(matches) {
    // This requires ground truth labels (disputed, confirmed fraud, etc.)
    // For now, use heuristics based on existing flags

    if (matches.length === 0) return null;

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

  assessFalsePositiveRisk(precision, decisions) {
    if (!precision) return 'unknown';

    const precisionValue = parseFloat(precision.precision);
    const blockCount = decisions.block;

    if (precisionValue < 30) return 'high';
    if (precisionValue < 60) return 'medium';
    if (blockCount > 100) return 'medium'; // High volume blocks need scrutiny
    return 'low';
  }
}
```

### 5. AI Suggestion API (Day 8-10)

Combines feature catalog, validation, linting, and impact analysis into one endpoint.

```javascript
// src/routes/ruleSuggest.js
import express from 'express';
import OpenAI from 'openai';
import { FEATURE_CATALOG, getFeature } from '../lib/featureCatalog.js';
import { RuleValidator } from '../lib/ruleValidator.js';
import { RuleLinter } from '../lib/ruleLinter.js';
import { ImpactAnalyzer } from '../lib/impactAnalyzer.js';
import { supabase } from '../dbClient.js';

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/suggest', async (req, res) => {
  try {
    const { instruction, context, workflow_id } = req.body;

    // 1. Build LLM prompt with feature catalog
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(instruction, context);

    // 2. Call LLM with structured output
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const proposedRule = JSON.parse(completion.choices[0].message.content);

    // 3. Validate the proposed rule
    const validator = new RuleValidator();
    const validationResult = validator.validate(proposedRule);

    if (!validationResult.valid) {
      return res.status(400).json({
        error: 'LLM generated invalid rule',
        validation_errors: validationResult.errors,
        proposed_rule: proposedRule
      });
    }

    // 4. Lint the rule
    const linter = new RuleLinter();
    const lintIssues = linter.lint(proposedRule);

    // 5. Run impact analysis
    const { data: existingRules } = await supabase
      .from('fraud_rules')
      .select('*')
      .eq('enabled', true);

    const analyzer = new ImpactAnalyzer(30);
    const impact = await analyzer.analyzeRule(proposedRule, existingRules);

    // 6. Build response
    res.json({
      proposed_rule: proposedRule,
      validation: validationResult,
      lint_issues: lintIssues,
      impact_analysis: impact,
      llm_metadata: {
        model: completion.model,
        tokens: completion.usage,
        finish_reason: completion.choices[0].finish_reason
      }
    });

  } catch (error) {
    console.error('Rule suggestion error:', error);
    res.status(500).json({ error: error.message });
  }
});

function buildSystemPrompt() {
  return `You are a fraud detection rule compiler. Your job is to convert natural language instructions into valid fraud detection rules.

CRITICAL CONSTRAINTS:
1. Output ONLY valid JSON conforming to the RULE_SCHEMA below
2. Use ONLY fields from the FEATURE_CATALOG
3. Use ONLY operators valid for each field type
4. Prefer narrow, explainable conditions over broad ones
5. Never invent fields or values not in the catalog

FEATURE_CATALOG:
${JSON.stringify(FEATURE_CATALOG.features, null, 2)}

VALID_OPERATORS by type:
${JSON.stringify(FEATURE_CATALOG.operators, null, 2)}

RULE_SCHEMA:
{
  "rule_name": "string (descriptive, kebab-case)",
  "description": "string (explain what this rule does and why)",
  "conditions": [
    {
      "field": "string (must be from FEATURE_CATALOG)",
      "op": "string (must be valid for field type)",
      "value": "any (must match field type)"
    }
  ],
  "decision": "allow | review | block",
  "category": "string (e.g., high_risk, validation, velocity)",
  "applies_to": "transactions"
}

For complex AND/OR logic, use:
{
  "all": [ /* conditions that must ALL be true */ ],
  "any": [ /* conditions where ANY can be true */ ]
}

EXAMPLES:

User: "Block transactions over $10,000 from mobile devices outside business hours"

Output:
{
  "rule_name": "high-value-mobile-off-hours",
  "description": "Blocks large transactions from mobile devices during non-business hours to prevent unauthorized access",
  "conditions": [
    {
      "all": [
        {"field": "amount", "op": ">", "value": 10000},
        {"field": "device", "op": "==", "value": "mobile"},
        {
          "any": [
            {"field": "hour", "op": "<", "value": 9},
            {"field": "hour", "op": ">", "value": 17}
          ]
        }
      ]
    }
  ],
  "decision": "block",
  "category": "high_risk",
  "applies_to": "transactions"
}

User: "Flag for review if delegation duration is missing or negative"

Output:
{
  "rule_name": "invalid-delegation-duration",
  "description": "Flags transactions with missing or invalid delegation duration for manual review",
  "conditions": [
    {
      "any": [
        {"field": "delegation_duration_hours", "op": "==", "value": null},
        {"field": "delegation_duration_hours", "op": "<", "value": 0}
      ]
    }
  ],
  "decision": "review",
  "category": "validation",
  "applies_to": "transactions"
}

Now convert the user's instruction into a valid rule following this exact format.`;
}

function buildUserPrompt(instruction, context) {
  let prompt = `Convert this instruction into a fraud detection rule:\n\n${instruction}`;

  if (context && context.workflow_position) {
    prompt += `\n\nContext: This rule will be inserted ${context.workflow_position} in the workflow.`;
  }

  if (context && context.related_rules) {
    prompt += `\n\nRelated existing rules:\n${context.related_rules.map(r => `- ${r.rule_name}: ${r.description}`).join('\n')}`;
  }

  return prompt;
}

export default router;
```

---

## Phase 2: Visual Workflow & UI (Week 3-4)

### 6. Workflow Canvas with React Flow (Day 11-15)

This is where my approach shines. Build a visual workflow editor.

```bash
# Install dependencies
npm install reactflow @xyflow/react lucide-react
```

**Create React Component:**

```jsx
// public/workflow/WorkflowCanvas.jsx
import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

// Custom node types
import DecisionNode from './nodes/DecisionNode';
import ActionNode from './nodes/ActionNode';
import RulesetNode from './nodes/RulesetNode';

const nodeTypes = {
  decision: DecisionNode,
  action: ActionNode,
  ruleset: RulesetNode
};

export default function WorkflowCanvas({ workflowId }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  // Load workflow from backend
  useEffect(() => {
    fetch(`/api/workflows/${workflowId}`)
      .then(res => res.json())
      .then(data => {
        setNodes(data.nodes);
        setEdges(data.edges);
      });
  }, [workflowId]);

  // Handle new connections
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  // Handle node click
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  // Save workflow
  const saveWorkflow = async () => {
    await fetch(`/api/workflows/${workflowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges })
    });
  };

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>

      <button onClick={saveWorkflow}>Save Workflow</button>

      {selectedNode && (
        <NodeInspector node={selectedNode} />
      )}
    </div>
  );
}

// Custom Ruleset Node
// public/workflow/nodes/RulesetNode.jsx
import React from 'react';
import { Handle, Position } from 'reactflow';

export default function RulesetNode({ data }) {
  return (
    <div className="ruleset-node" style={{
      padding: '10px',
      border: '2px solid #5c6ac4',
      borderRadius: '8px',
      background: '#f0f4ff',
      minWidth: '200px'
    }}>
      <Handle type="target" position={Position.Top} />

      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
        {data.rule_name}
      </div>

      <div style={{ fontSize: '12px', color: '#666' }}>
        {data.conditions?.length} conditions
      </div>

      <div style={{ fontSize: '11px', marginTop: '4px' }}>
        Decision: <strong>{data.decision}</strong>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

### 7. AI Suggestion Panel (Day 16-18)

Right-side panel with chat interface and suggestion review.

```jsx
// public/workflow/AISuggestionPanel.jsx
import React, { useState } from 'react';

export default function AISuggestionPanel({ workflowId, onAcceptSuggestion }) {
  const [prompt, setPrompt] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateSuggestion = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rules/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: prompt,
          workflow_id: workflowId
        })
      });

      const data = await res.json();
      setSuggestion(data);
    } catch (error) {
      console.error('Error generating suggestion:', error);
    } finally {
      setLoading(false);
    }
  };

  const acceptSuggestion = () => {
    onAcceptSuggestion(suggestion.proposed_rule);
    setSuggestion(null);
    setPrompt('');
  };

  return (
    <div className="ai-panel" style={{
      width: '400px',
      height: '100vh',
      background: '#fff',
      borderLeft: '1px solid #ddd',
      padding: '20px',
      overflowY: 'auto'
    }}>
      <h2>Oscilar AI</h2>

      <div className="chat-input">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the rule you want to add..."
          style={{
            width: '100%',
            height: '100px',
            padding: '10px',
            marginBottom: '10px',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        />

        <button
          onClick={generateSuggestion}
          disabled={loading || !prompt}
          style={{
            width: '100%',
            padding: '10px',
            background: '#5c6ac4',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {loading ? 'Generating...' : 'Generate Rule'}
        </button>
      </div>

      {suggestion && (
        <div className="suggestion-preview" style={{
          marginTop: '20px',
          padding: '15px',
          background: '#f0f4ff',
          borderRadius: '8px'
        }}>
          <h3>{suggestion.proposed_rule.rule_name}</h3>
          <p style={{ fontSize: '14px', color: '#666' }}>
            {suggestion.proposed_rule.description}
          </p>

          <div className="conditions" style={{ marginTop: '15px' }}>
            <h4>Conditions:</h4>
            <pre style={{
              background: '#fff',
              padding: '10px',
              borderRadius: '4px',
              fontSize: '12px',
              overflow: 'auto'
            }}>
              {JSON.stringify(suggestion.proposed_rule.conditions, null, 2)}
            </pre>
          </div>

          {suggestion.impact_analysis && (
            <div className="impact" style={{ marginTop: '15px' }}>
              <h4>Impact Analysis:</h4>
              <ul style={{ fontSize: '14px' }}>
                <li>Matches: {suggestion.impact_analysis.matches}</li>
                <li>Match rate: {suggestion.impact_analysis.match_rate}</li>
                <li>Block: {suggestion.impact_analysis.projected_decisions.block}</li>
                <li>Review: {suggestion.impact_analysis.projected_decisions.review}</li>
                <li>FP Risk: {suggestion.impact_analysis.false_positive_risk}</li>
              </ul>
            </div>
          )}

          {suggestion.lint_issues.length > 0 && (
            <div className="lint-warnings" style={{
              marginTop: '15px',
              padding: '10px',
              background: '#fff3cd',
              borderRadius: '4px'
            }}>
              <h4>Warnings:</h4>
              <ul style={{ fontSize: '13px' }}>
                {suggestion.lint_issues.map((issue, idx) => (
                  <li key={idx}>{issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="actions" style={{
            marginTop: '20px',
            display: 'flex',
            gap: '10px'
          }}>
            <button
              onClick={acceptSuggestion}
              style={{
                flex: 1,
                padding: '10px',
                background: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Accept
            </button>

            <button
              onClick={generateSuggestion}
              style={{
                flex: 1,
                padding: '10px',
                background: '#ffc107',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>

            <button
              onClick={() => setSuggestion(null)}
              style={{
                flex: 1,
                padding: '10px',
                background: '#dc3545',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Phase 3: Integration & Polish (Week 5-6)

### 8. Workflow API (Day 19-22)

Backend to support the workflow canvas.

```javascript
// src/routes/workflows.js
import express from 'express';
import { supabase } from '../dbClient.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get workflow
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create workflow
router.post('/', async (req, res) => {
  const { name, description, nodes, edges } = req.body;

  const { data, error } = await supabase
    .from('workflows')
    .insert({
      id: uuidv4(),
      name,
      description,
      nodes: nodes || [],
      edges: edges || [],
      created_by: req.user?.id || 'system'
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Update workflow
router.put('/:id', async (req, res) => {
  const { nodes, edges } = req.body;

  const { data, error } = await supabase
    .from('workflows')
    .update({ nodes, edges, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Execute workflow (run a transaction through it)
router.post('/:id/execute', async (req, res) => {
  const { transaction } = req.body;

  const { data: workflow } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', req.params.id)
    .single();

  // Execute workflow logic here
  const result = await executeWorkflow(workflow, transaction);

  res.json(result);
});

async function executeWorkflow(workflow, transaction) {
  // Traverse the workflow graph and execute each node
  // This is a simplified version - you'd need proper graph traversal

  let currentNode = workflow.nodes.find(n => n.type === 'start');
  const executionPath = [];

  while (currentNode) {
    executionPath.push(currentNode.id);

    // Execute node logic based on type
    if (currentNode.type === 'ruleset') {
      // Evaluate rule
      const ruleMatch = await evaluateRule(currentNode.data, transaction);

      if (ruleMatch) {
        // Find edge with matching condition
        const nextEdge = workflow.edges.find(e =>
          e.source === currentNode.id && e.label === 'match'
        );
        currentNode = workflow.nodes.find(n => n.id === nextEdge?.target);
      } else {
        // Find edge for no match
        const nextEdge = workflow.edges.find(e =>
          e.source === currentNode.id && e.label === 'no_match'
        );
        currentNode = workflow.nodes.find(n => n.id === nextEdge?.target);
      }
    } else if (currentNode.type === 'decision') {
      // Final decision node
      break;
    }
  }

  return {
    execution_path: executionPath,
    final_decision: currentNode?.data?.decision || 'unknown',
    transaction
  };
}

export default router;
```

### 9. Diff Preview UI (Day 23-25)

Middle panel showing before/after changes.

```jsx
// public/workflow/DiffPreview.jsx
import React from 'react';
import { diffLines } from 'diff'; // npm install diff

export default function DiffPreview({ original, proposed }) {
  const originalJSON = JSON.stringify(original, null, 2);
  const proposedJSON = JSON.stringify(proposed, null, 2);

  const diff = diffLines(originalJSON, proposedJSON);

  return (
    <div className="diff-preview" style={{
      width: '500px',
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '20px'
    }}>
      <h3>Suggested Changes</h3>

      <div className="diff-content" style={{
        fontFamily: 'monospace',
        fontSize: '13px',
        background: '#f5f5f5',
        padding: '15px',
        borderRadius: '4px',
        overflowX: 'auto'
      }}>
        {diff.map((part, index) => {
          const color = part.added ? '#d4edda' :
                       part.removed ? '#f8d7da' : 'transparent';
          const prefix = part.added ? '+ ' :
                        part.removed ? '- ' : '  ';

          return (
            <pre key={index} style={{
              margin: 0,
              background: color,
              padding: '2px 5px'
            }}>
              {prefix}{part.value}
            </pre>
          );
        })}
      </div>

      <div className="diff-stats" style={{ marginTop: '15px', fontSize: '14px' }}>
        <div>
          <span style={{ color: '#28a745' }}>
            + {diff.filter(p => p.added).length} additions
          </span>
        </div>
        <div>
          <span style={{ color: '#dc3545' }}>
            - {diff.filter(p => p.removed).length} deletions
          </span>
        </div>
      </div>
    </div>
  );
}
```

---

## CORRECTED: Safety-First Implementation Timeline

**Critical Reordering:** Build the hard, production-safety parts FIRST. UI comes LAST.

### Week 1: Safety Infrastructure (NON-NEGOTIABLE)

#### Day 1: Feature Catalog
- ✅ Create `src/lib/featureCatalog.json`
- ✅ Add policy rules (disallowed fields, PII masking)
- ✅ Build utility functions (getFeature, validateValue, getValidOperators)
- ✅ Write unit tests for catalog validation
- **Why first**: This constrains everything—LLM, validator, UI pickers

#### Day 2: Schema-Enforced Rule Validator
- ✅ Implement `RuleValidator` class with strict type checking
- ✅ Field exists in catalog? → hard error if not
- ✅ Operator valid for field type? → hard error if not
- ✅ Value matches type/range/enum? → hard error if not
- ✅ Policy compliance (no disallowed fields, PII masked)
- ✅ Unit tests with 100% coverage of error paths
- **Why second**: Prevents ANY invalid rule from being suggested

#### Day 3: Rule Linter
- ✅ Detect always-true conditions (e.g., `amount >= 0` when min is 0)
- ✅ Detect always-false conditions (e.g., `hour > 24`)
- ✅ Detect redundant conditions (duplicate checks)
- ✅ Detect contradictions (e.g., `amount > 100 AND amount < 50`)
- ✅ Detect subsumption (e.g., `amount > 100` makes `amount > 50` redundant)
- **Why third**: Catches logical errors humans and LLMs make

#### Day 4: Database Indexes + Migrations
- ✅ Add indexes on `transactions(timestamp, user_id, device, agent_id)`
- ✅ Add index on `fraud_engine_output->>'risk_decision'`
- ✅ Add GIN index on `triggered_rule_ids` for overlap queries
- ✅ Create `rule_versions`, `rule_suggestions`, `audits` tables
- ✅ Test index performance with EXPLAIN ANALYZE
- **Why fourth**: Without indexes, dry-run takes 8-12s and kills trust

### Week 2: Dry-Run & Impact Analysis (CRITICAL FOR TRUST)

#### Day 5-6: Dry-Run Engine
- ✅ Implement `ImpactAnalyzer` class
- ✅ Sample strategy: recent + weekends + peaks + fraud pockets (NOT uniform)
- ✅ Run proposed rule on last 30-90 days
- ✅ Compute: match count, match rate, decision deltas
- ✅ Optimize to <2s p95 latency (use indexes!)
- **Target**: 10k transactions evaluated in <2 seconds

#### Day 7: Overlap Detection
- ✅ Find existing rules that trigger on same transactions
- ✅ Calculate Jaccard overlap coefficient
- ✅ Flag >80% overlap as "highly redundant"
- ✅ Return top 5 overlapping rules with percentages
- **Why critical**: Prevents analysts from shipping duplicate rules

#### Day 8: Precision Estimation
- ✅ If you have dispute/chargeback labels, use them for true positives
- ✅ Otherwise, use overlap with "known risky" flags as proxy
- ✅ Return false-positive risk heuristic (high/medium/low)
- ✅ Show 10 sample matched transactions
- **Why critical**: Analysts need to know if they're creating noise

#### Day 9-10: Impact Panel Assembly
- ✅ Combine all metrics into single response
- ✅ Format for display: matches, deltas, overlap, examples, FP risk
- ✅ Add caching for repeated dry-runs on same rule
- ✅ Write integration tests with realistic transaction samples

### Week 3: AI Integration with Guardrails

#### Day 11-12: LLM Function Calling
- ✅ Define strict JSON schema for rule output
- ✅ Use OpenAI function calling (or equivalent) to enforce schema
- ✅ **Never** let LLM free-type JSON
- ✅ Reject responses that don't conform
- ✅ Test with adversarial prompts (try to break it)

#### Day 13-14: `/api/rules/suggest` Endpoint
- ✅ Build system prompt with feature catalog + policy + examples
- ✅ Call LLM with function calling
- ✅ Validate response with RuleValidator
- ✅ Lint response with RuleLinter
- ✅ Run dry-run impact analysis
- ✅ Return structured response with all metrics
- **Definition of done**: Returns valid rule or rejects, always <5s total

#### Day 15: Prompt Engineering & Safety
- ✅ Add "if unsafe or out-of-catalog, return review decision with explanation"
- ✅ Test with edge cases (negative amounts, invalid enums, etc.)
- ✅ Test with policy violations (asking for disallowed fields)
- ✅ Ensure LLM explains WHY it rejected unsafe requests
- **Why critical**: LLM should fail safely, not hallucinate rules

### Week 4: Governance & RBAC

#### Day 16-17: Rule Versioning
- ✅ Implement `createRuleVersion()` function
- ✅ Calculate diffs between versions
- ✅ Store version snapshot + diff + impact analysis
- ✅ Support rollback to any previous version
- ✅ Audit log every change

#### Day 18: RBAC System
- ✅ Define roles: viewer, analyst, approver
- ✅ Viewer: read-only
- ✅ Analyst: can suggest rules, run dry-runs
- ✅ Approver: can apply rules to production
- ✅ Enforce at API layer with middleware

#### Day 19: Approval Workflow
- ✅ POST `/api/rules/suggest` creates `rule_suggestions` entry (status: pending)
- ✅ POST `/api/rules/apply` requires approver role
- ✅ Transitions suggestion to `approved`, creates `rule_version`
- ✅ Updates `fraud_rules` table with new rule
- ✅ Logs audit entry with actor, action, payload

#### Day 20: Audit Trail
- ✅ Log every action: suggest, approve, reject, enable, disable, rollback
- ✅ Capture: actor, timestamp, IP, user agent, payload
- ✅ Build audit query API for compliance
- **Why critical**: Production systems MUST be auditable

### Week 5: Minimal UI (Function Over Form)

#### Day 21-22: Thin Suggestion Panel
- ✅ Simple HTML/JS (NO React Flow yet!)
- ✅ Textarea for natural language prompt
- ✅ "Generate" button → calls `/api/rules/suggest`
- ✅ Display proposed rule as formatted JSON
- ✅ Show validation errors in red
- ✅ Show lint warnings in yellow
- ✅ Show impact metrics in table

#### Day 23: Accept/Retry/Discard Workflow
- ✅ "Accept" → POST `/api/rules/apply` (requires approval)
- ✅ "Retry" → regenerate with same prompt (add iteration context)
- ✅ "Discard" → mark suggestion as discarded, clear UI
- ✅ Show before/after diff inline (use simple text diff)

#### Day 24: Rule List + Management
- ✅ Extend existing `rules.html` page
- ✅ Add "AI Suggest" button
- ✅ Show pending suggestions in separate tab
- ✅ Allow approvers to review and approve/reject
- ✅ Show version history per rule

#### Day 25: Integration with Existing UI
- ✅ Add "Suggest Rule" link to existing dashboard
- ✅ Keep existing rule management functional
- ✅ Ensure SSE live feed still works
- ✅ Don't break user drill-downs

### Week 6: Testing & Hardening

#### Day 26-27: End-to-End Testing
- ✅ Test full flow: prompt → suggest → validate → lint → dry-run → approve → apply
- ✅ Test rejection paths (invalid rules, policy violations)
- ✅ Test rollback flow
- ✅ Load test dry-run with 100k transactions
- ✅ Verify p95 latency <2s for dry-run

#### Day 28: Security Testing
- ✅ Try to inject malicious prompts
- ✅ Try to bypass RBAC
- ✅ Try to suggest rules with PII fields
- ✅ Verify audit log captures all attempts

#### Day 29: Performance Optimization
- ✅ Add caching for feature catalog
- ✅ Add caching for repeated dry-runs
- ✅ Optimize database queries (use EXPLAIN)
- ✅ Add rate limiting on `/api/rules/suggest`

#### Day 30: Documentation
- ✅ API documentation with examples
- ✅ Prompt engineering guide for analysts
- ✅ Feature catalog reference
- ✅ Troubleshooting guide

---

## Critical Additions Based on ChatGPT Feedback

### What I Got Wrong (and Fixed)

**Original Mistake #1: UI-First Approach**
- ❌ I suggested building React Flow canvas in Week 3
- ✅ **Fixed**: Canvas postponed until after safety infrastructure is battle-tested
- **Why it matters**: Pretty UI that ships bad rules is worse than no AI at all

**Original Mistake #2: Glossed Over Sampling Strategy**
- ❌ I mentioned "sample transactions" but didn't specify HOW
- ✅ **Fixed**: Non-uniform sampling required
  ```javascript
  // BAD (what I implied):
  const sample = await supabase
    .from('transactions')
    .select('*')
    .limit(10000); // Random sample - BAD!

  // GOOD (what ChatGPT correctly emphasized):
  const sample = await getSmart Sample({
    recent: 5000,        // Last 7 days
    weekends: 1000,      // Weekend patterns differ
    peaks: 1000,         // Black Friday, holiday spikes
    fraud_labeled: 2000, // Known fraud cases
    high_value: 1000     // >$5k transactions
  });
  ```
- **Why it matters**: Uniform sampling lies about impact on edge cases

**Original Mistake #3: Weak on Indexes**
- ❌ I mentioned indexes once, didn't emphasize
- ✅ **Fixed**: Day 4 focuses on indexes with EXPLAIN ANALYZE
- **Required indexes**:
  ```sql
  CREATE INDEX idx_txn_timestamp ON transactions(timestamp);
  CREATE INDEX idx_txn_user_id ON transactions(user_id);
  CREATE INDEX idx_txn_device ON transactions(device);
  CREATE INDEX idx_txn_agent_id ON transactions(agent_id);
  CREATE INDEX idx_txn_risk_decision ON transactions((fraud_engine_output->>'risk_decision'));
  CREATE INDEX idx_txn_rule_ids ON transactions USING GIN(triggered_rule_ids); -- for overlap
  ```
- **Why it matters**: Without these, dry-run takes 8-12s and analysts lose trust

**Original Mistake #4: Didn't Emphasize Function Calling**
- ❌ I showed LLM code but didn't stress "NEVER let it free-type JSON"
- ✅ **Fixed**: Day 11-12 dedicated to schema-enforced function calling
  ```javascript
  // Use OpenAI function calling to FORCE schema compliance
  const functions = [{
    name: "generate_fraud_rule",
    description: "Generate a fraud detection rule",
    parameters: {
      type: "object",
      properties: {
        ruleset_name: { type: "string" },
        rules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              decision: { type: "string", enum: ["allow", "review", "block"] },
              conditions: { /* ... */ }
            },
            required: ["decision", "conditions"]
          }
        }
      },
      required: ["ruleset_name", "rules"]
    }
  }];

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [...],
    functions: functions,
    function_call: { name: "generate_fraud_rule" }
  });

  // response.choices[0].message.function_call.arguments is GUARANTEED to match schema
  ```
- **Why it matters**: Free-text JSON lets LLM hallucinate invalid fields

**Original Mistake #5: Policy Guardrails**
- ❌ I didn't mention disallowed fields, PII masking, or proxy attributes
- ✅ **Fixed**: Feature catalog now includes policy section
  ```json
  {
    "policy": {
      "disallowed_fields": [
        "country_of_origin",  // Potential proxy for protected class
        "zipcode",            // Geographic discrimination risk
        "ip_city_proxy"       // Same
      ],
      "pii_mask": ["seller_name", "user_email"],
      "max_conditions_per_rule": 10,  // Prevent over-fitting
      "require_explanation": true     // Every rule needs description
    }
  }
  ```
- **Why it matters**: Regulatory compliance and fairness

**Original Mistake #6: Overlap Detection Details**
- ❌ I mentioned overlap but didn't specify the algorithm
- ✅ **Fixed**: Day 7 uses Jaccard coefficient
  ```javascript
  function calculateJaccardOverlap(matchedTxnsA, matchedTxnsB) {
    const setA = new Set(matchedTxnsA);
    const setB = new Set(matchedTxnsB);

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size; // 0.0 to 1.0
  }

  // Flag if overlap > 0.8 (80%)
  if (jaccardOverlap > 0.8) {
    warn("Highly redundant with existing rule");
  }
  ```
- **Why it matters**: Prevents rule proliferation and confusion

### New Non-Negotiables (From ChatGPT)

1. **Latency Budget**: Dry-run MUST complete in <2s p95
   - Target: 10k transactions evaluated in <2s
   - Use: Proper indexes + query optimization
   - Monitor: Add telemetry to track p50/p95/p99

2. **Rejection is Success**: LLM should reject unsafe prompts gracefully
   ```javascript
   // If analyst asks for something dangerous:
   "Generate a rule that blocks all transactions from Nigeria"

   // LLM should return:
   {
     "ruleset_name": "invalid-request",
     "rules": [{
       "decision": "review",
       "description": "Request potentially violates geographic discrimination policy. Please consult compliance team."
     }]
   }
   ```

3. **Approver-Gated Apply**: No rule goes live without human approval
   - Analyst can suggest, dry-run, iterate
   - Only approver can click "Apply"
   - Audit log captures who approved and why

4. **Rollback Must Be Easy**: One-click rollback to any version
   - Every rule change creates a version
   - Versions are immutable
   - Rollback = create new version that copies old snapshot

5. **Impact Panel is Non-Negotiable**: Never show suggestion without impact
   - Match count
   - Decision deltas (% block increase/decrease)
   - Top 5 overlapping rules
   - 10 example matched transactions
   - False-positive risk estimate

### Updated Definition of Done

Before you ship ANY Oscilar-style feature, ALL of these must be true:

- [ ] Feature catalog exists and is used by LLM, validator, and UI
- [ ] Validator rejects invalid rules (tested with 50+ failure cases)
- [ ] Linter catches always-true/false and contradictions
- [ ] Dry-run completes in <2s p95 for 10k transactions
- [ ] Overlap detection flags >80% redundancy
- [ ] LLM uses function calling (no free-text JSON)
- [ ] `/api/rules/suggest` returns valid rule OR rejects with explanation
- [ ] RBAC enforced: only approvers can apply rules
- [ ] Every action is audit-logged
- [ ] Rollback works and is tested
- [ ] UI shows impact metrics BEFORE allowing accept
- [ ] End-to-end test covers: suggest → validate → lint → dry-run → approve → apply → rollback
- [ ] Security test covers: malicious prompts, RBAC bypass attempts, PII injection

**Shipping Checklist (Add This to Your README)**:
```markdown
## Pre-Production Checklist

### Safety
- [ ] Feature catalog reviewed by compliance team
- [ ] Policy guardrails prevent disallowed fields
- [ ] Validator has 100% test coverage on error paths
- [ ] LLM prompt reviewed for prompt injection vulnerabilities
- [ ] RBAC tested with role-based integration tests

### Performance
- [ ] Dry-run latency <2s p95 (load tested with 100k transactions)
- [ ] All required indexes created and verified with EXPLAIN
- [ ] Caching implemented for feature catalog and repeated dry-runs
- [ ] Rate limiting on `/api/rules/suggest` (prevent abuse)

### Governance
- [ ] Audit log captures all rule changes
- [ ] Versioning tested with 10+ version cycles
- [ ] Rollback tested and documented
- [ ] Approval workflow enforced in API layer
- [ ] Alert system notifies approvers of pending suggestions

### Trust
- [ ] Impact panel shows accurate metrics (validated against ground truth)
- [ ] Overlap detection prevents 95%+ of duplicate rules
- [ ] False-positive risk estimate within 15% of actual (on test set)
- [ ] Analysts can explain why they accepted/rejected each suggestion
```

---

## Key Success Metrics

1. **Safety**: Zero LLM-generated rules reach production without validation
2. **Precision**: Impact analyzer correctly predicts false positive rate within 10%
3. **Adoption**: Analysts prefer AI-generated rules over manual authoring for >50% of use cases
4. **Speed**: Rule suggestion → review → approval takes <5 minutes (vs. hours manually)
5. **Quality**: AI-generated rules have <20% rejection rate after human review

---

## What Makes This Plan Superior

### From ChatGPT:
✅ Feature catalog as non-negotiable foundation
✅ Validation-first approach with type safety
✅ Impact analysis with dry-run on historical data
✅ Overlap detection to prevent redundant rules
✅ Rule linting for logical errors
✅ Governance from day 1 (versioning, approvals, audit)
✅ Concrete time estimates and prioritization

### From My Approach:
✅ Visual workflow builder with React Flow
✅ Complete system architecture
✅ Diff preview UI for before/after visualization
✅ Monaco editor for advanced rule editing
✅ Better integration with existing codebase
✅ Long-term roadmap with analytics and ML
✅ Technology stack specifics

### Combined Strengths:
🚀 Safety-first AI that can't generate invalid rules
🚀 Visual, intuitive workflow canvas
🚀 Impact-driven decision making with metrics
🚀 Full audit trail and governance
🚀 Scalable architecture ready for production

---

## Next Steps

1. **Review this plan** with your team
2. **Set up development environment** (install dependencies)
3. **Start with Feature Catalog** (Day 1 task - non-negotiable)
4. **Build iteratively** following the week-by-week plan
5. **Test continuously** with real fraud scenarios

Would you like me to start implementing any specific component?
