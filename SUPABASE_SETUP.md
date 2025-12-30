# Supabase Setup Guide for Ferry Forecast

This guide walks you through setting up Supabase for the Ferry Forecast application.

## Step 1: Create a Supabase Account and Project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**
2. Sign in with GitHub (recommended) or create an account with email
3. Click **New project**
4. Fill in the project details:
   - **Organization**: Select or create one
   - **Name**: `ferry-forecast` (or any name you prefer)
   - **Database Password**: Generate a strong password and **save it somewhere safe**
   - **Region**: Choose the closest region to your users (e.g., `East US` for Cape Cod)
5. Click **Create new project**
6. Wait 1-2 minutes for the project to be provisioned

## Step 2: Get Your API Keys

1. Once your project is ready, click **Project Settings** (gear icon) in the left sidebar
2. Click **API** in the settings menu
3. You'll see two important values:
   - **Project URL**: Something like `https://abcdefghijklmnop.supabase.co`
   - **anon public** key: A long string starting with `eyJ...`
   - **service_role** key: Another long string (click "Reveal" to see it)

4. Copy these values - you'll need them in Step 4

## Step 3: Run the Database Schema

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **+ New query**
3. Open the file `supabase/schema.sql` from your project folder
4. Copy the ENTIRE contents of `schema.sql`
5. Paste it into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned" - this is expected

**Verify the schema was created:**
1. Click **Table Editor** in the left sidebar
2. You should see these tables:
   - `regions`
   - `ports`
   - `operators`
   - `routes`
   - `vessels`
   - `route_vessels`
   - `vessel_thresholds`
   - `risk_profiles`
   - `disruption_history`
   - `weather_cache`
   - `operator_status_cache`

## Step 4: Run the Seed Data

1. Go back to **SQL Editor**
2. Click **+ New query**
3. Open the file `supabase/seed.sql` from your project folder
4. Copy the ENTIRE contents of `seed.sql`
5. Paste it into the SQL Editor
6. Click **Run**
7. You should see "Success. No rows returned"

**Verify the seed data:**
1. Go to **Table Editor**
2. Click on the `regions` table - you should see "Cape Cod & Islands"
3. Click on the `ports` table - you should see 5 ports
4. Click on the `operators` table - you should see 2 operators
5. Click on the `routes` table - you should see 10 routes

## Step 5: Configure Your Local Environment

1. In your project folder, copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` in a text editor and fill in your values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key...
   ```

3. **IMPORTANT**: Never commit `.env.local` to git - it's already in `.gitignore`

## Step 6: Test the Connection

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open [http://localhost:3000](http://localhost:3000) in your browser

3. The route selector should now load data from Supabase:
   - If it works: You'll see the port dropdown populate with real data
   - If it fails: You'll see "Using fallback route config" - check your `.env.local` values

## Troubleshooting

### "Using fallback route config" appears

This means Supabase isn't connected. Check:
1. Your `.env.local` file exists and has the correct values
2. You restarted the dev server after creating `.env.local`
3. The URL starts with `https://` and ends with `.supabase.co`
4. The anon key is the full key (very long string)

### "No rows returned" but tables are empty

Make sure you ran both:
1. `schema.sql` first (creates tables)
2. `seed.sql` second (inserts data)

### Permission errors when querying

The Row Level Security (RLS) policies allow public read access. If you're getting permission errors:
1. Go to **Authentication** > **Policies** in Supabase
2. Verify each table has a "Public read" policy enabled

### Can't see the views (routes_full, route_vessels_full)

Views are created in `schema.sql`. If they're missing:
1. Go to **SQL Editor**
2. Run just the VIEW creation part of schema.sql (search for "CREATE VIEW")

## Adding Vessel Data (Optional)

The seed data doesn't include vessels because I couldn't verify the exact fleet. When you have confirmed vessel information:

1. Go to **SQL Editor**
2. Run queries like:

```sql
-- Add a vessel for Steamship Authority
INSERT INTO vessels (operator_id, name, vessel_class, passenger_capacity, vehicle_capacity, active)
SELECT operator_id, 'Island Home', 'large_ferry', 1200, 76, true
FROM operators WHERE slug = 'steamship-authority';

-- Add weather thresholds for that vessel
INSERT INTO vessel_thresholds (vessel_id, wind_limit_mph, gust_limit_mph, directional_sensitivity, advisory_sensitivity)
SELECT vessel_id, 40, 55, 0.9, 0.9
FROM vessels WHERE name = 'Island Home';

-- Link vessel to routes it serves
INSERT INTO route_vessels (route_id, vessel_id, is_primary)
SELECT r.route_id, v.vessel_id, true
FROM routes r, vessels v
WHERE r.slug IN ('wh-vh-ssa', 'vh-wh-ssa')
  AND v.name = 'Island Home';
```

## Next Steps

Once Supabase is connected:
- Phase 3 will add real weather data fetching
- Phase 4 will add operator status scraping
- Phase 5 will connect the scoring engine
- Phase 6 will implement the full forecast API
