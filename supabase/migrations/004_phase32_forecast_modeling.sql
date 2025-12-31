-- ============================================================================
-- PHASE 32: FORECAST MODELING SCHEMA
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER 003_prediction_snapshots.sql
--
-- PURPOSE:
-- Store multi-day weather forecasts from Open-Meteo API and enable forward-looking
-- predictions with versioned logic. This enables:
-- - 7-day GFS forecasts (higher resolution)
-- - 14-day ECMWF forecasts (ensemble model)
-- - Backtesting and accuracy analysis
--
-- DESIGN PRINCIPLES:
-- - Append-only tables for immutable historical record
-- - Versioned prediction logic for A/B testing
-- - Corridor-level forecasts (not per-sailing to reduce redundancy)
-- - Clear separation: weather snapshots vs predictions vs outcomes
--
-- DATA MODEL:
-- 1. forecast_weather_snapshots: Raw Open-Meteo data, keyed by corridor + forecast_hour
-- 2. prediction_snapshots_v2: Predictions made using versioned logic
-- 3. prediction_outcomes: Links predictions to actual sailing events for learning

SET search_path TO ferry_forecast, public;

-- ============================================
-- TABLE: forecast_weather_snapshots
-- ============================================
-- Stores hourly weather forecast data from Open-Meteo
-- Each row is one forecast hour for one corridor
-- We store at corridor level because weather is similar across a corridor
-- (e.g., Woods Hole ↔ Vineyard Haven weather is roughly the same)

CREATE TABLE IF NOT EXISTS ferry_forecast.forecast_weather_snapshots (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Corridor and timing
  corridor_id TEXT NOT NULL,                      -- 'woods-hole-vineyard-haven'
  forecast_time TIMESTAMPTZ NOT NULL,             -- The time this forecast is FOR
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When we fetched this data

  -- Data source
  model TEXT NOT NULL,                            -- 'gfs' or 'ecmwf'
  model_run_time TIMESTAMPTZ,                     -- When the model was run (if known)

  -- Wind data (primary risk factors)
  wind_speed_10m_mph NUMERIC(5,1),               -- Wind speed at 10m in mph
  wind_gusts_mph NUMERIC(5,1),                   -- Wind gusts in mph
  wind_direction_deg INTEGER,                     -- Direction (0-359, where wind is FROM)

  -- Wave data (secondary risk factors)
  wave_height_ft NUMERIC(4,1),                   -- Significant wave height in feet
  wave_period_sec NUMERIC(4,1),                  -- Wave period in seconds
  wave_direction_deg INTEGER,                     -- Wave direction (0-359)

  -- Visibility/precipitation
  visibility_miles NUMERIC(5,1),                 -- Visibility in miles
  precipitation_mm NUMERIC(5,1),                 -- Precipitation amount in mm
  precipitation_probability INTEGER,              -- 0-100 probability

  -- Temperature (contextual)
  temperature_f NUMERIC(5,1),                    -- Temperature in Fahrenheit

  -- Marine advisories (derived or from external source)
  advisory_level TEXT,                           -- 'none', 'small_craft_advisory', 'gale_warning', etc.

  -- Record metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Composite unique constraint: one forecast per corridor+time+model per fetch
  CONSTRAINT uq_forecast_corridor_time_model_fetch
    UNIQUE (corridor_id, forecast_time, model, fetched_at)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_forecast_weather_corridor
  ON ferry_forecast.forecast_weather_snapshots(corridor_id);
CREATE INDEX IF NOT EXISTS idx_forecast_weather_time
  ON ferry_forecast.forecast_weather_snapshots(forecast_time);
CREATE INDEX IF NOT EXISTS idx_forecast_weather_fetched
  ON ferry_forecast.forecast_weather_snapshots(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_weather_corridor_time
  ON ferry_forecast.forecast_weather_snapshots(corridor_id, forecast_time);
-- Index for finding latest forecast for a corridor+time
CREATE INDEX IF NOT EXISTS idx_forecast_weather_latest
  ON ferry_forecast.forecast_weather_snapshots(corridor_id, forecast_time, fetched_at DESC);

-- ============================================
-- TABLE: prediction_snapshots_v2
-- ============================================
-- Versioned predictions using forecast data
-- Separated from v1 to allow parallel operation during transition

CREATE TABLE IF NOT EXISTS ferry_forecast.prediction_snapshots_v2 (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What we're predicting about
  corridor_id TEXT NOT NULL,
  route_id TEXT NOT NULL,                         -- Specific route (for direction awareness)
  sailing_time TIMESTAMPTZ NOT NULL,              -- The sailing we're predicting
  service_date DATE NOT NULL,                     -- Service date (local)
  departure_time_local TEXT NOT NULL,             -- e.g., '8:35 AM'

  -- When prediction was made
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prediction result (v2 uses more granular scale)
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'moderate', 'elevated', 'high', 'severe')),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),

  -- Human-readable explanation
  explanation TEXT[],                             -- Array of reason strings
  primary_factor TEXT,                            -- Main risk driver

  -- Input data used
  forecast_snapshot_id UUID REFERENCES ferry_forecast.forecast_weather_snapshots(id),
  wind_speed_used NUMERIC(5,1),
  wind_gusts_used NUMERIC(5,1),
  wind_direction_used INTEGER,
  wind_relation TEXT,                             -- 'headwind', 'crosswind', 'tailwind'
  wave_height_used NUMERIC(4,1),
  advisory_level_used TEXT,

  -- Model versioning (for A/B testing and evolution)
  model_version TEXT NOT NULL,                    -- 'v2.0.0', 'v2.1.0', etc.
  model_config JSONB,                             -- Any config overrides used

  -- Forecast horizon
  hours_ahead INTEGER,                            -- How far in advance this prediction is

  -- Record metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Prevent duplicate predictions for same sailing at same time
  CONSTRAINT uq_prediction_v2_sailing
    UNIQUE (route_id, sailing_time, predicted_at)
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_pred_v2_corridor
  ON ferry_forecast.prediction_snapshots_v2(corridor_id);
