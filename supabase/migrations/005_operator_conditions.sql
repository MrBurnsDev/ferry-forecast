-- Migration: 005_operator_conditions.sql
-- Phase 43: Operator Conditions - Store SSA terminal wind exactly as shown
--
-- PURPOSE:
-- Store wind conditions scraped directly from the SSA status page.
-- This is "Operator Conditions" - what SSA tells users - which may differ
-- from NOAA marine forecasts used for prediction modeling.
--
-- USER-FACING DATA: mph, direction text (e.g., "WSW 3 mph")
-- PREDICTION DATA: NOAA marine buoys (kept separate)

-- ============================================
-- CREATE OPERATOR CONDITIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ferry_forecast.operator_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  operator_id TEXT NOT NULL,  -- e.g., 'ssa'
  terminal_slug TEXT NOT NULL,  -- e.g., 'woods-hole', 'vineyard-haven'

  -- Observation timestamp
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Wind data as shown by operator (exact match to SSA display)
  wind_speed_mph NUMERIC(5,1),  -- e.g., 3.0 (nullable if not present)
  wind_direction_text TEXT,      -- e.g., 'WSW', 'NNE' (cardinal direction)
  wind_direction_degrees INTEGER CHECK (wind_direction_degrees >= 0 AND wind_direction_degrees < 360),

  -- Raw text exactly as scraped (for debugging/verification)
  raw_wind_text TEXT,  -- e.g., "WSW 3 mph" or "Wind: 3 mph WSW"

  -- Source tracking
  source_url TEXT NOT NULL,  -- e.g., 'https://www.steamshipauthority.com/traveling_today/status'

  -- Optional notes
  notes TEXT,  -- e.g., "Single wind value applied to both WH and VH"

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Primary lookup: recent conditions for a terminal
CREATE INDEX idx_operator_conditions_terminal_time
  ON ferry_forecast.operator_conditions(terminal_slug, observed_at DESC);

-- Operator + terminal + time for uniqueness checks
CREATE INDEX idx_operator_conditions_operator_terminal_time
  ON ferry_forecast.operator_conditions(operator_id, terminal_slug, observed_at DESC);

-- Cleanup: find old entries
CREATE INDEX idx_operator_conditions_observed_at
  ON ferry_forecast.operator_conditions(observed_at);

-- ============================================
-- DEDUPLICATION CONSTRAINT
-- ============================================
-- Unique on (operator_id, terminal_slug, minute-truncated time, raw_wind_text)
-- This prevents spam if the same wind value is sent multiple times in same minute

CREATE UNIQUE INDEX idx_operator_conditions_dedupe
  ON ferry_forecast.operator_conditions(
    operator_id,
    terminal_slug,
    date_trunc('minute', observed_at),
    COALESCE(raw_wind_text, '')
  );

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ferry_forecast.operator_conditions ENABLE ROW LEVEL SECURITY;

-- Public read access (users can see operator conditions)
CREATE POLICY "Public read operator_conditions"
  ON ferry_forecast.operator_conditions
  FOR SELECT
  USING (true);

-- Service role write access (only server can insert)
CREATE POLICY "Service write operator_conditions"
  ON ferry_forecast.operator_conditions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service update operator_conditions"
  ON ferry_forecast.operator_conditions
  FOR UPDATE
  USING (true);

CREATE POLICY "Service delete operator_conditions"
  ON ferry_forecast.operator_conditions
  FOR DELETE
  USING (true);

-- ============================================
-- GRANT ACCESS
-- ============================================

GRANT SELECT ON ferry_forecast.operator_conditions TO anon, authenticated;

-- ============================================
-- HELPER FUNCTION: Get latest conditions for terminal
-- ============================================

CREATE OR REPLACE FUNCTION ferry_forecast.get_latest_operator_conditions(
  p_operator_id TEXT,
  p_terminal_slug TEXT,
  p_max_age_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  wind_speed_mph NUMERIC(5,1),
  wind_direction_text TEXT,
  wind_direction_degrees INTEGER,
  raw_wind_text TEXT,
  observed_at TIMESTAMPTZ,
  source_url TEXT,
  age_minutes DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oc.wind_speed_mph,
    oc.wind_direction_text,
    oc.wind_direction_degrees,
    oc.raw_wind_text,
    oc.observed_at,
    oc.source_url,
    EXTRACT(EPOCH FROM (NOW() - oc.observed_at)) / 60 as age_minutes
  FROM ferry_forecast.operator_conditions oc
  WHERE oc.operator_id = p_operator_id
    AND oc.terminal_slug = p_terminal_slug
    AND oc.observed_at > NOW() - (p_max_age_minutes || ' minutes')::INTERVAL
  ORDER BY oc.observed_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CLEANUP FUNCTION: Remove old conditions
-- ============================================

CREATE OR REPLACE FUNCTION ferry_forecast.cleanup_old_operator_conditions(
  p_keep_days INTEGER DEFAULT 7
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ferry_forecast.operator_conditions
  WHERE observed_at < NOW() - (p_keep_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENT DOCUMENTATION
-- ============================================

COMMENT ON TABLE ferry_forecast.operator_conditions IS
  'Wind conditions as displayed by ferry operators (SSA). This is the user-facing truth for terminal conditions, distinct from NOAA marine data used for prediction modeling.';

COMMENT ON COLUMN ferry_forecast.operator_conditions.wind_speed_mph IS
  'Wind speed in mph as shown on SSA status page. User-facing value.';

COMMENT ON COLUMN ferry_forecast.operator_conditions.wind_direction_text IS
  'Cardinal direction text (e.g., WSW, NNE) as shown by operator.';

COMMENT ON COLUMN ferry_forecast.operator_conditions.raw_wind_text IS
  'Exact text scraped from operator page for debugging and verification.';
