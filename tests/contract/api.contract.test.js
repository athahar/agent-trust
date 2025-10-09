// tests/api.contract.test.js
// Contract tests for API endpoints (black-box testing)
// Tests the API surface without relying on internal implementation details

// Set minimal env vars for route modules to load (they won't actually connect to DB in these tests)
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-placeholder';

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import ruleSuggestRouter from '../../src/routes/ruleSuggest.js';
import ruleApplyRouter from '../../src/routes/ruleApply.js';

// Create test app (minimal setup, no DB connection required for validation tests)
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/rules', ruleSuggestRouter);
app.use('/api/rules', ruleApplyRouter);

// ========================================
// SECTION 1: Suggest Endpoint - Input Validation
// ========================================

test('POST /api/rules/suggest - rejects empty instruction', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({ instruction: '' });

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
  assert.ok(res.body.error.includes('Instruction required'));
});

test('POST /api/rules/suggest - rejects too short instruction', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({ instruction: 'short' });

  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('min 10 characters'));
});

test('POST /api/rules/suggest - rejects missing instruction', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({});

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

// ========================================
// SECTION 2: Suggest Endpoint - Policy Gate (Pre-LLM)
// ========================================

test('POST /api/rules/suggest - blocks instruction with geographic discrimination', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({
      instruction: 'Block all transactions from geographic region X',
      actor: 'test@example.com'
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'POLICY_VIOLATION');
  assert.ok(res.body.violations);
  assert.ok(res.body.violations.some(v => v.type === 'sensitive_language'));
});

test('POST /api/rules/suggest - blocks instruction with country reference', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({
      instruction: 'Review transactions from this country with high fraud rates',
      actor: 'test@example.com'
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'POLICY_VIOLATION');
  assert.ok(res.body.violations.some(v => v.pattern.includes('country')));
});

test('POST /api/rules/suggest - blocks instruction with ethnic discrimination', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({
      instruction: 'Flag transactions based on ethnic origin patterns',
      actor: 'test@example.com'
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'POLICY_VIOLATION');
  assert.ok(res.body.violations.some(v => v.type === 'sensitive_language'));
});

test('POST /api/rules/suggest - blocks instruction with religious discrimination', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({
      instruction: 'Block transactions during religious holidays',
      actor: 'test@example.com'
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'POLICY_VIOLATION');
});

// ========================================
// SECTION 3: Apply Endpoint - Input Validation
// ========================================

test('POST /api/rules/apply - rejects missing suggestion_id', async () => {
  const res = await request(app)
    .post('/api/rules/apply')
    .send({
      approver: 'approver@example.com',
      approval_notes: 'Looks good to me',
      expected_impact: 'Will block 100 transactions',
      acknowledge_impact: true
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('suggestion_id'));
});

test('POST /api/rules/apply - rejects missing approver', async () => {
  const res = await request(app)
    .post('/api/rules/apply')
    .send({
      suggestion_id: '123e4567-e89b-12d3-a456-426614174000',
      approval_notes: 'Looks good to me',
      expected_impact: 'Will block 100 transactions',
      acknowledge_impact: true
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('approver'));
});

test('POST /api/rules/apply - rejects approval_notes too short', async () => {
  const res = await request(app)
    .post('/api/rules/apply')
    .send({
      suggestion_id: '123e4567-e89b-12d3-a456-426614174000',
      approver: 'approver@example.com',
      approval_notes: 'ok',
      expected_impact: 'Will block 100 transactions',
      acknowledge_impact: true
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('min 10 characters'));
  assert.equal(res.body.field, 'approval_notes');
});

test('POST /api/rules/apply - rejects expected_impact too short', async () => {
  const res = await request(app)
    .post('/api/rules/apply')
    .send({
      suggestion_id: '123e4567-e89b-12d3-a456-426614174000',
      approver: 'approver@example.com',
      approval_notes: 'Reviewed carefully and approved',
      expected_impact: 'ok',
      acknowledge_impact: true
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('min 10 characters'));
  assert.equal(res.body.field, 'expected_impact');
});

test('POST /api/rules/apply - rejects missing acknowledge_impact', async () => {
  const res = await request(app)
    .post('/api/rules/apply')
    .send({
      suggestion_id: '123e4567-e89b-12d3-a456-426614174000',
      approver: 'approver@example.com',
      approval_notes: 'Reviewed carefully and approved',
      expected_impact: 'Will block 100 transactions per day',
      acknowledge_impact: false
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('acknowledge_impact'));
});

// ========================================
// SECTION 4: Reject Endpoint - Input Validation
// ========================================

test('POST /api/rules/reject - rejects missing suggestion_id', async () => {
  const res = await request(app)
    .post('/api/rules/reject')
    .send({
      reviewer: 'reviewer@example.com',
      rejection_notes: 'FP risk too high'
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /api/rules/reject - rejects rejection_notes too short', async () => {
  const res = await request(app)
    .post('/api/rules/reject')
    .send({
      suggestion_id: '123e4567-e89b-12d3-a456-426614174000',
      reviewer: 'reviewer@example.com',
      rejection_notes: 'bad'
    });

  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('min 10 chars'));
});

// ========================================
// SECTION 5: Response Structure Tests
// ========================================

test('API errors return consistent structure', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({ instruction: '' });

  assert.equal(res.status, 400);
  assert.ok(res.body.error, 'Should have error field');
  assert.ok(res.body.code, 'Should have error code');
});

test('Policy violations return detailed information', async () => {
  const res = await request(app)
    .post('/api/rules/suggest')
    .send({
      instruction: 'Block transactions from country X',
      actor: 'test@example.com'
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'POLICY_VIOLATION');
  assert.ok(Array.isArray(res.body.violations), 'Should have violations array');
  assert.ok(res.body.violations.length > 0, 'Should have at least one violation');

  const violation = res.body.violations[0];
  assert.ok(violation.type, 'Violation should have type');
  assert.ok(violation.severity, 'Violation should have severity');
  assert.ok(violation.message, 'Violation should have message');
});

console.log('\n✅ All contract tests defined');
console.log('Note: These tests verify API contract without requiring DB/LLM access\n');

