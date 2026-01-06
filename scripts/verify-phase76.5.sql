-- =============================================================================
-- Phase 76.5 Verification Queries
-- =============================================================================
-- Run these queries against the ferry_forecast schema in Supabase to verify
-- that the ingestion pipeline is working correctly.
--
-- USAGE: Run in Supabase SQL Editor
-- =============================================================================

-- =============================================================================
-- QUERY 1: Check ingest_runs for today
-- Expected: If observer is running, should see rows with today's date
-- =============================================================================
SELECT
  request_id,
  operator_id,
  service_date,
  observed_at,
  payload_sailings_count,
  payload_cancellations_count,
  db_rows_inserted,
  db_rows_updated,
  db_rows_failed,
  status,
  error,
  trigger_type,
  created_at
FROM ferry_forecast.ingest_runs
WHERE service_date = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 20;

-- =============================================================================
-- QUERY 2: Check observer_heartbeats (should have one row per operator)
-- Expected: last_seen_at should be recent if observer is running
-- =============================================================================
SELECT
  operator_id,
  last_seen_at,
  NOW() - last_seen_at AS time_since_last_seen,
  last_success,
  last_error,
  last_service_date,
  last_sailings_count,
  last_cancellations_count,
  consecutive_failures,
  CASE
    WHEN NOW() - last_seen_at > interval '30 minutes' THEN 'STALE'
    WHEN last_success = false THEN 'ERROR'
    ELSE 'HEALTHY'
  END AS health_status
FROM ferry_forecast.observer_heartbeats
ORDER BY operator_id;

-- =============================================================================
-- QUERY 3: Check sailing_events for today
-- Expected: Should have sailings if observer has ingested data
-- =============================================================================
SELECT
  operator_id,
  service_date,
  status,
  sailing_origin,
  COUNT(*) as count
FROM ferry_forecast.sailing_events
WHERE service_date = CURRENT_DATE
GROUP BY 1, 2, 3, 4
ORDER BY 1, 3;

-- =============================================================================
-- QUERY 4: Detailed sailing_events for today (showing operator_removed if any)
-- Expected: If Phase 74 is working, should see sailing_origin = 'operator_removed'
-- =============================================================================
SELECT
  id,
  operator_id,
  service_date,
  from_port,
  to_port,
  departure_time,
  status,
  status_reason,
  sailing_origin,
  created_at,
  updated_at
FROM ferry_forecast.sailing_events
WHERE service_date = CURRENT_DATE
  AND (status = 'canceled' OR sailing_origin = 'operator_removed')
ORDER BY departure_time;

-- =============================================================================
-- QUERY 5: Count sailings by status for today
-- Expected: Should match what the observer is sending
-- =============================================================================
SELECT
  operator_id,
  status,
  COUNT(*) as count
FROM ferry_forecast.sailing_events
WHERE service_date = CURRENT_DATE
GROUP BY 1, 2
ORDER BY 1, 2;

-- =============================================================================
-- QUERY 6: Recent ingest runs with failure analysis
-- Expected: Status should be 'ok' for successful ingests
-- =============================================================================
SELECT
  request_id,
  operator_id,
  service_date,
  status,
  error,
  payload_sailings_count,
  db_rows_inserted + db_rows_updated AS rows_processed,
  db_rows_failed,
  trigger_type,
  NOW() - created_at AS age
FROM ferry_forecast.ingest_runs
WHERE created_at > NOW() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 50;

-- =============================================================================
-- QUERY 7: Check for request_id uniqueness (Phase 76.5 requirement)
-- Expected: All request_ids should be unique
-- =============================================================================
SELECT
  request_id,
  COUNT(*) as count
FROM ferry_forecast.ingest_runs
GROUP BY request_id
HAVING COUNT(*) > 1;

-- =============================================================================
-- QUERY 8: Verify sailing_origin column exists and has expected values
-- Expected: Should return 'operator_removed' if any sailings were detected as removed
-- =============================================================================
SELECT DISTINCT sailing_origin
FROM ferry_forecast.sailing_events
WHERE sailing_origin IS NOT NULL;

-- =============================================================================
-- DIAGNOSIS: If sailing_events_count = 0 for today, run these checks
-- =============================================================================

-- Check 1: Is there ANY data in sailing_events?
SELECT COUNT(*) as total_sailing_events FROM ferry_forecast.sailing_events;

-- Check 2: What dates have data?
SELECT service_date, COUNT(*) as count
FROM ferry_forecast.sailing_events
GROUP BY service_date
ORDER BY service_date DESC
LIMIT 10;

-- Check 3: Are there ingest runs at all?
SELECT COUNT(*) as total_ingest_runs FROM ferry_forecast.ingest_runs;

-- Check 4: Are there heartbeats at all?
SELECT COUNT(*) as total_heartbeats FROM ferry_forecast.observer_heartbeats;

-- =============================================================================
-- SUCCESS CRITERIA FOR PHASE 76.5:
-- 1. ingest_runs has rows with request_id (not null)
-- 2. observer_heartbeats has rows with last_seen_at < 30 minutes ago
-- 3. sailing_events has rows for CURRENT_DATE
-- 4. sailing_origin column exists and can contain 'operator_removed'
-- =============================================================================
