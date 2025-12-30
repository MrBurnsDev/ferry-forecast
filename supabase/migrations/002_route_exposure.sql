-- ============================================================================
-- ROUTE EXPOSURE TABLE - Computed Wind Direction Exposure Data
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER 001_outcome_logs.sql
--
-- PURPOSE:
-- Store computed per-route exposure scores for each of 16 wind directions.
-- These are derived from coastline geometry analysis (fetch distance to land).
--
-- HOW IT'S COMPUTED:
-- For each route, we:
-- 1. Sample points along the route line
-- 2. For each of 16 compass directions, cast rays upwind
-- 3. Measure fetch distance (km) until hitting land
-- 4. Normalize into exposure score 0..1 using log scale
--
-- This replaces hand-authored "route sensitivity" data with physics-based values.
--
-- SECURITY:
-- - Public can SELECT (needed for UI display)
-- - Only service_role can INSERT/UPDATE/DELETE
-- - Data is computed offline and uploaded via service role

SET search_path TO ferry_forecast, public;

-- ============================================
-- ROUTE EXPOSURE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ferry_forecast.route_exposure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Route reference (using slug for stability across environments)
  route_id TEXT NOT NULL UNIQUE,

  -- Port slugs for reference
  origin_port TEXT NOT NULL,
  destination_port TEXT NOT NULL,

  -- Exposure scores by direction (0..1, higher = more exposed)
  -- Keys: N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW
  exposure_by_dir JSONB NOT NULL,

  -- Raw fetch distances in km (for debugging/transparency)
  fetch_km_by_dir JSONB NOT NULL,

  -- Derived summary values
  avg_exposure DECIMAL(4,3) NOT NULL CHECK (avg_exposure >= 0 AND avg_exposure <= 1),
  top_exposure_dirs TEXT[] NOT NULL,  -- Top 3 wind directions by exposure

  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL,
  computation_version TEXT NOT NULL DEFAULT '1.0',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for route lookups
CREATE INDEX IF NOT EXISTS idx_ff_route_exposure_route ON ferry_forecast.route_exposure(route_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ferry_forecast.route_exposure ENABLE ROW LEVEL SECURITY;

-- Public can read exposure data (needed for UI)
CREATE POLICY "Public read route_exposure"
  ON ferry_forecast.route_exposure
  FOR SELECT
  USING (true);

-- No direct writes from clients - service role only
-- (service_role bypasses RLS)

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON ferry_forecast.route_exposure TO anon, authenticated;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER set_updated_at_route_exposure
  BEFORE UPDATE ON ferry_forecast.route_exposure
  FOR EACH ROW EXECUTE FUNCTION ferry_forecast.trigger_set_updated_at();

-- ============================================
-- HELPER VIEW: Route with Exposure
-- ============================================

CREATE OR REPLACE VIEW ferry_forecast.routes_with_exposure AS
SELECT
  r.route_id,
  r.slug AS route_slug,
  r.crossing_type::text,
  r.bearing_degrees,
  r.active,
  op.slug AS origin_port_slug,
  dp.slug AS destination_port_slug,
  o.slug AS operator_slug,
  -- Exposure data
  re.exposure_by_dir,
  re.fetch_km_by_dir,
  re.avg_exposure,
  re.top_exposure_dirs,
  re.computed_at AS exposure_computed_at
FROM ferry_forecast.routes r
JOIN ferry_forecast.ports op ON r.origin_port_id = op.port_id
JOIN ferry_forecast.ports dp ON r.destination_port_id = dp.port_id
JOIN ferry_forecast.operators o ON r.operator_id = o.operator_id
LEFT JOIN ferry_forecast.route_exposure re ON r.slug = re.route_id
WHERE r.active = true;
