// src/index.js
import './loadEnv.js'; // <-- MUST be first
import express from 'express';
import cors from 'cors';
import path from 'path';
import { supabase } from './dbClient.js';
// import { generateTransaction } from './synthetic_generator.js';
import { v4 as uuidv4 } from 'uuid';
import rulesRouter from './routes/rules.js';
import userRouter from './routes/user.js';
import ruleSuggestRouter from './routes/ruleSuggest.js';
import ruleApplyRouter from './routes/ruleApply.js';
import ruleDryRunRouter from './routes/ruleDryRun.js';
import { runFraudCheckAndPersist } from './lib/fraudEngineWrapper.js';
import { generateTransaction } from './generateTransaction.js';


const app = express();
app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.use('/rules', rulesRouter);
app.use('/user', userRouter);
app.use('/api/rules', ruleSuggestRouter);
app.use('/api/rules', ruleApplyRouter);
app.use('/api/rules', ruleDryRunRouter);

let userPool = [], userMap = {};

(async () => {
  try {
    if (!supabase) {
      console.warn('⚠️  Skipping user load (no Supabase client - expected in tests)');
      return;
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('user_id, name');

    if (error) {
      console.warn('⚠️  User load error (table may not exist):', error.message);
      return;
    }

    if (users && Array.isArray(users)) {
      users.forEach(u => {
        userPool.push(u.user_id);
        userMap[u.user_id] = u.name;
      });
      console.log('✅ Users loaded');
    }
  } catch (err) {
    console.warn('⚠️  User load exception:', err.message);
  }
})();

// Real-time streaming via SSE
app.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const interval = setInterval(async () => {
    try {
      const txn = generateTransaction(userPool);
      txn.txn_id = uuidv4(); // ensure no collisions
      txn.timestamp = new Date().toISOString();

      await runFraudCheckAndPersist(txn);

      const { data, error } = await supabase
        .from('transactions')
        .select('*, users(name)')
        .eq('txn_id', txn.txn_id)
        .single();

      if (error) throw error;

      const enrichedTxn = {
        ...data,
        user_name: data.users?.name ?? 'N/A'
      };

      res.write(`data: ${JSON.stringify(enrichedTxn)}\n\n`);
    } catch (err) {
      console.error('⚠️ Stream processing error:', err.message);
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

app.post('/api/eval', async (req, res) => {
  try {
    const txn = req.body;

    const requiredFields = ['user_id', 'agent_id', 'amount', 'currency'];
    const missingFields = requiredFields.filter(field => !txn[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields
      });
    }

    if (typeof txn.user_id !== 'string' ||
        typeof txn.agent_id !== 'string' ||
        typeof txn.amount !== 'number' ||
        typeof txn.currency !== 'string') {
      return res.status(400).json({
        error: 'Invalid field types',
        expected: {
          user_id: 'string',
          agent_id: 'string',
          amount: 'number',
          currency: 'string'
        }
      });
    }

    if (txn.amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    txn.txn_id = uuidv4();
    txn.timestamp = new Date().toISOString();

    await runFraudCheckAndPersist(txn);

    const { data, error } = await supabase
      .from('transactions')
      .select('*, users(name)')
      .eq('txn_id', txn.txn_id)
      .single();

    if (error) throw error;

    res.json({
      ...data,
      user_name: data.users?.name ?? 'N/A'
    });

  } catch (err) {
    console.error('❌ Eval error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Optional: leave this or remove if not used
app.get('/rules/test', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public/debug.html'));
});

app.post('/api/rules', async (req, res) => {
  const rule = req.body;
  if (!rule || !rule.id || !Array.isArray(rule.conditions)) {
    return res.status(400).json({ error: 'Invalid rule payload' });
  }

  const { data, error } = await supabase
    .from('fraud_rules')
    .update({
      rule: rule.rule,
      decision: rule.decision,
      conditions: rule.conditions,
      category: rule.category
    })
    .eq('id', rule.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, updated: data });
});

app.get('/api/samples', async (req, res) => {
  const { data, error } = await supabase
    .from('sample_transactions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/samples', async (req, res) => {
  const { name, description, txn } = req.body;
  if (!name || !txn) {
    return res.status(400).json({ error: 'Missing name or txn' });
  }

  const { error } = await supabase
    .from('sample_transactions')
    .insert([{ name, description, txn }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/api/rule-stats', async (req, res) => {
  const { data, error } = await supabase.from('rule_trigger_counts').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Only start server if running as main module (not imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));

  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    server.close(() => {
      console.log('Server closed');
    });

    setTimeout(() => {
      console.log('Shutdown complete');
      process.exit(0);
    }, 1000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('UNHANDLED_REJECTION');
  });
}

// Export app for testing with supertest
export default app;
