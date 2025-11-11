# VeriMesh - Project Summary

## Overview

**VeriMesh** is a real-time sandbox environment for fraud analysts working in the emerging world of agentic commerce. It simulates a high-volume environment where transactions are executed by autonomous agents on behalf of users, allowing analysts to experiment with and test new fraud detection strategies in a realistic context.

**Core Philosophy**: Instead of treating fraud detection as a black-box ML task, this system empowers users with interpretable, testable, and editable rules, providing real feedback on agent behavior and risk signals.

---

## What Has Been Built

### 1. Backend Architecture

#### **Core Services**
- **Express Server** (`src/index.js`)
  - RESTful API for transaction evaluation, rule management, and user lookups
  - Server-Sent Events (SSE) endpoint (`/stream`) for real-time transaction streaming
  - Graceful shutdown handling with proper signal management
  - CORS-enabled for frontend integration

- **Database Layer** (`src/dbClient.js`)
  - Supabase/PostgreSQL integration
  - Service role authentication for backend operations
  - Environment variable validation and initialization

#### **Fraud Detection Engine**

**Rule Engine** (`src/lib/ruleEngine.js`)
- JSON-based declarative rule system
- Rule caching mechanism (5-minute cache duration)
- Supports multiple operators:
  - Equality: `==`, `!=`
  - Comparison: `>`, `<`, `>=`, `<=`
  - Set operations: `in`, `not_in`
  - String operations: `contains`
- Context-aware evaluation (trusted partners, registered agents, approved scopes)
- Transaction enrichment (hour extraction, delegation duration calculation)
- Automatic decision hierarchy: `block` > `review` > `allow`

**Risk Scoring Engine** (`src/lib/riskScoreEngine.js`)
- Baseline risk score: 50/100
- Dynamic score adjustment based on triggered rules:
  - Block rules: +40 points
  - Review/flag rules: +20 points
- Score capping between 0-100

**Fraud Engine Wrapper** (`src/lib/fraudEngineWrapper.js`)
- Orchestrates rule evaluation and risk scoring
- Persists transactions to database with full fraud analysis
- Generates comprehensive fraud output including:
  - Risk score and decision
  - Triggered rule IDs and actions
  - Matched rule descriptions
  - Manual review flags
  - Engine version tracking
  - Risk tags and explanation summary

### 2. Data Generation

#### **Synthetic Transaction Generator** (`src/generateTransaction.js`)
- Generates realistic transactions with:
  - User assignments from pool
  - Random partner selection (Ramp, Payman, Nekuda, OpenAI, Anthropic, Gemini, Stripe)
  - Intent types: ecommerce_booking, travel_booking, invoice_payment, subscription
  - Device types: web, mobile, tablet
  - Merchant assignments from curated list
  - Agent delegation scenarios
  - Edge case injection (15% trusted users, 15% mobile+trusted partner, etc.)
- Ensures data quality with non-null amount and currency

#### **Seed Script** (`src/seed.js`)
- Creates 200 users from curated name list
- Generates one transaction per merchant per user
- Implements fraud flags: flagged (5%), declined (20% of flagged), disputed (10% of flagged)
- Batch processing (200 records per batch) for performance
- Risk profile assignment per user (20-80 range)

### 3. API Endpoints

#### **Transaction Endpoints**
- `GET /stream` - Real-time SSE transaction feed with fraud evaluation
- `POST /api/eval` - Evaluate and persist a single transaction
  - Input validation for required fields (user_id, agent_id, amount, currency)
  - Type checking and business rule validation (positive amounts)
  - Returns enriched transaction with fraud analysis

#### **Rule Management**
- `GET /rules` - Fetch all fraud rules (with optional filter for disabled rules)
- `GET /rules/:id/matches` - Get transactions matching a specific rule
- `POST /api/rules` - Update existing fraud rule
- `GET /rules/test` - Debug interface for rule testing

