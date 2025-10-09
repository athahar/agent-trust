#!/usr/bin/env node
// scripts/pretestEnvGuard.mjs
// Fail fast if "pure" test suites are run with real API keys present
// Prevents accidental network calls during unit/fuzz/perf/golden tests

const FAILING_KEYS = [
  "OPENAI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "DATABASE_URL"
];

// Allow override in CI when running integration/E2E later
const allow = process.env.ALLOW_NETWORK_KEYS_FOR_TESTS === "true";

const offenders = FAILING_KEYS.filter(k => !!process.env[k]);

if (offenders.length && !allow) {
  console.error(
    `\n❌ Env-key guard: Refusing to run unit/fuzz/perf/golden tests with real secrets set.\n` +
    `   These tests should be pure (no network calls).\n` +
    `\n` +
    `   Offending keys: ${offenders.join(", ")}\n` +
    `\n` +
    `   Options:\n` +
    `   1. Unset these env vars before running tests\n` +
    `   2. Use ALLOW_NETWORK_KEYS_FOR_TESTS=true for integration tests only\n` +
    `\n` +
    `   Example (to temporarily unset):\n` +
    `   unset OPENAI_API_KEY SUPABASE_SERVICE_ROLE_KEY\n` +
    `   npm test\n`
  );
  process.exit(1);
}

// Passed the guard
if (allow) {
  console.log("✅ Env-key guard: Network keys allowed (ALLOW_NETWORK_KEYS_FOR_TESTS=true)");
} else {
  console.log("✅ Env-key guard: No network keys detected (pure tests)");
}
