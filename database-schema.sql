-- Database Schema for Agent Trust Demo
-- Run this in your Supabase SQL editor to create the required tables

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    risk_profile INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    txn_id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    agent_id TEXT NOT NULL,
    partner TEXT,
    amount DECIMAL(10,2) NOT NULL,
    intent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    agent_token TEXT,
    flagged BOOLEAN DEFAULT FALSE,
    declined BOOLEAN DEFAULT FALSE,
    disputed BOOLEAN DEFAULT FALSE,
    to_review BOOLEAN DEFAULT FALSE,
    seller_name TEXT,
    seller_url TEXT,
    delegation_time TIMESTAMP WITH TIME ZONE,
    delegated BOOLEAN DEFAULT FALSE,
    device TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Agent Profiles table (for scoring)
CREATE TABLE IF NOT EXISTS user_agent_profiles (
    user_id UUID REFERENCES users(user_id),
    agent_id TEXT NOT NULL,
    score INTEGER DEFAULT 100,
    good_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, agent_id)
);

-- Fraud Rules table (for rule engine)
CREATE TABLE IF NOT EXISTS fraud_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT NOT NULL,
    rule_description TEXT,
    rule_condition TEXT NOT NULL,
    rule_action TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_user_agent_profiles_user_id ON user_agent_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agent_profiles_agent_id ON user_agent_profiles(agent_id);

-- Function to calculate agent summary (used by the application)
CREATE OR REPLACE FUNCTION agent_summary(p_user_id UUID, p_since TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
    agent_id TEXT,
    txn_count BIGINT,
    agent_score INTEGER,
    flagged_count BIGINT,
    to_review_count BIGINT,
    declined_count BIGINT,
    disputed_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.agent_id,
        COUNT(*) as txn_count,
        COALESCE(uap.score, 100) as agent_score,
        COUNT(*) FILTER (WHERE t.flagged) as flagged_count,
        COUNT(*) FILTER (WHERE t.to_review) as to_review_count,
        COUNT(*) FILTER (WHERE t.declined) as declined_count,
        COUNT(*) FILTER (WHERE t.disputed) as disputed_count
    FROM transactions t
    LEFT JOIN user_agent_profiles uap ON t.user_id = uap.user_id AND t.agent_id = uap.agent_id
    WHERE t.user_id = p_user_id AND t.timestamp >= p_since
    GROUP BY t.agent_id, uap.score;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (RLS) - optional for demo
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_agent_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE fraud_rules ENABLE ROW LEVEL SECURITY; 