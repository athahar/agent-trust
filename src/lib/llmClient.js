// src/lib/llmClient.js
// LLM client for AI-assisted rule generation
// Features: function calling, caching, rate limiting, audit logging

import '../loadEnv.js'; // Must be first to load environment variables
import OpenAI from 'openai';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { RULE_FUNCTION_SCHEMA } from './ruleSchema.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// In-memory cache (30 minute TTL)
// Production: use Redis or similar
const promptCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Rate limiting
const rateLimiter = {
  requests: [],
  maxRequestsPerMinute: 10,

  canMakeRequest() {
    const now = Date.now();
    // Remove requests older than 1 minute
    this.requests = this.requests.filter(t => now - t < 60000);

    if (this.requests.length >= this.maxRequestsPerMinute) {
      return false;
    }

    this.requests.push(now);
    return true;
  },

  timeUntilNextSlot() {
    if (this.requests.length === 0) return 0;

    const oldestRequest = Math.min(...this.requests);
    const timeRemaining = 60000 - (Date.now() - oldestRequest);
    return Math.max(0, timeRemaining);
  }
};

/**
 * Generate fraud rule from natural language instruction
 *
 * @param {string} instruction - Natural language prompt from analyst
 * @param {Object} options - { model, temperature, actor, suggestionId }
 * @returns {Object} { rule, metadata }
 */
