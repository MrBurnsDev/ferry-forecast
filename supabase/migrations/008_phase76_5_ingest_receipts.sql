-- Phase 76.5: Ingest Receipts and Observer Health
--
-- NON-NEGOTIABLE: We cannot claim "external gap" without persistent, queryable proof.
-- This migration creates tables to track:
-- 1. Every ingest call (success or failure) with row counts
-- 2. Observer heartbeats to know if data is being ingested
--
-- RULE: No more guessing. Only receipts.

-- ============================================
-- TABLE: ferry_forecast.ingest_runs
-- ============================================
-- Written on EVERY ingest call, including failures.
-- This is the RECEIPT that proves ingestion happened.

CREATE TABLE IF NOT EXISTS ferry_forecast.ingest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request identity
  request_id TEXT UNIQUE NOT NULL,           -- UUID from observer, must be unique
  operator_id TEXT NOT NULL,                 -- 'steamship-authority', 'hy-line-cruises'
  service_date DATE NOT NULL,                -- Service date being ingested
  observed_at TIMESTAMPTZ NOT NULL,          -- When observer scraped the data

  -- Payload stats (what was sent)
  payload_sailings_count INT NOT NULL DEFAULT 0,
  payload_cancellations_count INT NOT NULL DEFAULT 0,

  -- DB operation results (what happened)
  db_rows_inserted INT NOT NULL DEFAULT 0,
  db_rows_updated INT NOT NULL DEFAULT 0,
  db_rows_unchanged INT NOT NULL DEFAULT 0,
  db_rows_failed INT NOT NULL DEFAULT 0,

  -- Final status
  status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  error TEXT NULL,                           -- Error message if failed

  -- Metadata
  trigger_type TEXT NOT NULL DEFAULT 'unknown' CHECK (trigger_type IN ('auto', 'manual', 'unknown')),
  source_url TEXT NULL,                      -- Where data was scraped from

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for querying ingest history
CREATE INDEX IF NOT EXISTS idx_ingest_runs_operator_date
  ON ferry_forecast.ingest_runs(operator_id, service_date);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_created
  ON ferry_forecast.ingest_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_status
  ON ferry_forecast.ingest_runs(status);

-- RLS: Service role can INSERT/UPDATE, public can SELECT
ALTER TABLE ferry_forecast.ingest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service insert ingest_runs"
  ON ferry_forecast.ingest_runs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service update ingest_runs"
  ON ferry_forecast.ingest_runs FOR UPDATE
  USING (true);

CREATE POLICY "Public read ingest_runs"
  ON ferry_forecast.ingest_runs FOR SELECT
  USING (true);

COMMENT ON TABLE ferry_forecast.ingest_runs IS 'Phase 76.5: Persistent receipt of every ingest API call';
COMMENT ON COLUMN ferry_forecast.ingest_runs.request_id IS 'Unique request ID from observer (UUID)';
COMMENT ON COLUMN ferry_forecast.ingest_runs.status IS 'ok=all succeeded, partial=some failed, failed=all failed';

-- ============================================
-- TABLE: ferry_forecast.observer_heartbeats
-- ============================================
-- Updated on EVERY ingest call (success or failure).
-- Shows when each operator observer last reported.

CREATE TABLE IF NOT EXISTS ferry_forecast.observer_heartbeats (
  operator_id TEXT PRIMARY KEY,              -- 'steamship-authority', 'hy-line-cruises'
  last_seen_at TIMESTAMPTZ NOT NULL,         -- When last ingest was received
  last_request_id TEXT,                      -- Last request_id received
  last_success BOOLEAN NOT NULL,             -- Was the last ingest successful?
  last_error TEXT NULL,                      -- Error message if last failed
  last_service_date DATE,                    -- Last service_date ingested
  last_sailings_count INT,                   -- Sailings in last ingest
  last_cancellations_count INT,              -- Cancellations in last ingest
  consecutive_failures INT NOT NULL DEFAULT 0, -- Track failure streaks

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS: Service role can INSERT/UPDATE, public can SELECT
ALTER TABLE ferry_forecast.observer_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service upsert observer_heartbeats"
  ON ferry_forecast.observer_heartbeats FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public read observer_heartbeats"
  ON ferry_forecast.observer_heartbeats FOR SELECT
  USING (true);

COMMENT ON TABLE ferry_forecast.observer_heartbeats IS 'Phase 76.5: Observer health tracking per operator';
COMMENT ON COLUMN ferry_forecast.observer_heartbeats.consecutive_failures IS 'Number of consecutive failed ingests';

-- ============================================
-- Add sailing_origin column to sailing_events
-- ============================================
-- Phase 74 added sailing_origin for removed sailing detection,
-- but we need to ensure it's persisted to the DB (not just UI-only)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ferry_forecast'
    AND table_name = 'sailing_events'
    AND column_name = 'sailing_origin'
  ) THEN
    ALTER TABLE ferry_forecast.sailing_events
    ADD COLUMN sailing_origin TEXT NULL
    CHECK (sailing_origin IS NULL OR sailing_origin IN ('operator_removed'));

    COMMENT ON COLUMN ferry_forecast.sailing_events.sailing_origin
    IS 'Phase 74: operator_removed = sailing disappeared from active list (inferred cancellation)';
  END IF;
END $$;

-- ============================================
-- VERIFICATION VIEWS
-- ============================================

-- View: Recent ingest runs with status
CREATE OR REPLACE VIEW ferry_forecast.v_recent_ingests AS
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
  created_at,
  now() - created_at AS age
FROM ferry_forecast.ingest_runs
ORDER BY created_at DESC
LIMIT 50;

-- View: Observer health summary
CREATE OR REPLACE VIEW ferry_forecast.v_observer_health AS
SELECT
  operator_id,
  last_seen_at,
  now() - last_seen_at AS time_since_last_seen,
  last_success,
  last_error,
  last_service_date,
  last_sailings_count,
  last_cancellations_count,
  consecutive_failures,
  CASE
    WHEN now() - last_seen_at > interval '30 minutes' THEN 'stale'
    WHEN last_success = false THEN 'error'
    ELSE 'healthy'
  END AS health_status
FROM ferry_forecast.observer_heartbeats;

-- View: Today's sailing events summary
CREATE OR REPLACE VIEW ferry_forecast.v_today_sailing_events AS
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

COMMENT ON VIEW ferry_forecast.v_recent_ingests IS 'Phase 76.5: Recent ingest runs for debugging';
COMMENT ON VIEW ferry_forecast.v_observer_health IS 'Phase 76.5: Observer health status per operator';
COMMENT ON VIEW ferry_forecast.v_today_sailing_events IS 'Phase 76.5: Today sailing events grouped by status';
