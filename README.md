# Agent Trust Demo

## Prerequisites
- Node.js v16+
- npm

## Install & Generate Data
```bash
cd agent-trust-demo
npm install
npm run gen-data   # generates 1e6 transactions
npm start
```

## Run
Open http://localhost:3000 in your browser.

## Recommended Database
For persistence, use **PostgreSQL** (e.g., via Supabase). You can load `data/txns.json` into a table for querying, and store scoring results. 

----------
## more about the project
----------

Agent Trust Demo - Project Summary
Overview
Agent Trust Demo is a real-time sandbox environment for fraud analysts working in the emerging world of agentic commerce. It simulates a high-volume environment where transactions are executed by autonomous agents (e.g., ChatGPT, Claude, Gemini acting on behalf of users) and equips analysts with tools to write, test, and refine fraud rules at scale.

Core Philosophy: Instead of treating fraud detection as a black-box ML task, this system empowers users with interpretable, testable, and editable rules, providing real feedback on agent behavior at scale.

What Has Been Built
1. Backend Architecture
Core Services
Express Server (src/index.js)

RESTful API for transaction evaluation, rule management, and user lookups
Server-Sent Events (SSE) endpoint (/stream) for real-time transaction streaming
Graceful shutdown handling with proper signal management
CORS-enabled for frontend integration
Database Layer (src/dbClient.js)

Supabase/PostgreSQL integration
Service role authentication for backend operations
Environment variable validation and initialization
Fraud Detection Engine
Rule Engine (src/lib/ruleEngine.js)

JSON-based declarative rule system
Rule caching mechanism (5-minute cache duration)
Supports multiple operators:
Equality: ==, !=
Comparison: >, <, >=, <=
Set operations: in, not_in
String operations: contains
Context-aware evaluation (trusted partners, registered agents, approved scopes)
Transaction enrichment (hour extraction, delegation duration calculation)
Automatic decision hierarchy: block > review > allow
Risk Scoring Engine (src/lib/riskScoreEngine.js)

Baseline risk score: 50/100
Dynamic score adjustment based on triggered rules:
Block rules: +40 points
Review/flag rules: +20 points
Score capping between 0-100
Fraud Engine Wrapper (src/lib/fraudEngineWrapper.js)

Orchestrates rule evaluation and risk scoring
Persists transactions to database with full fraud analysis
Generates comprehensive fraud output including:
Risk score and decision
Triggered rule IDs and actions
Matched rule descriptions
Manual review flags
Engine version tracking
Risk tags and explanation summary
2. Data Generation
Synthetic Transaction Generator (src/generateTransaction.js)
Generates realistic transactions with:
User assignments from pool
Random partner selection (Ramp, Payman, Nekuda, OpenAI, Anthropic, Gemini, Stripe)
Intent types: ecommerce_booking, travel_booking, invoice_payment, subscription
Device types: web, mobile, tablet
Merchant assignments from curated list
Agent delegation scenarios
Edge case injection (15% trusted users, 15% mobile+trusted partner, etc.)
Ensures data quality with non-null amount and currency
Seed Script (src/seed.js)
Creates 200 users from curated name list
Generates one transaction per merchant per user
Implements fraud flags: flagged (5%), declined (20% of flagged), disputed (10% of flagged)
Batch processing (200 records per batch) for performance
Risk profile assignment per user (20-80 range)
3. API Endpoints
Transaction Endpoints
GET /stream - Real-time SSE transaction feed with fraud evaluation
POST /api/eval - Evaluate and persist a single transaction
Input validation for required fields (user_id, agent_id, amount, currency)
Type checking and business rule validation (positive amounts)
Returns enriched transaction with fraud analysis
Rule Management
GET /rules - Fetch all fraud rules (with optional filter for disabled rules)
GET /rules/:id/matches - Get transactions matching a specific rule
POST /api/rules - Update existing fraud rule
GET /rules/test - Debug interface for rule testing
User & Agent Analytics
GET /user/:userId/summary - User profile with risk score
GET /user/:userId/agents?period=N - Agent-level statistics for a user
Transaction counts, total amounts, risk scores
Breakdown by review/block/dispute counts
GET /user/:userId/agent/:agentId/transactions - Transaction history for specific agent
GET /user/simulate/:userId - Full transaction history for simulation (last 200)
Sample Transactions & Statistics
GET /api/samples - Retrieve saved sample transactions
POST /api/samples - Save a transaction sample for testing
GET /api/rule-stats - Rule trigger counts and statistics
4. Frontend Interfaces
Live Dashboard (public/index.html)
Real-time transaction monitoring via SSE
Displays up to 50 most recent transactions
Key fields shown:
Timestamp, Transaction ID, User details
Agent, Partner, Seller
Amount, Intent
Fraud decision and flags
Click-through to user detail pages
Fixed header navigation (VeriMesh branding)
Rule Management UI (public/rules.html)
Comprehensive rule dashboard with Bootstrap 5
Features:
Search by rule name, condition, action, classification, behavioral rule
Filter by enabled/disabled status
Interactive table with sortable columns
Modal-based rule inspection:
Full condition display with human-readable formatting
Enable/disable toggle
Match count in last 90 days
Recent matching transactions preview
Link to view all matching transactions
Visual operator highlighting:
in operations (green)
not_in, != (red)
contains (blue)
Smart condition formatting (e.g., "delegation hour outside of 9am to 5pm")
User Detail Page (public/user.html)
User overview: ID, Name, Trust Score
Agent breakdown table:
Partner-level aggregation
Transaction counts and total amounts
Average risk scores per agent
Review/block/dispute counts
"View" link for detailed agent transactions
Time period selector: 30d, 90d, 1y
Transaction modal with:
List view: All transactions by selected agent
Fingerprint view: Deep dive into individual transaction details
Back button navigation between views
Simulation panel placeholder (for testing transactions)
5. Data Models
Key Entities
Based on the code, the system uses these primary entities:

Users

{
  "user_id": "uuid",
  "name": "string",
  "risk_profile": "number (20-80)"
}
Transactions

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
Fraud Rules

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