CREATE INDEX IF NOT EXISTS idx_pred_v2_route
  ON ferry_forecast.prediction_snapshots_v2(route_id);
CREATE INDEX IF NOT EXISTS idx_pred_v2_sailing_time
  ON ferry_forecast.prediction_snapshots_v2(sailing_time);
CREATE INDEX IF NOT EXISTS idx_pred_v2_predicted_at
  ON ferry_forecast.prediction_snapshots_v2(predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_pred_v2_service_date
  ON ferry_forecast.prediction_snapshots_v2(service_date);
-- For finding latest prediction for a sailing
CREATE INDEX IF NOT EXISTS idx_pred_v2_latest
  ON ferry_forecast.prediction_snapshots_v2(route_id, sailing_time, predicted_at DESC);
-- For backtesting by model version
CREATE INDEX IF NOT EXISTS idx_pred_v2_model_version
  ON ferry_forecast.prediction_snapshots_v2(model_version);

-- ============================================
-- TABLE: prediction_outcomes
-- ============================================
-- Links predictions to actual outcomes for learning
-- This is the key table for backtesting and model improvement

CREATE TABLE IF NOT EXISTS ferry_forecast.prediction_outcomes (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The prediction being evaluated
  prediction_id UUID NOT NULL REFERENCES ferry_forecast.prediction_snapshots_v2(id),

  -- The actual outcome (from sailing_events)
  sailing_event_id UUID REFERENCES ferry_forecast.sailing_events(id),

  -- Denormalized outcome data (for fast queries)
  actual_status TEXT NOT NULL CHECK (actual_status IN ('on_time', 'delayed', 'canceled')),
  actual_status_message TEXT,

  -- Prediction accuracy metrics
  was_correct BOOLEAN NOT NULL,                   -- Did risk level match outcome?
  score_error INTEGER,                            -- predicted_score - expected_score

  -- Expected scores by outcome (for calibration)
  -- on_time = 15, delayed = 45, canceled = 80
  expected_score INTEGER,

  -- Match timing
  hours_before_sailing NUMERIC(5,1),              -- How far ahead was the prediction?
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Record metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- One outcome per prediction
  CONSTRAINT uq_prediction_outcome
    UNIQUE (prediction_id)
);

-- Indexes for learning queries
CREATE INDEX IF NOT EXISTS idx_pred_outcome_prediction
  ON ferry_forecast.prediction_outcomes(prediction_id);
CREATE INDEX IF NOT EXISTS idx_pred_outcome_sailing_event
  ON ferry_forecast.prediction_outcomes(sailing_event_id);
CREATE INDEX IF NOT EXISTS idx_pred_outcome_was_correct
  ON ferry_forecast.prediction_outcomes(was_correct);
CREATE INDEX IF NOT EXISTS idx_pred_outcome_status
  ON ferry_forecast.prediction_outcomes(actual_status);
CREATE INDEX IF NOT EXISTS idx_pred_outcome_matched_at
  ON ferry_forecast.prediction_outcomes(matched_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ferry_forecast.forecast_weather_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.prediction_snapshots_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.prediction_outcomes ENABLE ROW LEVEL SECURITY;

-- Service role can INSERT (via API during ingestion)
CREATE POLICY "Service insert forecast_weather_snapshots"
  ON ferry_forecast.forecast_weather_snapshots FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service insert prediction_snapshots_v2"
  ON ferry_forecast.prediction_snapshots_v2 FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service insert prediction_outcomes"
  ON ferry_forecast.prediction_outcomes FOR INSERT
  WITH CHECK (true);

-- Allow UPDATE on prediction_outcomes for linking
CREATE POLICY "Service update prediction_outcomes"
  ON ferry_forecast.prediction_outcomes FOR UPDATE
  USING (true);

-- Public can SELECT (for analytics/dashboards)
CREATE POLICY "Public read forecast_weather_snapshots"
  ON ferry_forecast.forecast_weather_snapshots FOR SELECT
  USING (true);

CREATE POLICY "Public read prediction_snapshots_v2"
  ON ferry_forecast.prediction_snapshots_v2 FOR SELECT
  USING (true);

CREATE POLICY "Public read prediction_outcomes"
  ON ferry_forecast.prediction_outcomes FOR SELECT
  USING (true);

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON ferry_forecast.forecast_weather_snapshots TO anon, authenticated;
GRANT SELECT ON ferry_forecast.prediction_snapshots_v2 TO anon, authenticated;
GRANT SELECT ON ferry_forecast.prediction_outcomes TO anon, authenticated;

-- ============================================
-- VIEWS FOR ANALYSIS
-- ============================================

-- View: Latest forecast for each corridor+time
CREATE OR REPLACE VIEW ferry_forecast.latest_forecasts AS
SELECT DISTINCT ON (corridor_id, forecast_time)
  id,
  corridor_id,
  forecast_time,
  fetched_at,
  model,
  wind_speed_10m_mph,
  wind_gusts_mph,
  wind_direction_deg,
  wave_height_ft,
  visibility_miles,
  advisory_level
FROM ferry_forecast.forecast_weather_snapshots
ORDER BY corridor_id, forecast_time, fetched_at DESC;

GRANT SELECT ON ferry_forecast.latest_forecasts TO anon, authenticated;

-- View: Model accuracy by version
CREATE OR REPLACE VIEW ferry_forecast.model_accuracy AS
SELECT
  ps.model_version,
  ps.corridor_id,
  COUNT(*) as total_predictions,
  COUNT(po.id) as predictions_with_outcomes,
  SUM(CASE WHEN po.was_correct THEN 1 ELSE 0 END) as correct_count,
  ROUND(100.0 * SUM(CASE WHEN po.was_correct THEN 1 ELSE 0 END) / NULLIF(COUNT(po.id), 0), 1) as accuracy_pct,
  AVG(ABS(po.score_error)) as avg_score_error,
  -- Breakdown by actual outcome
  SUM(CASE WHEN po.actual_status = 'on_time' THEN 1 ELSE 0 END) as on_time_count,
  SUM(CASE WHEN po.actual_status = 'delayed' THEN 1 ELSE 0 END) as delayed_count,
  SUM(CASE WHEN po.actual_status = 'canceled' THEN 1 ELSE 0 END) as canceled_count
FROM ferry_forecast.prediction_snapshots_v2 ps
LEFT JOIN ferry_forecast.prediction_outcomes po ON ps.id = po.prediction_id
GROUP BY ps.model_version, ps.corridor_id;

GRANT SELECT ON ferry_forecast.model_accuracy TO anon, authenticated;

-- View: Recent predictions with outcomes (for debugging/dashboards)
CREATE OR REPLACE VIEW ferry_forecast.recent_prediction_outcomes AS
SELECT
  ps.id as prediction_id,
  ps.corridor_id,
  ps.route_id,
  ps.sailing_time,
  ps.departure_time_local,
  ps.predicted_at,
  ps.risk_score,
  ps.risk_level,
  ps.confidence,
  ps.primary_factor,
  ps.model_version,
  ps.hours_ahead,
  po.actual_status,
  po.was_correct,
  po.score_error,
  po.hours_before_sailing
FROM ferry_forecast.prediction_snapshots_v2 ps
LEFT JOIN ferry_forecast.prediction_outcomes po ON ps.id = po.prediction_id
ORDER BY ps.predicted_at DESC
LIMIT 1000;

GRANT SELECT ON ferry_forecast.recent_prediction_outcomes TO anon, authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE ferry_forecast.forecast_weather_snapshots IS 'Hourly weather forecasts from Open-Meteo (GFS/ECMWF)';
COMMENT ON COLUMN ferry_forecast.forecast_weather_snapshots.corridor_id IS 'Corridor this forecast applies to';
COMMENT ON COLUMN ferry_forecast.forecast_weather_snapshots.forecast_time IS 'The time this weather forecast is FOR';
COMMENT ON COLUMN ferry_forecast.forecast_weather_snapshots.model IS 'Weather model source (gfs, ecmwf)';
COMMENT ON COLUMN ferry_forecast.forecast_weather_snapshots.wind_speed_10m_mph IS 'Sustained wind speed at 10m height';
COMMENT ON COLUMN ferry_forecast.forecast_weather_snapshots.wind_gusts_mph IS 'Maximum gust speed';
COMMENT ON COLUMN ferry_forecast.forecast_weather_snapshots.wave_height_ft IS 'Significant wave height';

COMMENT ON TABLE ferry_forecast.prediction_snapshots_v2 IS 'Versioned predictions using forecast data';
COMMENT ON COLUMN ferry_forecast.prediction_snapshots_v2.model_version IS 'Prediction model version for A/B testing';
COMMENT ON COLUMN ferry_forecast.prediction_snapshots_v2.hours_ahead IS 'Hours between prediction and sailing';
COMMENT ON COLUMN ferry_forecast.prediction_snapshots_v2.wind_relation IS 'Wind direction relative to route (headwind/crosswind/tailwind)';

COMMENT ON TABLE ferry_forecast.prediction_outcomes IS 'Links predictions to actual outcomes for learning';
COMMENT ON COLUMN ferry_forecast.prediction_outcomes.was_correct IS 'Whether the risk level correctly predicted the outcome';
COMMENT ON COLUMN ferry_forecast.prediction_outcomes.score_error IS 'Difference between predicted and expected score';

-- ============================================
-- FUNCTION: Match predictions to outcomes
-- ============================================
-- This function can be called to link predictions with sailing events

CREATE OR REPLACE FUNCTION ferry_forecast.link_prediction_to_outcome(
  p_prediction_id UUID,
  p_sailing_event_id UUID
) RETURNS VOID AS $$
DECLARE
  v_prediction RECORD;
  v_sailing_event RECORD;
  v_expected_score INTEGER;
  v_was_correct BOOLEAN;
BEGIN
  -- Get prediction
  SELECT * INTO v_prediction
  FROM ferry_forecast.prediction_snapshots_v2
  WHERE id = p_prediction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prediction not found: %', p_prediction_id;
  END IF;

  -- Get sailing event
  SELECT * INTO v_sailing_event
  FROM ferry_forecast.sailing_events
  WHERE id = p_sailing_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sailing event not found: %', p_sailing_event_id;
  END IF;

  -- Calculate expected score based on outcome
  v_expected_score := CASE v_sailing_event.status
    WHEN 'on_time' THEN 15
    WHEN 'delayed' THEN 45
    WHEN 'canceled' THEN 80
    ELSE 50
  END;

  -- Determine if prediction was correct
  v_was_correct := CASE
    WHEN v_prediction.risk_level IN ('low') AND v_sailing_event.status = 'on_time' THEN TRUE
    WHEN v_prediction.risk_level IN ('moderate', 'elevated') AND v_sailing_event.status IN ('on_time', 'delayed') THEN TRUE
    WHEN v_prediction.risk_level IN ('high', 'severe') AND v_sailing_event.status IN ('delayed', 'canceled') THEN TRUE
    ELSE FALSE
  END;

  -- Insert or update outcome record
  INSERT INTO ferry_forecast.prediction_outcomes (
    prediction_id,
    sailing_event_id,
    actual_status,
    actual_status_message,
    was_correct,
    score_error,
    expected_score,
    hours_before_sailing,
    matched_at
  ) VALUES (
    p_prediction_id,
    p_sailing_event_id,
    v_sailing_event.status,
    v_sailing_event.status_message,
    v_was_correct,
    v_prediction.risk_score - v_expected_score,
    v_expected_score,
    EXTRACT(EPOCH FROM (v_prediction.sailing_time - v_prediction.predicted_at)) / 3600,
    NOW()
  )
  ON CONFLICT (prediction_id) DO UPDATE SET
    sailing_event_id = EXCLUDED.sailing_event_id,
    actual_status = EXCLUDED.actual_status,
    actual_status_message = EXCLUDED.actual_status_message,
    was_correct = EXCLUDED.was_correct,
    score_error = EXCLUDED.score_error,
    expected_score = EXCLUDED.expected_score,
    hours_before_sailing = EXCLUDED.hours_before_sailing,
    matched_at = NOW();
END;
$$ LANGUAGE plpgsql;
