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

if (!supabaseUrl || !supabaseKey) {
  throw new Error('❌ Supabase URL and Service Role Key must be set in .env');
}

// Create Supabase client with debug logging
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

// Add debug logging for database operations
const originalFrom = supabase.from;
supabase.from = function(table) {
  console.log(`🔍 Querying table: ${table}`);
  const query = originalFrom.call(this, table);
  const originalSelect = query.select;
  query.select = function(...args) {
    console.log(`📊 Select query on ${table}:`, args);
    return originalSelect.apply(this, args);
  };
  return query;
};

export { supabase };
