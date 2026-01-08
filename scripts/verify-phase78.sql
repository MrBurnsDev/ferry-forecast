-- ============================================================
-- PHASE 78.1 VERIFICATION QUERIES
-- SSA Full Day Schedule Ingestion
-- ============================================================
--
-- RUN AFTER applying: supabase/migrations/009_phase78_schedule_source.sql
--
-- CANONICAL schedule_source VALUES:
-- - 'operator_snapshot': Full-day schedule from operator (base schedule)
-- - 'operator_status': Status-only update from operator (overlay)
-- - 'template': Static fallback (only when no operator data)
-- ============================================================

-- ============================================================
-- STEP 0: PRE-FLIGHT CHECKS (RUN THESE FIRST)
-- ============================================================
-- These verify the migration applied correctly before running other queries

-- 0a. Check schedule_source column exists
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'ferry_forecast'
      AND table_name = 'sailing_events'
      AND column_name = 'schedule_source'
    )
    THEN 'PASS: schedule_source column exists'
    ELSE 'FAIL: schedule_source column MISSING - run migration first!'
  END AS column_check;

-- 0b. Check unique index exists
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'ferry_forecast'
      AND tablename = 'sailing_events'
      AND indexname = 'sailing_events_natural_key_unique'
    )
    THEN 'PASS: unique index exists'
    ELSE 'FAIL: unique index MISSING - run migration first!'
  END AS index_check;

-- 0c. Check for remaining duplicates that would block unique index
SELECT
  'Duplicate groups blocking unique index:' AS check_name,
  COUNT(*) AS duplicate_count
FROM (
  SELECT operator_id, service_date, from_port, to_port, departure_time
  FROM ferry_forecast.sailing_events
  GROUP BY operator_id, service_date, from_port, to_port, departure_time
  HAVING COUNT(*) > 1
) dupes;

-- 0d. List actual duplicate rows (if any exist)
-- Shows which rows need de-duping
SELECT
  operator_id,
  service_date,
  from_port,
  to_port,
  departure_time,
  COUNT(*) AS row_count,
  array_agg(id ORDER BY observed_at DESC) AS duplicate_ids
FROM ferry_forecast.sailing_events
GROUP BY operator_id, service_date, from_port, to_port, departure_time
HAVING COUNT(*) > 1
ORDER BY service_date DESC, departure_time
LIMIT 20;

-- ============================================================
-- 1. LATEST INGEST RUNS FOR SSA
-- ============================================================
-- EXPECTED: Recent rows with status='ok', db_rows_inserted > 0

SELECT
  request_id,
  operator_id,
  service_date,
  observed_at,
  payload_sailings_count AS received_sailings,
  db_rows_inserted AS inserted_count,
  db_rows_updated AS updated_count,
  db_rows_failed AS error_count,
  status,
  trigger_type,
  created_at
FROM ferry_forecast.ingest_runs
WHERE operator_id IN ('ssa', 'steamship-authority', 'steamship_authority')
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================
-- 2. LATEST OBSERVER HEARTBEATS FOR SSA
-- ============================================================
-- EXPECTED: last_seen_at within the last hour, last_success=true

SELECT
  operator_id,
  last_seen_at,
  last_request_id,
  last_success,
  last_error,
  last_service_date,
  last_sailings_count,
  last_cancellations_count,
  consecutive_failures,
  updated_at
FROM ferry_forecast.observer_heartbeats
WHERE operator_id IN ('ssa', 'steamship-authority', 'steamship_authority')
ORDER BY last_seen_at DESC
LIMIT 5;

-- ============================================================
-- 3. TODAY SAILING EVENTS GROUPED BY schedule_source
-- ============================================================
-- EXPECTED: 'operator_snapshot' count > 0 when observer is working
-- If all NULL or missing: Migration hasn't been applied

SELECT
  schedule_source,
  COUNT(*) AS sailing_count,
  COUNT(DISTINCT departure_time) AS distinct_times
