// src/index.js
import express               from 'express';
import cors                  from 'cors';
import dotenv                from 'dotenv';
import { supabase }          from './dbClient.js';
import { generateTransaction } from './synthetic_generator.js';
import { v4 as uuidv4 }      from 'uuid';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.static('public'));

let userPool = [], userMap = {};

// Load users & backfill on startup
(async () => {
  const { data: users } = await supabase
    .from('users').select('user_id,name');
  if (users) {
    for (const u of users) {
      userPool.push(u.user_id);
      userMap[u.user_id] = u.name;
    }
  }

  const RECENCY_DAYS = 90;
  const since = new Date(Date.now() - RECENCY_DAYS*24*60*60*1000).toISOString();

  for (const u of users || []) {
    const { data: aggr } = await supabase
      .rpc('agent_summary', { p_user_id:u.user_id, p_since:since });

    // compute initial agent score
    for (const a of aggr || []) {
      const badCount =
        (a.flagged_count   || 0) +
        (a.to_review_count || 0) +
        (a.declined_count  || 0) +
        (a.disputed_count  || 0);
      const initScore = Math.max(0, 100 - badCount * 2);

      await supabase.from('user_agent_profiles').upsert({
        user_id:    u.user_id,
        agent_id:   a.agent_id,
        score:      initScore,
        good_count: 0
      });
    }

    // compute overall trust
    const totalTx  = (aggr||[]).reduce((s,x)=>s+x.txn_count,0);
    const weighted = (aggr||[]).reduce((s,x)=>s + x.agent_score*x.txn_count,0);
    const newTrust = totalTx ? Math.round(weighted/totalTx) : 50;

    await supabase
      .from('users')
      .update({ risk_profile:newTrust })
      .eq('user_id', u.user_id);
  }

  console.log('✅ Backfill complete (90d window)');
})();

async function recalcUserTrust(userId) {
  const RECENCY_DAYS = 90;
  const since = new Date(Date.now() - RECENCY_DAYS*24*60*60*1000).toISOString();
  const { data: aggr } = await supabase
    .rpc('agent_summary', { p_user_id:userId, p_since:since });

  const totalTx  = (aggr||[]).reduce((s,x)=>s+x.txn_count,0);
  const weighted = (aggr||[]).reduce((s,x)=>s + x.agent_score*x.txn_count,0);
  const newTrust = totalTx ? Math.round(weighted/totalTx) : 50;

  await supabase
    .from('users')
    .update({ risk_profile:newTrust })
    .eq('user_id', userId);
}

async function processTxn(txn) {
  const { data: prof } = await supabase
    .from('user_agent_profiles')
    .select('score,good_count')
    .match({ user_id:txn.user_id, agent_id:txn.agent_id })
    .single();

  let score      = prof?.score      ?? 100;
  let good_count = prof?.good_count ?? 0;
  const isBad    = txn.flagged || txn.declined || txn.disputed || txn.to_review;

  if (isBad) {
    score = Math.max(0, score - 2);
    good_count = 0;
  } else {
    good_count++;
    const thresh = score < 90 ? 8 : 15;
    if (good_count >= thresh && score < 100) {
      score = Math.min(100, score + 1);
      good_count = 0;
    }
  }

  await supabase.from('user_agent_profiles').upsert({
    user_id:txn.user_id, agent_id:txn.agent_id, score, good_count
  });

  await recalcUserTrust(txn.user_id);
}

// SSE: live stream
app.get('/stream', (req, res) => {
  res.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache',
    Connection:'keep-alive'
  });

  const iv = setInterval(async () => {
    const txn = generateTransaction(userPool);
    txn.timestamp = new Date().toISOString();
    txn.user_name = userMap[txn.user_id] || 'Unknown';

    await supabase.from('transactions').insert([txn]);
    await processTxn(txn);

    res.write(`data: ${JSON.stringify(txn)}\n\n`);
  }, 1000);

  req.on('close', () => {
    clearInterval(iv);
    res.end();
  });
});

// SIMULATE endpoint w/ full params
app.post('/simulate/:userId/one', async (req, res) => {
  const { userId } = req.params;
  // … build up txn exactly as before …
  const statusParam = (req.query.status || 'good').toLowerCase();
  const partnerParam = req.query.partner;
  const sellerParam  = req.query.seller;
  const delegatedParam = req.query.delegated;
  const hoursOffset   = parseFloat(req.query.delegated_hours) || 2;

  console.log("---------");
  console.log("userId: " + userId);
  console.log("partnerParam: " + partnerParam);
  console.log("statusParam: " + statusParam);
  console.log("---------");

  let txn = generateTransaction([userId]);
  txn.timestamp       = new Date().toISOString();
  txn.user_name       = userMap[userId] || 'Unknown';

  if (partnerParam) {
    txn.partner     = partnerParam;
    txn.agent_id    = `${userId}_${partnerParam}`;
    txn.agent_token = `token_${txn.agent_id}`;
  }
  if (sellerParam) txn.seller_name = sellerParam;
  txn.delegated       = delegatedParam === 'direct' ? false : true;
  txn.delegation_time = new Date(Date.now() - hoursOffset*3600*1000).toISOString();

  txn.flagged    = false;
  txn.to_review  = false;
  txn.declined   = false;
  txn.disputed   = false;
  switch (statusParam) {
    case 'flagged':  txn.flagged   = true; break;
    case 'review':   txn.to_review = true; break;
    case 'declined': txn.declined  = true; break;
    case 'disputed': txn.disputed  = true; break;
  }

  // strip both status & user_name before insert
  const { status, user_name, ...toInsert } = { ...txn, status: statusParam };

  const { error: insertErr } = await supabase
    .from('transactions')
    .insert([toInsert]);
  if (insertErr) {
    console.error('🚨 insert failed:', insertErr);
    return res.status(500).json({ error: insertErr.message });
  }

  await processTxn(toInsert);

  // echo the full txn back (including status)
  res.json({ ...toInsert, status: statusParam });
});

// User summary
app.get('/user/:userId/summary', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('users').select('user_id,name,risk_profile').eq('user_id', userId).single();
  if (error) return res.status(500).json({ error:error.message });
  res.json(data);
});

// Agent stats
app.get('/user/:userId/agents', async (req, res) => {
  const { userId } = req.params;
  const days = Number(req.query.period) || 30;
  const since = new Date(Date.now() - days*24*60*60*1000).toISOString();
  const { data, error } = await supabase
    .rpc('agent_summary', { p_user_id:userId, p_since:since });
  if (error) return res.status(500).json({ error:error.message });
  res.json(data);
});

// Raw transaction history
app.get('/simulate/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp',{ascending:false})
    .limit(200);
  if (error) return res.status(500).json({ error:error.message });
  res.json(data.reverse());
});

const PORT = process.env.PORT||3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
