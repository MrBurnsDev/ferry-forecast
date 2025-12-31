-- Phase 27: Sailing Events Table
-- Persistent, append-only event log of observed sailing outcomes
-- Used for learning and validating risk models
--
-- This is NOT a cache. Each row represents an immutable historical fact:
-- "At time T, sailing S was observed to have status X under weather W."

-- ============================================
-- TABLE: ferry_forecast.sailing_events
-- ============================================

-- Ensure ferry_forecast schema exists
CREATE SCHEMA IF NOT EXISTS ferry_forecast;

CREATE TABLE IF NOT EXISTS ferry_forecast.sailing_events (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sailing identity
  operator_id TEXT NOT NULL,                    -- 'ssa', 'hy-line-cruises'
  corridor_id TEXT NOT NULL,                    -- 'woods-hole-vineyard-haven'
  from_port TEXT NOT NULL,                      -- 'woods-hole'
  to_port TEXT NOT NULL,                        -- 'vineyard-haven'

  -- Schedule context
  service_date DATE NOT NULL,                   -- 2025-12-30
  departure_time TEXT NOT NULL,                 -- '8:35 AM'

  -- Observed status (authoritative from operator)
  status TEXT NOT NULL CHECK (status IN ('on_time', 'delayed', 'canceled')),
  status_message TEXT,                          -- 'Cancelled due to Weather conditions'

  -- Weather snapshot at observation time
  wind_speed_mph NUMERIC,                       -- 25
  wind_direction_deg INTEGER,                   -- 315 (NW)
  wind_gusts_mph NUMERIC,                       -- 35

  -- Source metadata
  source TEXT NOT NULL,                         -- 'observer_extension', 'status_scraper'
  observed_at TIMESTAMPTZ NOT NULL,             -- When the observation was made

  -- Record metadata (immutable)
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- INDEXES
-- ============================================

-- For querying events by sailing identity
CREATE INDEX IF NOT EXISTS idx_sailing_events_identity ON ferry_forecast.sailing_events(corridor_id, from_port, to_port, service_date, departure_time);

-- For querying events by date range (learning queries)
CREATE INDEX IF NOT EXISTS idx_sailing_events_date ON ferry_forecast.sailing_events(service_date);

-- For querying by status (e.g., find all cancellations)
CREATE INDEX IF NOT EXISTS idx_sailing_events_status ON ferry_forecast.sailing_events(status);

-- For querying recent events
CREATE INDEX IF NOT EXISTS idx_sailing_events_observed_at ON ferry_forecast.sailing_events(observed_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ferry_forecast.sailing_events ENABLE ROW LEVEL SECURITY;

-- Service role can INSERT (via API during ingestion)
CREATE POLICY "Service insert sailing_events"
  ON ferry_forecast.sailing_events FOR INSERT
  WITH CHECK (true);

-- Public can SELECT (for analytics/dashboards)
CREATE POLICY "Public read sailing_events"
  ON ferry_forecast.sailing_events FOR SELECT
  USING (true);

-- NO UPDATE policy - events are immutable
-- NO DELETE policy - events are immutable (use admin console for cleanup if needed)

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE ferry_forecast.sailing_events IS 'Append-only log of observed sailing outcomes for learning';
COMMENT ON COLUMN ferry_forecast.sailing_events.id IS 'Unique event identifier';
COMMENT ON COLUMN ferry_forecast.sailing_events.operator_id IS 'Operator slug (e.g., ssa)';
COMMENT ON COLUMN ferry_forecast.sailing_events.corridor_id IS 'Corridor slug (e.g., woods-hole-vineyard-haven)';
COMMENT ON COLUMN ferry_forecast.sailing_events.from_port IS 'Origin port slug';
COMMENT ON COLUMN ferry_forecast.sailing_events.to_port IS 'Destination port slug';
COMMENT ON COLUMN ferry_forecast.sailing_events.service_date IS 'Date of sailing service (local)';
COMMENT ON COLUMN ferry_forecast.sailing_events.departure_time IS 'Scheduled departure time (local, e.g., 8:35 AM)';
COMMENT ON COLUMN ferry_forecast.sailing_events.status IS 'Observed status from operator';
COMMENT ON COLUMN ferry_forecast.sailing_events.status_message IS 'Operator-provided reason if any';
COMMENT ON COLUMN ferry_forecast.sailing_events.wind_speed_mph IS 'Wind speed at observation time';
COMMENT ON COLUMN ferry_forecast.sailing_events.wind_direction_deg IS 'Wind direction (0-359) at observation time';
COMMENT ON COLUMN ferry_forecast.sailing_events.wind_gusts_mph IS 'Wind gusts at observation time';
COMMENT ON COLUMN ferry_forecast.sailing_events.source IS 'How this observation was captured';
COMMENT ON COLUMN ferry_forecast.sailing_events.observed_at IS 'When the status was observed';
COMMENT ON COLUMN ferry_forecast.sailing_events.created_at IS 'When this record was created';