#### **User & Agent Analytics**
- `GET /user/:userId/summary` - User profile with risk score
- `GET /user/:userId/agents?period=N` - Agent-level statistics for a user
  - Transaction counts, total amounts, risk scores
  - Breakdown by review/block/dispute counts
- `GET /user/:userId/agent/:agentId/transactions` - Transaction history for specific agent
- `GET /user/simulate/:userId` - Full transaction history for simulation (last 200)

#### **Sample Transactions & Statistics**
- `GET /api/samples` - Retrieve saved sample transactions
- `POST /api/samples` - Save a transaction sample for testing
- `GET /api/rule-stats` - Rule trigger counts and statistics

### 4. Frontend Interfaces

#### **Live Dashboard** (`public/index.html`)
- Real-time transaction monitoring via SSE
- Displays up to 50 most recent transactions
- Key fields shown:
  - Timestamp, Transaction ID, User details
  - Agent, Partner, Seller
  - Amount, Intent
  - Fraud decision and flags
- Click-through to user detail pages
- Fixed header navigation (VeriMesh branding)

#### **Rule Management UI** (`public/rules.html`)
- Comprehensive rule dashboard with Bootstrap 5
- Features:
  - Search by rule name, condition, action, classification, behavioral rule
  - Filter by enabled/disabled status
  - Interactive table with sortable columns
  - Modal-based rule inspection:
    - Full condition display with human-readable formatting
    - Enable/disable toggle
    - Match count in last 90 days
    - Recent matching transactions preview
    - Link to view all matching transactions
  - Visual operator highlighting:
    - `in` operations (green)
    - `not_in`, `!=` (red)
    - `contains` (blue)
- Smart condition formatting (e.g., "delegation hour outside of 9am to 5pm")

#### **User Detail Page** (`public/user.html`)
- User overview: ID, Name, Trust Score
- Agent breakdown table:
  - Partner-level aggregation
  - Transaction counts and total amounts
  - Average risk scores per agent
  - Review/block/dispute counts
  - "View" link for detailed agent transactions
- Time period selector: 30d, 90d, 1y
- Transaction modal with:
  - List view: All transactions by selected agent
  - Fingerprint view: Deep dive into individual transaction details
  - Back button navigation between views
- Simulation panel placeholder (for testing transactions)

### 5. Data Models

#### **Key Entities**
Based on the code, the system uses these primary entities:

**Users**
```json
{
  "user_id": "uuid",
  "name": "string",
  "risk_profile": "number (20-80)"
}
```

**Transactions**
```json
{
  "txn_id": "uuid",
  "user_id": "uuid",
  "agent_id": "string",
  "partner": "string",
  "amount": "number",
  "currency": "string",
  "intent": "string",
  "timestamp": "ISO8601",
  "seller_name": "string",
  "seller_url": "string",
  "device": "string",
  "delegated": "boolean",
  "delegation_time": "ISO8601",
  "delegation_duration_hours": "number",
  "hour": "number (0-23)",
  "account_age_days": "number",
  "agent_scope": "string",
  "agent_token": "string",
  "flagged": "boolean",
  "declined": "boolean",
  "disputed": "boolean",
  "to_review": "boolean",
  "status": "string",
  "fraud_engine_output": {
    "evaluated_at": "ISO8601",
    "risk_score": "number (0-100)",
    "risk_decision": "allow|review|block",
    "manual_review_required": "boolean",
    "triggered_rule_ids": "array",
    "rule_actions_taken": "array",
    "matched_rule_descriptions": "array",
    "engine_version": "string",
    "risk_tags": "array",
    "explanation_summary": "string"
  }
}
```

**Fraud Rules**
```json
{
  "id": "number",
  "rule_name": "string",
  "description": "string",
  "conditions": [
    {
      "field": "string",
      "op": "==|!=|>|<|>=|<=|in|not_in|contains",
      "value": "any"
    }
  ],
  "decision": "allow|review|block",
  "category": "string",
  "enabled": "boolean",
  "created_by_name": "string",
  "created_at": "timestamp",
  "approved_by_name": "string",
  "approved_at": "timestamp",
  "classification": "string",
  "applies_to": "string"
}
```

