// src/dbClient.js
import './loadEnv.js';
import { createClient } from '@supabase/supabase-js';

console.log('All environment variables:', Object.keys(process.env).filter(key => key.startsWith('SUPABASE')));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Environment check:');
console.log('SUPABASE_URL exists:', !!supabaseUrl);
console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!supabaseKey);
console.log('SUPABASE_SERVICE_ROLE_KEY length:', supabaseKey ? supabaseKey.length : 0);

let supabase = null;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase credentials not configured - client will be null (expected in tests)');
} else {
  // Create Supabase client
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  });
}

/**
 * Get Supabase client instance
 * Provides null-safe access for tests and dry-run engine
 * @returns {Object|null} Supabase client or null if not configured
 */
export function getSupabase() {
  return supabase;
}

export { supabase };
