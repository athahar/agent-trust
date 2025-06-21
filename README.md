# Agent Trust Demo

A demonstration application for tracking trust scores between users and AI agents based on transaction history.

## Prerequisites
- Node.js v16+
- npm
- Supabase account and project

## Setup

### 1. Environment Variables
Create a `.env` file in the root directory with your Supabase credentials:

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
PORT=3000
```

**How to get Supabase credentials:**
1. Go to [Supabase](https://supabase.com) and create a new project
2. Go to Settings > API
3. Copy the "Project URL" as your `SUPABASE_URL`
4. Copy the "service_role" key as your `SUPABASE_SERVICE_ROLE_KEY`

### 2. Database Setup
Run the SQL schema in your Supabase SQL editor:
```bash
# Copy and paste the contents of database-schema.sql into your Supabase SQL editor
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Generate Sample Data
```bash
npm run seed   # generates users and sample transactions
```

### 5. Start the Application
```bash
npm start
```

## Usage
Open http://localhost:3000 in your browser.

## API Endpoints

- `GET /stream` - Server-sent events stream of live transactions
- `POST /simulate/:userId/one` - Simulate a transaction for a specific user
- `GET /user/:userId/summary` - Get user trust summary

## Database Schema

The application uses the following tables:
- `users` - User information and risk profiles
- `transactions` - Transaction data with agent interactions
- `user_agent_profiles` - Trust scores between users and agents
- `fraud_rules` - Rules for fraud detection

See `database-schema.sql` for the complete schema definition.

## Recommended Database
For persistence, use **PostgreSQL** (e.g., via Supabase). You can load `data/txns.json` into a table for querying, and store scoring results. 