### 6. Current Capabilities

**What Works Today:**
- ✅ Real-time transaction generation and evaluation (1 transaction/second)
- ✅ JSON-based fraud rule engine with flexible conditions
- ✅ Risk scoring with rule-based increments
- ✅ Supabase/PostgreSQL persistence
- ✅ Live dashboard with SSE streaming
- ✅ Rule inspection and match analysis
- ✅ User-level analytics with agent breakdown
- ✅ Transaction fingerprinting and drill-down
- ✅ Seed data generation (200 users × N merchants)
- ✅ API for transaction evaluation and rule management

---

## What Can Be Done

### Priority 1: Scale & Performance

#### **1.1 Mass Data Generation**
**Goal**: Generate 1M+ transactions as described in the README

**Implementation Path**:
- Create `npm run gen-data` command
- Build efficient batch generation script:
  - Target: 1,000,000+ synthetic transactions
  - Use streaming inserts to Supabase (batches of 1000-5000)
  - Distribute across 200 users and all merchants
  - Inject realistic fraud patterns:
    - 2-5% suspicious transactions
    - 0.5-1% clear fraud cases
    - Edge cases for rule testing
  - Add variation in:
    - Time of day patterns
    - Amount distributions (normal, high-value, micro)
    - Device fingerprints
    - Delegation patterns
- Add progress tracking and ETA display
- Estimated generation time: 5-15 minutes for 1M records

**Files to Create**:
- `src/generateMassData.js` - Main generation script
- Update `package.json` with `"gen-data": "node src/generateMassData.js"`

#### **1.2 Performance Optimization**
- Implement database indexing on:
  - `transactions.user_id`
  - `transactions.timestamp`
  - `transactions.risk_decision`
  - `transactions.triggered_rule_ids` (GIN index for array queries)
- Add connection pooling for high-volume scenarios
- Implement caching for frequently accessed user data
- Consider materialized views for analytics queries

### Priority 2: Enhanced Analytics & Visualization

#### **2.1 Agent Info Dashboard**
**Goal**: Global agent view across all users (mentioned in your description)

**Features**:
- Aggregate statistics per agent type (OpenAI, Anthropic, Ramp, etc.)
- Risk score distribution by agent
- Transaction volume trends
- Block/review/dispute rates by agent
- Top merchants by agent type
- Comparative analysis: Which agents trigger most fraud rules?

**Files to Create**:
- `public/agents.html` - Agent analytics dashboard
- `src/routes/agents.js` - API endpoints for agent aggregations
- Database function: `agent_global_summary()`

#### **2.2 Advanced Visualizations**
- **Charts & Graphs**:
  - Risk score distribution histogram
  - Time-series plots: Transaction volume, fraud rate over time
  - Heatmaps: Hour-of-day vs. fraud rate
  - Agent comparison charts
- **Technology**:
  - Chart.js or D3.js for interactive visualizations
  - Real-time updating charts on dashboard
- **Fraud Pattern Detection**:
  - Anomaly detection visualization
  - Cluster analysis of suspicious behaviors

#### **2.3 Rule Performance Analytics**
- Rule effectiveness metrics:
  - Precision/recall per rule
  - False positive rates
  - Rule overlap analysis (which rules frequently trigger together)
  - Rule usage heatmap over time
- A/B testing framework for rules
- Historical performance tracking

### Priority 3: Rule Authoring & Testing

#### **3.1 Interactive Rule Builder**
**Current**: Rules are managed via direct database updates

**Enhanced**:
- Visual rule builder UI:
  - Drag-and-drop condition builder
  - Field selector with autocomplete
  - Operator dropdown with descriptions
  - Value input with type validation
  - Multi-condition grouping (AND/OR logic)
- Template library for common fraud patterns
- Rule versioning and rollback capability
- Approval workflow for production deployment

