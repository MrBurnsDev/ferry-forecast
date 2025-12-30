-- ============================================================================
-- PREDICTION SNAPSHOTS TABLE - Learning-Ready Data Logging
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER 001_outcome_logs.sql
--
-- PURPOSE:
-- Store prediction snapshots at the time they are made, before outcomes are
-- known. This enables future accuracy analysis by comparing predictions
-- with actual outcomes (from outcome_logs).
--
-- RELATIONSHIP WITH OUTCOME_LOGS:
-- - prediction_snapshots: What we PREDICTED would happen
-- - outcome_logs: What ACTUALLY happened
-- - Correlation is done via route_id + prediction_time/observed_time matching
--
-- CRITICAL: LEARNING STATUS
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ This data is COLLECTED but NOT YET USED in predictions.                 │
-- │ Current predictions are WEATHER-ONLY using deterministic scoring.       │
-- │ Learning/ML will be introduced later via offline analysis.              │
-- │ No historical data currently influences the scoring engine.             │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- SECURITY MODEL:
-- - Table is APPEND-ONLY by design
-- - Writes require SUPABASE_SERVICE_ROLE_KEY (server-side only)
-- - Public can READ for transparency (research, analysis, verification)
-- - NO client-side inserts, updates, or deletes are possible
-- - RLS enforces this at the database level

SET search_path TO ferry_forecast, public;

-- ============================================
-- PREDICTION SNAPSHOTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ferry_forecast.prediction_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Route reference
  route_id TEXT NOT NULL,

  -- When the prediction was made
  prediction_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- What time period this prediction is for (the sailing being predicted)
  forecast_for_time TIMESTAMPTZ NOT NULL,

  -- Prediction result
  predicted_score INTEGER NOT NULL CHECK (predicted_score >= 0 AND predicted_score <= 100),
  predicted_risk_level TEXT NOT NULL CHECK (predicted_risk_level IN ('low', 'moderate', 'high')),
  predicted_confidence TEXT NOT NULL CHECK (predicted_confidence IN ('low', 'medium', 'high')),

  -- Contributing factors (what drove the prediction)
  factors JSONB NOT NULL DEFAULT '[]',

  -- Input data snapshot (for reproducibility)
  weather_input JSONB NOT NULL,
  tide_input JSONB,

  -- Route exposure data used (v1 or v2)
  exposure_version TEXT CHECK (exposure_version IN ('1', '2')),
  exposure_modifier INTEGER,
  wind_direction_bucket TEXT,

  -- Model version used
  model_version TEXT NOT NULL,

  -- Optional: link to outcome when known
  -- This is denormalized for query efficiency
  actual_outcome TEXT CHECK (actual_outcome IN ('ran', 'delayed', 'canceled', 'unknown')),
  outcome_linked_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ff_pred_snap_route ON ferry_forecast.prediction_snapshots(route_id);
CREATE INDEX IF NOT EXISTS idx_ff_pred_snap_time ON ferry_forecast.prediction_snapshots(prediction_time DESC);
CREATE INDEX IF NOT EXISTS idx_ff_pred_snap_forecast ON ferry_forecast.prediction_snapshots(forecast_for_time);
CREATE INDEX IF NOT EXISTS idx_ff_pred_snap_route_forecast ON ferry_forecast.prediction_snapshots(route_id, forecast_for_time);
CREATE INDEX IF NOT EXISTS idx_ff_pred_snap_unlinked ON ferry_forecast.prediction_snapshots(actual_outcome) WHERE actual_outcome IS NULL;

-- ============================================
-- ROW LEVEL SECURITY - APPEND-ONLY ENFORCEMENT
-- ============================================

ALTER TABLE ferry_forecast.prediction_snapshots ENABLE ROW LEVEL SECURITY;

-- Public/anon can READ prediction snapshots (for transparency/analysis)
CREATE POLICY "Public read prediction_snapshots"
  ON ferry_forecast.prediction_snapshots
  FOR SELECT
  USING (true);

-- INTENTIONALLY NO INSERT/UPDATE/DELETE POLICIES FOR ANON OR AUTHENTICATED
-- The service_role bypasses RLS entirely, so server-side writes work.

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON ferry_forecast.prediction_snapshots TO anon, authenticated;

-- ============================================
-- ANALYSIS VIEW: PREDICTION ACCURACY
-- ============================================
-- This view joins predictions with outcomes for accuracy analysis
-- (to be populated once we have outcome data)

CREATE OR REPLACE VIEW ferry_forecast.prediction_accuracy AS
SELECT
  ps.route_id,
  ps.forecast_for_time,
  ps.predicted_score,
  ps.predicted_risk_level,
  ps.predicted_confidence,
  ps.exposure_version,
  ps.model_version,
  ol.observed_outcome,
  ol.observed_time,
  -- Accuracy metrics
  CASE
    WHEN ps.predicted_risk_level = 'low' AND ol.observed_outcome = 'ran' THEN 'correct'
    WHEN ps.predicted_risk_level = 'moderate' AND ol.observed_outcome IN ('ran', 'delayed') THEN 'correct'
    WHEN ps.predicted_risk_level = 'high' AND ol.observed_outcome IN ('delayed', 'canceled') THEN 'correct'
    ELSE 'incorrect'
  END AS accuracy,
  -- Score delta for calibration analysis
  CASE ol.observed_outcome
    WHEN 'ran' THEN ps.predicted_score - 15  -- Expected score for on-time
    WHEN 'delayed' THEN ps.predicted_score - 45  -- Expected for delay
    WHEN 'canceled' THEN ps.predicted_score - 80  -- Expected for cancel
    ELSE NULL
  END AS score_delta
FROM ferry_forecast.prediction_snapshots ps
LEFT JOIN ferry_forecast.outcome_logs ol
  ON ps.route_id = ol.route_id
  AND ol.observed_time BETWEEN ps.forecast_for_time - INTERVAL '30 minutes'
                           AND ps.forecast_for_time + INTERVAL '30 minutes'
WHERE ol.id IS NOT NULL;

GRANT SELECT ON ferry_forecast.prediction_accuracy TO anon, authenticated;
