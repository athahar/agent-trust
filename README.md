# Agent Trust Demo

## Prerequisites
- Node.js v16+
- npm

## Install & Generate Data
```bash
cd agent-trust-demo
npm install
npm run gen-data   # generates 1e6 transactions
npm start
```

## Run
Open http://localhost:3000 in your browser.

## Recommended Database
For persistence, use **PostgreSQL** (e.g., via Supabase). You can load `data/txns.json` into a table for querying, and store scoring results. 