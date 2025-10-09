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

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

export { supabase };
