-- Migration: 006_cancellation_operator_conditions.sql
-- Phase 49: Cancellation Operator Conditions
--
-- PURPOSE:
-- Store an immutable snapshot of operator-observed terminal conditions
-- at the EXACT MOMENT a sailing first transitions to canceled status.
--
-- IMMUTABILITY RULES:
-- 1. One sailing_event_id → exactly one row (unique constraint)
-- 2. NEVER update a row once inserted
-- 3. NEVER delete rows (historical record for ML training)
-- 4. If operator wind is not available at cancellation time, store NULLs
--
-- This is SEPARATE from:
-- - operator_conditions: Continuously updated terminal conditions
-- - cancellation_weather_snapshots: NOAA/NWS observations (Phase 50)

-- ============================================
-- CREATE CANCELLATION OPERATOR CONDITIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ferry_forecast.cancellation_operator_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to the canceled sailing (IMMUTABLE - one snapshot per sailing)
  sailing_event_id UUID NOT NULL UNIQUE REFERENCES ferry_forecast.sailing_events(id) ON DELETE CASCADE,

  -- Identity
  operator_id TEXT NOT NULL,           -- e.g., 'ssa'
  terminal_slug TEXT NOT NULL,         -- Departure terminal, e.g., 'woods-hole'

  -- Wind data as shown by operator at cancellation moment
  wind_speed NUMERIC(5,1),             -- mph as shown on SSA page (NULL if not available)
  wind_direction_text TEXT,            -- e.g., 'WSW', 'NNE' (cardinal direction)
  wind_direction_degrees INTEGER CHECK (wind_direction_degrees >= 0 AND wind_direction_degrees < 360),

  -- Raw text exactly as scraped (for debugging/verification)
  raw_text TEXT,                       -- e.g., "WSW 35 mph" or "Wind: 35 mph NW"

  -- Source tracking
  source_url TEXT NOT NULL,            -- e.g., 'https://www.steamshipauthority.com/traveling_today/status'

  -- Timing
  captured_at TIMESTAMPTZ NOT NULL,    -- When the cancellation was observed

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Fast lookup by sailing event (primary use case)
CREATE INDEX IF NOT EXISTS idx_cancellation_cond_sailing
  ON ferry_forecast.cancellation_operator_conditions(sailing_event_id);

-- Query by operator for analysis
CREATE INDEX IF NOT EXISTS idx_cancellation_cond_operator
  ON ferry_forecast.cancellation_operator_conditions(operator_id, created_at DESC);

-- Query by terminal for wind threshold analysis
CREATE INDEX IF NOT EXISTS idx_cancellation_cond_terminal
  ON ferry_forecast.cancellation_operator_conditions(terminal_slug, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ferry_forecast.cancellation_operator_conditions ENABLE ROW LEVEL SECURITY;

-- Public read access (for transparency and debugging)
CREATE POLICY "Public read cancellation_operator_conditions"
  ON ferry_forecast.cancellation_operator_conditions
  FOR SELECT
  USING (true);

-- Service role write access (only server can insert)
CREATE POLICY "Service write cancellation_operator_conditions"
  ON ferry_forecast.cancellation_operator_conditions
  FOR INSERT
  WITH CHECK (true);

-- No UPDATE or DELETE policies (immutability)
-- Rows should never be modified after insertion

-- ============================================
-- GRANT ACCESS
-- ============================================

GRANT SELECT ON ferry_forecast.cancellation_operator_conditions TO anon, authenticated;

-- ============================================
-- COMMENT DOCUMENTATION
-- ============================================

COMMENT ON TABLE ferry_forecast.cancellation_operator_conditions IS
  'Phase 49: Immutable snapshot of operator-displayed wind conditions at the moment of first cancellation. One row per sailing_event_id. Used for ML training to learn actual cancellation thresholds.';

COMMENT ON COLUMN ferry_forecast.cancellation_operator_conditions.sailing_event_id IS
  'Link to the sailing_events row. UNIQUE constraint enforces one snapshot per sailing.';

COMMENT ON COLUMN ferry_forecast.cancellation_operator_conditions.wind_speed IS
  'Wind speed in mph as shown on operator status page at cancellation time. NULL if not available.';

COMMENT ON COLUMN ferry_forecast.cancellation_operator_conditions.wind_direction_text IS
  'Cardinal direction text (e.g., WSW, NNE) as shown by operator. NULL if not available.';

COMMENT ON COLUMN ferry_forecast.cancellation_operator_conditions.captured_at IS
  'Timestamp when the cancellation was first observed by our scraper.';

COMMENT ON COLUMN ferry_forecast.cancellation_operator_conditions.raw_text IS
  'Exact text scraped from operator page for debugging and verification.';
