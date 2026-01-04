-- ============================================================
-- Phase 50: Cancellation Weather Enrichment Verification Queries
-- ============================================================
--
-- These queries MUST return rows after the next real cancellation.
-- Run them to verify the system is working correctly.
--
-- Schema: ferry_forecast (isolated)
-- ============================================================

-- ============================================================
-- QUERY 1: Verify cancellation_operator_conditions has rows
-- ============================================================
-- This should return 1+ rows after a cancellation is ingested
-- with operator wind conditions in the payload

SELECT
  coc.id,
  coc.sailing_event_id,
  coc.operator_id,
  coc.terminal_slug,
  coc.wind_speed,
  coc.wind_direction_text,
  coc.wind_direction_degrees,
  coc.raw_text,
  coc.captured_at,
  coc.created_at
FROM ferry_forecast.cancellation_operator_conditions coc
ORDER BY coc.created_at DESC
LIMIT 10;


-- ============================================================
-- QUERY 2: Verify cancellation_weather_snapshots has rows
-- ============================================================
-- This should return 1+ rows after a cancellation is ingested
-- (NWS station data is fetched automatically)

SELECT
  cws.id,
  cws.sailing_event_id,
  cws.source,
  cws.location_id AS station_id,
  cws.location_name AS station_name,
  cws.wind_speed_mph,
  cws.wind_direction_deg,
  cws.wind_gusts_mph,
  cws.air_temp_f,
  cws.observation_time,
  cws.captured_at,
  cws.fetch_latency_ms
FROM ferry_forecast.cancellation_weather_snapshots cws
ORDER BY cws.created_at DESC
LIMIT 10;


-- ============================================================
-- QUERY 3: Full cancellation record with all enrichment
-- ============================================================
-- JOIN sailing_events + operator conditions + NOAA snapshot
-- This shows the complete picture for each cancellation

SELECT
  -- Sailing event info
  se.id AS sailing_event_id,
  se.service_date,
  se.departure_time,
  se.from_port,
  se.to_port,
  se.status,
  se.status_message,
  se.observed_at,

  -- Operator wind conditions (Phase 49)
  coc.wind_speed AS operator_wind_mph,
  coc.wind_direction_text AS operator_wind_dir,
  coc.wind_direction_degrees AS operator_wind_deg,
  coc.raw_text AS operator_raw_text,
  coc.captured_at AS operator_captured_at,

  -- NOAA weather snapshot (Phase 50)
  cws.location_id AS nws_station,
  cws.wind_speed_mph AS nws_wind_mph,
  cws.wind_direction_deg AS nws_wind_deg,
  cws.wind_gusts_mph AS nws_gust_mph,
  cws.air_temp_f AS nws_temp_f,
  cws.observation_time AS nws_obs_time,
  cws.fetch_latency_ms AS nws_fetch_ms

FROM ferry_forecast.sailing_events se
LEFT JOIN ferry_forecast.cancellation_operator_conditions coc
  ON coc.sailing_event_id = se.id
LEFT JOIN ferry_forecast.cancellation_weather_snapshots cws
  ON cws.sailing_event_id = se.id
WHERE se.status = 'canceled'
ORDER BY se.created_at DESC
LIMIT 20;


-- ============================================================
-- QUERY 4: Count all enrichment records
-- ============================================================
-- Quick health check - should show matching counts

SELECT
  'sailing_events (canceled)' AS table_name,
  COUNT(*) AS row_count
FROM ferry_forecast.sailing_events
WHERE status = 'canceled'

UNION ALL

SELECT
  'cancellation_operator_conditions' AS table_name,
  COUNT(*) AS row_count
FROM ferry_forecast.cancellation_operator_conditions

UNION ALL

SELECT
  'cancellation_weather_snapshots' AS table_name,
  COUNT(*) AS row_count
FROM ferry_forecast.cancellation_weather_snapshots;


-- ============================================================
-- QUERY 5: Find cancellations MISSING enrichment data
-- ============================================================
-- These are problems - every cancellation should have at least
-- an attempted NOAA snapshot (may have NULL values if fetch failed)

SELECT
  se.id AS sailing_event_id,
  se.service_date,
  se.departure_time,
  se.from_port,
  se.to_port,
  se.created_at,
  CASE WHEN coc.id IS NOT NULL THEN 'YES' ELSE 'NO' END AS has_operator_conditions,
  CASE WHEN cws.id IS NOT NULL THEN 'YES' ELSE 'NO' END AS has_noaa_snapshot
FROM ferry_forecast.sailing_events se
LEFT JOIN ferry_forecast.cancellation_operator_conditions coc
  ON coc.sailing_event_id = se.id
LEFT JOIN ferry_forecast.cancellation_weather_snapshots cws
  ON cws.sailing_event_id = se.id
WHERE se.status = 'canceled'
  AND (coc.id IS NULL OR cws.id IS NULL)
ORDER BY se.created_at DESC;


-- ============================================================
-- QUERY 6: Immutability check - verify no duplicates
-- ============================================================
-- Each sailing_event_id should appear exactly once in each table

SELECT
  sailing_event_id,
  COUNT(*) AS duplicate_count
FROM ferry_forecast.cancellation_operator_conditions
GROUP BY sailing_event_id
HAVING COUNT(*) > 1;

SELECT
  sailing_event_id,
  source,
  location_id,
  COUNT(*) AS duplicate_count
FROM ferry_forecast.cancellation_weather_snapshots
GROUP BY sailing_event_id, source, location_id
HAVING COUNT(*) > 1;