FROM ferry_forecast.sailing_events
WHERE operator_id IN ('ssa', 'steamship-authority')
  AND service_date = CURRENT_DATE
GROUP BY schedule_source
ORDER BY schedule_source;

-- ============================================================
-- 4. CANCELED SAILINGS TODAY WITH STATUS MESSAGE
-- ============================================================
-- EXPECTED: Shows mechanical issues, weather, etc.

SELECT
  service_date,
  from_port,
  to_port,
  departure_time,
  status,
  status_message,
  status_reason,
  sailing_origin,
  schedule_source,
  observed_at
FROM ferry_forecast.sailing_events
WHERE operator_id IN ('ssa', 'steamship-authority')
  AND service_date = CURRENT_DATE
  AND status = 'canceled'
ORDER BY departure_time ASC;

-- ============================================================
-- 5. FULL TODAY SCHEDULE (all sailings)
-- ============================================================
-- EXPECTED: 30+ rows for WH↔VH corridor

SELECT
  service_date,
  from_port,
  to_port,
  departure_time,
  status,
  status_message,
  schedule_source,
  observed_at
FROM ferry_forecast.sailing_events
WHERE operator_id IN ('ssa', 'steamship-authority')
  AND service_date = CURRENT_DATE
ORDER BY departure_time ASC;

-- ============================================================
-- 6. CORRIDOR SAILING COUNT BY ROUTE AND schedule_source
-- ============================================================

SELECT
  CASE
    WHEN from_port = 'woods-hole' AND to_port = 'vineyard-haven' THEN 'WH→VH'
    WHEN from_port = 'vineyard-haven' AND to_port = 'woods-hole' THEN 'VH→WH'
    WHEN from_port = 'hyannis' AND to_port = 'nantucket' THEN 'HY→NAN'
    WHEN from_port = 'nantucket' AND to_port = 'hyannis' THEN 'NAN→HY'
    ELSE from_port || '→' || to_port
  END AS route,
  schedule_source,
  COUNT(*) AS sailing_count,
  SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) AS canceled_count
FROM ferry_forecast.sailing_events
WHERE operator_id IN ('ssa', 'steamship-authority')
  AND service_date = CURRENT_DATE
GROUP BY route, schedule_source
ORDER BY route, schedule_source;

-- ============================================================
-- 7. ACCEPTANCE TEST: The required query from the prompt
-- ============================================================
-- This MUST work after migration is applied

SELECT
  schedule_source,
  COUNT(*) AS count
FROM ferry_forecast.sailing_events
WHERE operator_id = 'ssa'
  AND service_date = CURRENT_DATE
GROUP BY schedule_source;

-- Also test with alternate operator_id format
SELECT
  schedule_source,
  COUNT(*) AS count
FROM ferry_forecast.sailing_events
WHERE operator_id = 'steamship-authority'
  AND service_date = CURRENT_DATE
GROUP BY schedule_source;

-- ============================================================
-- 8. VERIFY VIEW AND FUNCTION WORK
-- ============================================================

-- Test view
SELECT * FROM ferry_forecast.v_today_operator_schedule LIMIT 5;

-- Test function
SELECT * FROM ferry_forecast.has_operator_schedule('ssa');
SELECT * FROM ferry_forecast.has_operator_schedule('steamship-authority');

-- ============================================================
-- CURL EXAMPLE: Verify corridor API output
-- ============================================================
-- Run this in terminal to verify:
--
-- curl -s "https://ferry-forecast.vercel.app/api/corridor/woods-hole-vineyard-haven" | jq '.provenance'
--
-- EXPECTED OUTPUT:
-- {
--   "schedule_source": "operator_snapshot",
--   "today_authority": "operator_only",
--   "debug": {
--     "operator_sailing_count": 38,
--     "template_sailing_count": 0,
--     "templates_included": false
--   }
-- }
