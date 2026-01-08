-- ============================================================
-- PHASE 79: FIX TABLE GRANTS FOR SERVICE ROLE
-- ============================================================
--
-- PROBLEM: "permission denied for table observer_heartbeats"
-- ROOT CAUSE: Tables created in ferry_forecast schema may not have
--             proper GRANT statements for the service_role or authenticated roles.
--
-- SOLUTION: Explicitly grant INSERT, UPDATE, SELECT to relevant roles.
--
-- MANUAL APPLY INSTRUCTIONS:
-- 1. Open Supabase SQL Editor
-- 2. Paste this ENTIRE file
-- 3. Click "Run"
-- ============================================================

-- ============================================================
-- STEP 1: Grant permissions on ingest_runs table
-- ============================================================

-- Grant to service_role (used by server-side API with service role key)
GRANT SELECT, INSERT, UPDATE ON ferry_forecast.ingest_runs TO service_role;

-- Grant to authenticated (for any authenticated users, future use)
GRANT SELECT ON ferry_forecast.ingest_runs TO authenticated;

-- Grant to anon (for read-only public access)
GRANT SELECT ON ferry_forecast.ingest_runs TO anon;

-- ============================================================
-- STEP 2: Grant permissions on observer_heartbeats table
-- ============================================================

-- Grant to service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON ferry_forecast.observer_heartbeats TO service_role;

-- Grant to authenticated
GRANT SELECT ON ferry_forecast.observer_heartbeats TO authenticated;

-- Grant to anon
GRANT SELECT ON ferry_forecast.observer_heartbeats TO anon;

-- ============================================================
-- STEP 3: Grant permissions on sailing_events table
-- ============================================================
-- (May already have these, but ensure consistency)

GRANT SELECT, INSERT, UPDATE ON ferry_forecast.sailing_events TO service_role;
GRANT SELECT ON ferry_forecast.sailing_events TO authenticated;
GRANT SELECT ON ferry_forecast.sailing_events TO anon;

-- ============================================================
-- STEP 4: Grant USAGE on ferry_forecast schema
-- ============================================================
-- Ensure all roles can access the schema

GRANT USAGE ON SCHEMA ferry_forecast TO service_role;
GRANT USAGE ON SCHEMA ferry_forecast TO authenticated;
GRANT USAGE ON SCHEMA ferry_forecast TO anon;

-- ============================================================
-- STEP 5: Verify grants
-- ============================================================

DO $$
DECLARE
  grants_count INTEGER;
BEGIN
  -- Count grants on ingest_runs
  SELECT COUNT(*) INTO grants_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'ferry_forecast'
    AND table_name = 'ingest_runs';

  RAISE NOTICE 'Grants on ingest_runs: %', grants_count;

  -- Count grants on observer_heartbeats
  SELECT COUNT(*) INTO grants_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'ferry_forecast'
    AND table_name = 'observer_heartbeats';

  RAISE NOTICE 'Grants on observer_heartbeats: %', grants_count;

  -- Count grants on sailing_events
  SELECT COUNT(*) INTO grants_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'ferry_forecast'
    AND table_name = 'sailing_events';

  RAISE NOTICE 'Grants on sailing_events: %', grants_count;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'PHASE 79: Table grants applied successfully';
  RAISE NOTICE '========================================';
END $$;