**Files to Create/Modify**:
- `public/rule-builder.html` - Interactive rule creation UI
- Extend `POST /api/rules` to support rule creation
- Add `POST /api/rules/:id/version` for versioning

#### **3.2 Transaction Simulator Enhancement**
**Current**: Placeholder UI in user.html

**Enhanced**:
- Form-based transaction creation:
  - All field inputs with smart defaults
  - Merchant selector
  - Agent/partner picker
  - Amount and intent configuration
- Real-time rule evaluation preview (before persisting)
- Side-by-side comparison: "What if" scenarios
- Save simulation scenarios for regression testing
- Batch simulation: Test multiple transactions at once

#### **3.3 Rule Testing Framework**
- Unit tests for individual rules
- Test case management:
  - Expected outcomes for known transactions
  - Regression test suite
- Automated rule validation:
  - Check for conflicting rules
  - Detect always-false conditions
  - Flag overly broad rules
- Sandbox mode: Test rules without affecting production data

### Priority 4: Advanced Fraud Detection

#### **4.1 Behavioral Risk Scoring**
**Current**: Simple additive scoring based on rule matches

**Enhanced**:
- User behavior profiling:
  - Baseline spending patterns
  - Typical merchants and transaction times
  - Device consistency
- Anomaly detection:
  - Deviation from user's normal behavior
  - Velocity checks (transactions per hour/day)
  - Geographic anomalies (if location data added)
- Agent trust scoring:
  - Historical performance per agent
  - Success rate, dispute rate
  - User satisfaction metrics
- Machine learning integration (optional):
  - Gradient boosting for risk prediction
  - Explainable AI to generate rule suggestions

#### **4.2 Complex Rule Types**
**Current**: Simple field-value comparisons

**New Rule Types**:
- Temporal rules:
  - "More than N transactions in M minutes"
  - "First transaction in X days"
  - "Unusual time-of-day for this user"
- Relational rules:
  - "Amount > user's average by 3x"
  - "New merchant for this user"
  - "Different device than last 10 transactions"
- Network rules:
  - "Agent used by < 5 users" (rare agent)
  - "Merchant flagged by other users recently"
- Composite scoring:
  - Weighted rule combinations
  - Confidence intervals

#### **4.3 Real-time Alerts & Actions**
- Webhook integration for high-risk transactions
- Email/SMS notifications for fraud analysts
- Automatic actions:
  - Transaction holds
  - User account reviews
  - Agent token revocation
- Queue management for manual review cases

### Priority 5: User Experience & Collaboration

#### **5.1 Analyst Workflow Tools**
- Case management system:
  - Review queue for flagged transactions
  - Assignment to analysts
  - Investigation notes and resolution tracking
  - Feedback loop to improve rules
- Bulk operations:
  - Approve/decline multiple transactions
  - Batch rule enable/disable
  - Export filtered transaction sets

#### **5.2 Collaboration Features**
- Comments on rules and transactions
- Change log/audit trail:
  - Who created/modified each rule
  - Reason for changes
  - Impact analysis
- Role-based access control:
  - Viewer, Analyst, Admin roles
  - Rule approval workflow

#### **5.3 Export & Reporting**
- CSV/JSON export for transactions and rules
- Scheduled reports:
  - Daily fraud summary
  - Weekly rule performance
  - Monthly trend analysis
- API documentation with OpenAPI/Swagger
- Data warehouse integration for BI tools

### Priority 6: Infrastructure & DevOps

#### **6.1 Database Schema & Migrations**
- Formalize database schema:
  - Create migration scripts
  - Document all tables, columns, indexes
  - Add foreign key constraints
  - Implement soft deletes where appropriate
- Supabase functions:
  - `agent_summary(p_user_id, p_since)` ✅ (already used)
  - `agent_global_summary(p_since)`
  - `rule_match_count(p_rule_id, p_days)`
  - `user_risk_profile_update()` - trigger function

