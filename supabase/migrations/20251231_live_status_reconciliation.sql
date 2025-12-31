-- Phase 37: Live Operator Status Reconciliation
--
-- Extends sailing_events table to support status reconciliation.
-- When operator status changes (e.g., Trip Consolidation cancellation),
-- we UPDATE existing rows instead of always inserting.
--
-- KEY PRINCIPLE: Operator reality overrides prediction.
-- Forecast explains risk. Operator status defines truth.

-- ============================================
-- ADD RECONCILIATION COLUMNS
-- ============================================

-- Status reason: preserves operator's exact text (e.g., "Trip Consolidation")
ALTER TABLE ferry_forecast.sailing_events
ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- Status source: identifies who/what set this status
-- 'operator' = from live SSA/Hyline data
-- 'schedule' = from static schedule (default initial status)
ALTER TABLE ferry_forecast.sailing_events
ADD COLUMN IF NOT EXISTS status_source TEXT DEFAULT 'operator';

-- Status updated timestamp: when status was last changed
ALTER TABLE ferry_forecast.sailing_events
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

-- Previous status: for audit trail (what it was before this update)
ALTER TABLE ferry_forecast.sailing_events
ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- ============================================
-- UNIQUE CONSTRAINT FOR UPSERT
-- ============================================

-- Create unique index on natural key for upsert operations
-- Each sailing is uniquely identified by:
-- operator_id + corridor_id + service_date + departure_time + from_port + to_port
CREATE UNIQUE INDEX IF NOT EXISTS idx_sailing_events_natural_key
ON ferry_forecast.sailing_events (
  operator_id,
  corridor_id,
  service_date,
  departure_time,
  from_port,
  to_port
);

-- ============================================
-- ENABLE UPDATE FOR RECONCILIATION
-- ============================================

-- Allow service role to UPDATE for reconciliation
-- This is a deliberate departure from append-only for live status tracking
CREATE POLICY IF NOT EXISTS "Service update sailing_events"
  ON ferry_forecast.sailing_events FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN ferry_forecast.sailing_events.status_reason IS
  'Operator-provided reason for status (e.g., "Trip Consolidation", "Weather conditions")';

COMMENT ON COLUMN ferry_forecast.sailing_events.status_source IS
  'Who set this status: operator (live data) or schedule (static template)';

COMMENT ON COLUMN ferry_forecast.sailing_events.status_updated_at IS
  'When the status was last reconciled/updated';

COMMENT ON COLUMN ferry_forecast.sailing_events.previous_status IS
  'What the status was before the most recent update (for audit trail)';
