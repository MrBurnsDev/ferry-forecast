-- Outcome Logs Table for Ground Truth Collection
-- Run this in the Supabase SQL Editor AFTER schema-isolated.sql
--
-- Purpose: Store observed ferry outcomes to compare against predictions
-- This enables future model tuning based on real-world accuracy.
--
-- Design Decision: Using observed_time (timestamptz) instead of observed_date
-- Rationale: Ferries run multiple times per day, and weather conditions can
-- change significantly between morning and evening sailings. Timestamptz
-- allows correlating specific sailings with specific weather conditions.

SET search_path TO ferry_forecast, public;

-- ============================================
-- OUTCOME LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ferry_forecast.outcome_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Route reference (text slug for flexibility - works even if route deleted)
  route_id TEXT NOT NULL,

  -- When the sailing was scheduled/observed
  -- Using timestamptz to capture specific sailing time, not just date
  observed_time TIMESTAMPTZ NOT NULL,

  -- What actually happened
  observed_outcome TEXT NOT NULL CHECK (observed_outcome IN ('ran', 'delayed', 'canceled', 'unknown')),

  -- Official operator status if available
  operator_reported_status TEXT,

  -- Optional notes (e.g., "5 min delay due to loading", "rough seas")
  notes TEXT,

  -- Prediction snapshot at time of logging (for accuracy analysis)
  predicted_score INTEGER CHECK (predicted_score >= 0 AND predicted_score <= 100),
  predicted_confidence TEXT CHECK (predicted_confidence IN ('low', 'medium', 'high')),

  -- Weather conditions at time of sailing
  weather_snapshot JSONB,
  advisory_level TEXT,
  tide_swing_ft NUMERIC(5,2)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ff_outcome_logs_route ON ferry_forecast.outcome_logs(route_id);
CREATE INDEX IF NOT EXISTS idx_ff_outcome_logs_time ON ferry_forecast.outcome_logs(observed_time DESC);
CREATE INDEX IF NOT EXISTS idx_ff_outcome_logs_outcome ON ferry_forecast.outcome_logs(observed_outcome);
CREATE INDEX IF NOT EXISTS idx_ff_outcome_logs_route_time ON ferry_forecast.outcome_logs(route_id, observed_time DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ferry_forecast.outcome_logs ENABLE ROW LEVEL SECURITY;

-- Public/anon can READ outcome logs (for transparency/analysis)
CREATE POLICY "Public read outcome_logs"
  ON ferry_forecast.outcome_logs
  FOR SELECT
  USING (true);

-- NO insert/update/delete for anon or authenticated
-- Writes must come from service role (server-side only)
-- These policies prevent any direct client writes

-- Note: We intentionally do NOT create INSERT/UPDATE/DELETE policies for anon/authenticated
-- The service_role bypasses RLS entirely, so server-side writes will work
-- Client-side writes will be blocked by RLS

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant SELECT to anon and authenticated for read access
GRANT SELECT ON ferry_forecast.outcome_logs TO anon, authenticated;

-- Note: We do NOT grant INSERT/UPDATE/DELETE to anon or authenticated
-- The service_role key (used server-side) has full access regardless