#### **6.2 Testing & Quality**
- Unit tests for:
  - Rule engine logic
  - Risk scoring algorithm
  - Transaction generation
- Integration tests:
  - API endpoint coverage
  - Database operations
  - SSE streaming
- End-to-end tests:
  - Full transaction lifecycle
  - UI interactions
- Load testing:
  - Simulate 100+ transactions/second
  - Database query performance
  - Frontend rendering under load

#### **6.3 Deployment & Monitoring**
- Docker containerization
- Environment management (dev, staging, prod)
- Health check endpoints
- Application monitoring:
  - Error tracking (Sentry, etc.)
  - Performance metrics (response times, throughput)
  - Database query analysis
- Logging strategy:
  - Structured logging
  - Log aggregation and search
  - Security audit logs

### Priority 7: Documentation & Onboarding

#### **7.1 User Documentation**
- Comprehensive README with:
  - Architecture overview
  - Quick start guide
  - API reference
  - Rule authoring guide
  - FAQ
- Video tutorials or screencasts
- Example use cases and scenarios

#### **7.2 Developer Documentation**
- Code documentation (JSDoc)
- Architecture decision records (ADRs)
- Database schema diagrams
- API flow diagrams
- Contributing guidelines

#### **7.3 Demo & Showcase**
- Live demo environment with pre-loaded data
- Interactive walkthrough
- Sample fraud scenarios for testing
- Benchmark comparisons (before/after rule changes)

---

## Technology Stack

**Current**:
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **UI Framework**: Bootstrap 5 (rules.html)
- **Data Generation**: Faker.js
- **Dev Tools**: Nodemon

**Potential Additions**:
- **Testing**: Jest, Supertest, Playwright
- **Visualization**: Chart.js, D3.js
- **Build**: Webpack or Vite (if modularizing frontend)
- **Type Safety**: TypeScript (optional migration)
- **Monitoring**: Sentry, Datadog, or similar

---

## Next Steps

### Immediate Quick Wins (1-2 days)
1. **Mass data generation** (`npm run gen-data`) - enables realistic testing
2. **Transaction simulator** UI - makes rule testing interactive
3. **Agent global dashboard** - provides cross-user insights

### Medium-term Enhancements (1-2 weeks)
1. Visual rule builder with live preview
2. Advanced analytics with charts
3. Behavioral risk scoring enhancements
4. Database schema formalization with migrations

### Long-term Vision (1+ months)
1. Machine learning integration for anomaly detection
2. Full collaboration platform with workflows
3. Multi-tenant support for different organizations
4. Production-grade deployment with monitoring

---

## Project Strengths

1. **Interpretable by Design**: JSON rules are readable and editable by non-engineers
2. **Real-time Feedback**: SSE streaming provides immediate visibility
3. **Flexible Architecture**: Modular design allows easy extension
4. **Realistic Simulation**: Faker-based generation creates believable scenarios
5. **Full-stack Implementation**: End-to-end from data generation to UI

## Areas for Growth

1. **Scale Testing**: Not yet validated at 1M+ transaction volume
2. **ML Integration**: Currently rule-based only, could benefit from hybrid approach
3. **Collaboration**: Single-user focused, lacks multi-analyst workflows
4. **Testing Coverage**: No automated tests currently
5. **Production Readiness**: Missing monitoring, error handling, deployment automation

---

## Conclusion

**Agent Trust Demo** is a well-architected foundation for exploring fraud detection in agentic commerce. The core engine is functional, the UI provides good visibility, and the architecture supports scaling up to more ambitious analytics and collaborative workflows.

1. **Scale** - Generate and handle 1M+ transactions
2. **Analytics** - Build the agent dashboard and visualizations
3. **Collaboration** - Enable team-based fraud analysis
4. **Intelligence** - Add behavioral scoring and ML recommendations

This project demonstrates that interpretable, rule-based fraud detection can coexist with real-time, high-volume transaction processing—a crucial capability as autonomous agents become ubiquitous in online commerce.
