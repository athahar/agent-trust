// src/backfill_scores.js
import { createClient } from '@supabase/supabase-js';
import dotenv           from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function backfill() {
  console.log('🔄 Starting backfill of agent scores & user risk (last 90d)…');

  // 1) Fetch all users
  const { data: users, error: usersErr } = await supabase
    .from('atd_users')
    .select('user_id');
  if (usersErr) throw usersErr;

  const since = new Date(Date.now() - 90*24*60*60*1000).toISOString();

  for (const u of users) {
    // 2) Pull agent_summary RPC for this user
    const { data: aggr, error: rpcErr } = await supabase.rpc('agent_summary', {
      p_user_id: u.user_id,
      p_since:   since
    });
    if (rpcErr) throw rpcErr;

    // 3) Upsert each agent’s initial score
    let totalTx = 0;
    let weightedSum = 0;

    for (const a of aggr || []) {
      const badCount = 
        (a.flagged_count   || 0) +
        (a.to_review_count || 0) +
        (a.declined_count  || 0) +
        (a.disputed_count  || 0);

      const initScore = Math.max(0, 100 - badCount * 2);

      totalTx    += a.txn_count;
      weightedSum += initScore * a.txn_count;

      const { error: upsertErr } = await supabase
        .from('user_agent_profiles')
        .upsert({
          user_id:    u.user_id,
          agent_id:   a.agent_id,
          score:      initScore,
          good_count: 0
        });
      if (upsertErr) throw upsertErr;
    }

    // 4) Compute & write user risk
    const newRisk = totalTx
      ? Math.round(weightedSum / totalTx)
      : 50;

    const { error: userErr } = await supabase
      .from('atd_users')
      .update({ risk_profile: newRisk })
      .eq('user_id', u.user_id);
    if (userErr) throw userErr;

    console.log(`→ User ${u.user_id}: risk set to ${newRisk}`);
  }

  console.log('✅ Backfill complete');
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
