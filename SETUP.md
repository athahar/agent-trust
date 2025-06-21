# Setup Guide

## Environment Variables Required

The application requires Supabase credentials to run. You need to create a `.env` file in the root directory with the following variables:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Optional: Port configuration
PORT=3000
```

## How to get Supabase credentials:

1. Go to [Supabase](https://supabase.com) and create a new project
2. Once your project is created, go to Settings > API
3. Copy the "Project URL" and paste it as your `SUPABASE_URL`
4. Copy the "service_role" key (not the anon key) and paste it as your `SUPABASE_SERVICE_ROLE_KEY`

## Quick Setup:

1. Create a `.env` file in the root directory
2. Add the environment variables above with your actual Supabase credentials
3. Run `npm start` to start the application

## Database Setup:

The application expects the following tables in your Supabase database:
- `users` - User information
- `transactions` - Transaction data
- `user_agent_profiles` - User-agent relationship scores

You can run `npm run gen-data` to generate sample data after setting up your database schema. 