export async function generateRule(instruction, options = {}) {
  const {
    model = 'gpt-4-turbo-2024-04-09',
    temperature = 0.1, // Low temperature for deterministic output
    actor = 'unknown',
    suggestionId = null
  } = options;

  // Validate instruction
  if (!instruction || typeof instruction !== 'string' || instruction.trim().length < 10) {
    throw new Error('Instruction must be at least 10 characters');
  }

  // Check rate limit
  if (!rateLimiter.canMakeRequest()) {
    const waitTime = rateLimiter.timeUntilNextSlot();
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds`);
  }

  // Check cache
  const promptHash = hashPrompt(instruction, model, temperature);
  const cached = getCachedResponse(promptHash);

  if (cached) {
    await logLLMCall({
      model,
      promptHash,
      instruction,
      response: cached.response,
      tokensPrompt: cached.tokens_prompt,
      tokensCompletion: cached.tokens_completion,
      tokensTotal: cached.tokens_total,
      latencyMs: 0,
      cached: true,
      success: true,
      actor,
      suggestionId
    });

    return {
      rule: cached.response,
      metadata: {
        model,
        cached: true,
        latency_ms: 0,
        tokens: cached.tokens_total
      }
    };
  }

  // Make LLM call
  const startTime = Date.now();
  let response, usage, finishReason;

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt()
        },
        {
          role: 'user',
          content: instruction
        }
      ],
      functions: [RULE_FUNCTION_SCHEMA],
      function_call: { name: 'generate_fraud_rule' } // Force function calling
    });

    const latencyMs = Date.now() - startTime;

    // Extract function call response
    const message = completion.choices[0].message;
    finishReason = completion.choices[0].finish_reason;
    usage = completion.usage;

    if (!message.function_call || !message.function_call.arguments) {
      throw new Error('LLM did not return a function call. This should never happen with forced function calling.');
    }

    // Parse JSON response
    response = JSON.parse(message.function_call.arguments);

    // Validate response structure
    if (!response.ruleset_name || !response.decision || !response.conditions) {
      throw new Error('LLM returned invalid rule structure');
    }

    // Cache response
    setCachedResponse(promptHash, {
      response,
      tokens_prompt: usage.prompt_tokens,
      tokens_completion: usage.completion_tokens,
      tokens_total: usage.total_tokens
    });

    // Log LLM call
    await logLLMCall({
      model,
      promptHash,
      instruction,
      response,
      tokensPrompt: usage.prompt_tokens,
      tokensCompletion: usage.completion_tokens,
      tokensTotal: usage.total_tokens,
      latencyMs,
      finishReason,
      cached: false,
      success: true,
      actor,
      suggestionId
    });

    return {
      rule: response,
      metadata: {
        model,
        cached: false,
        latency_ms: latencyMs,
        tokens: usage.total_tokens,
        finish_reason: finishReason
      }
    };

  } catch (error) {
    const latencyMs = Date.now() - startTime;

    // Log failed call
    await logLLMCall({
      model,
      promptHash,
      instruction,
      response: null,
      tokensPrompt: usage?.prompt_tokens || 0,
      tokensCompletion: usage?.completion_tokens || 0,
      tokensTotal: usage?.total_tokens || 0,
      latencyMs,
      finishReason: finishReason || null,
      cached: false,
      success: false,
      errorMessage: error.message,
      actor,
      suggestionId
    });

    throw error;
  }
}

/**
 * Build system prompt for LLM
 * Includes feature catalog, policy rules, examples
 */
function buildSystemPrompt() {
  return `You are a fraud detection rule assistant. Your job is to convert natural language instructions into precise fraud detection rules.

CRITICAL POLICY REQUIREMENTS:
1. NEVER use geographic fields (country, region, zipcode, ip_city)
2. NEVER use demographic fields (ethnicity, religion, nationality)
3. NEVER use PII fields unless absolutely necessary (user_id, email, tax_id)
4. Rules must be objective, data-driven, and non-discriminatory

AVAILABLE TRANSACTION FIELDS:
- amount: number (0-1000000 USD)
- hour: integer (0-23, hour of day)
- device: enum [web, mobile, tablet]
- agent_id: string (openai, anthropic, google, meta, perplexity, xai, other)
- partner: enum [amazon, shopify, stripe, paypal, square, adyen, checkout]
- intent: enum [purchase, refund, transfer, withdrawal]
- account_age_days: number (0-36500)
- is_first_transaction: boolean
- flagged: boolean (previously flagged by analysts)
- disputed: boolean (customer disputed)
- declined: boolean (previously declined)
- seller_name: string (merchant name)

DECISION TYPES:
- "allow": Let transaction through
- "review": Send to manual review queue
- "block": Automatically block transaction

OPERATORS:
- Comparison: ==, !=, >, <, >=, <=
- Array: in, not_in
- String: contains, starts_with, ends_with

RULE STRUCTURE:
{
  "ruleset_name": "descriptive-kebab-case-name",
  "description": "Clear explanation of why this rule exists (10-500 chars)",
  "decision": "allow" | "review" | "block",
  "conditions": [
    {
      "field": "amount",
      "op": ">",
      "value": 5000
    }
  ]
}

EXAMPLES:

Instruction: "Review mobile transactions over $10k outside business hours"
Response:
{
  "ruleset_name": "high-value-mobile-after-hours",
  "description": "Large mobile transactions outside 9am-5pm pose higher risk due to lack of customer service availability for verification",
  "decision": "review",
  "conditions": [
    { "field": "amount", "op": ">", "value": 10000 },
    { "field": "device", "op": "==", "value": "mobile" },
    { "field": "hour", "op": "<", "value": 9 }
  ]
}

Instruction: "Block first-time transactions over $50k"
Response:
{
  "ruleset_name": "block-high-value-first-transaction",
  "description": "First transactions with very high amounts are statistically more likely to be fraudulent account takeovers",
  "decision": "block",
  "conditions": [
    { "field": "amount", "op": ">", "value": 50000 },
    { "field": "is_first_transaction", "op": "==", "value": true }
  ]
}

QUALITY GUIDELINES:
1. Use multiple conditions to be precise (avoid overly broad rules)
2. Prefer positive conditions (use "in" instead of "!=")
3. Always include an explanation that focuses on WHY (fraud risk rationale)
4. Use kebab-case for ruleset_name
5. Be specific with thresholds (don't use round numbers like 10000 unless justified)

Now, convert the following instruction into a fraud rule:`;
}

/**
 * Hash prompt for cache key
 */
function hashPrompt(instruction, model, temperature) {
  const input = `${model}:${temperature}:${instruction.trim()}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Get cached response
 */
function getCachedResponse(promptHash) {
  const cached = promptCache.get(promptHash);

  if (!cached) return null;

  // Check if expired
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    promptCache.delete(promptHash);
    return null;
  }

  return cached;
}

/**
 * Set cached response
 */
function setCachedResponse(promptHash, data) {
  promptCache.set(promptHash, {
    ...data,
    timestamp: Date.now()
  });
}

/**
 * Log LLM call to database for audit trail
 */
async function logLLMCall({
  model,
  promptHash,
  instruction,
  response,
  tokensPrompt,
  tokensCompletion,
  tokensTotal,
  latencyMs,
  finishReason = null,
  cached = false,
  success = true,
  errorMessage = null,
  actor = 'unknown',
  suggestionId = null
}) {
  try {
    const { error } = await supabase
      .from('llm_calls')
      .insert({
        model,
        prompt_hash: promptHash,
        prompt_preview: instruction.substring(0, 500),
        function_name: 'generate_fraud_rule',
        temperature: 0.1,
        response_json: response,
        finish_reason: finishReason,
        tokens_prompt: tokensPrompt,
        tokens_completion: tokensCompletion,
        tokens_total: tokensTotal,
        latency_ms: latencyMs,
        cached,
        success,
        error_message: errorMessage,
        suggestion_id: suggestionId,
        actor
      });

    if (error) {
      console.error('Failed to log LLM call:', error);
    }
  } catch (err) {
    console.error('Failed to log LLM call:', err.message);
  }
}

/**
 * Clear expired cache entries (cleanup function)
 */
export function cleanupCache() {
  const now = Date.now();
  for (const [hash, data] of promptCache.entries()) {
    if (now - data.timestamp > CACHE_TTL_MS) {
      promptCache.delete(hash);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupCache, 5 * 60 * 1000);

