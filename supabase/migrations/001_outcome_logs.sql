-- ============================================================================
-- OUTCOME LOGS TABLE - Ground Truth Collection for Future Learning
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER schema-isolated.sql
--
-- PURPOSE:
-- Store observed ferry outcomes (ran, delayed, canceled) alongside the
-- predictions that were made at that time. This creates a dataset for
-- future accuracy analysis and potential model improvement.
--
-- CRITICAL: LEARNING STATUS
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ This data is COLLECTED but NOT YET USED in predictions.                 │
-- │ Current predictions are WEATHER-ONLY using deterministic scoring.       │
-- │ Learning/ML will be introduced later via offline analysis.              │
-- │ No outcome data currently influences the scoring engine.                │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- SECURITY MODEL:
-- - Table is APPEND-ONLY by design
-- - Writes require SUPABASE_SERVICE_ROLE_KEY (server-side only)
-- - Public can READ for transparency (research, analysis, verification)
-- - NO client-side inserts, updates, or deletes are possible
-- - RLS enforces this at the database level
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
-- ROW LEVEL SECURITY - APPEND-ONLY ENFORCEMENT
-- ============================================
--
-- SECURITY ARCHITECTURE:
-- This table implements an append-only log pattern for data integrity.
--
-- WHY APPEND-ONLY?
-- 1. Outcome data is ground truth - it should never be altered after recording
-- 2. Historical integrity is essential for future learning/analysis
-- 3. Prevents accidental or malicious data modification
-- 4. Audit trail remains intact for verification
--
-- HOW IT'S ENFORCED:
-- - RLS blocks all INSERT/UPDATE/DELETE from anon and authenticated roles
-- - Only service_role (server-side, via SUPABASE_SERVICE_ROLE_KEY) can write
-- - The API endpoint /api/outcomes/log is the only write path
-- - That endpoint requires the service role key (not exposed to clients)
--
-- RESULT:
-- - Clients can READ (for transparency)
-- - Clients CANNOT write, modify, or delete (enforced at DB level)
-- - Server can INSERT new records only
-- - Even server doesn't UPDATE or DELETE (by application design)

ALTER TABLE ferry_forecast.outcome_logs ENABLE ROW LEVEL SECURITY;

-- Public/anon can READ outcome logs (for transparency/analysis)
CREATE POLICY "Public read outcome_logs"
  ON ferry_forecast.outcome_logs
  FOR SELECT
  USING (true);

-- INTENTIONALLY NO INSERT/UPDATE/DELETE POLICIES FOR ANON OR AUTHENTICATED
--
-- This is a security feature, not an oversight.
--
-- The service_role bypasses RLS entirely, so server-side writes work.
-- Client-side writes are blocked because there's no policy allowing them.
--
-- To verify this is working:
-- 1. Try INSERT from client with anon key → should fail with RLS error
-- 2. Try INSERT from server with service key → should succeed
-- 3. Try UPDATE/DELETE from anywhere → should fail (no policy + app doesn't do this)

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant SELECT to anon and authenticated for read access
GRANT SELECT ON ferry_forecast.outcome_logs TO anon, authenticated;

-- Note: We do NOT grant INSERT/UPDATE/DELETE to anon or authenticated
-- The service_role key (used server-side) has full access regardless
