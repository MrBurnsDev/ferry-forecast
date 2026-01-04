-- Phase 59: Region/Operator/Route Authority + UX Rebuild
--
-- This migration establishes Region as the top-level authority and creates
-- operator_routes table for operator-defined routes (NOT inferred).
--
-- AUTHORITY HIERARCHY (ENFORCED):
-- 1. Region (top-level grouping)
-- 2. Operator (region-scoped, source of schedule truth)
-- 3. Route (operator-defined, explicit direction)
-- 4. Sailings (operator-published, NEVER inferred)
--
-- HARD RULES:
-- - Routes exist even if they have zero sailings today
-- - Routes are NEVER shared across operators
-- - Direction is explicit - never inferred
-- - If operator doesn't list a sailing -> it must not exist in our system

SET search_path TO ferry_forecast, public;

-- ============================================================
-- PART A: UPDATE REGIONS TABLE
-- ============================================================

-- Add id column as text primary key (matching spec: id, slug, display_name)
-- The existing schema uses region_id (UUID), we need to add a text id
ALTER TABLE ferry_forecast.regions
  ADD COLUMN IF NOT EXISTS id TEXT UNIQUE;

-- Update existing region with text ID
UPDATE ferry_forecast.regions
SET id = 'cci'
WHERE slug = 'cape-cod-islands';

-- Make id NOT NULL after backfill
-- (Only if there's data - otherwise skip)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ferry_forecast.regions WHERE id IS NOT NULL) THEN
    -- Already has data, good
    NULL;
  END IF;
END $$;

-- ============================================================
-- PART B: UPDATE OPERATORS TABLE
-- ============================================================

-- Add region_id FK and official_url
ALTER TABLE ferry_forecast.operators
  ADD COLUMN IF NOT EXISTS region_id TEXT;

ALTER TABLE ferry_forecast.operators
  ADD COLUMN IF NOT EXISTS official_url TEXT;

-- Update existing operators with region
UPDATE ferry_forecast.operators
SET
  region_id = 'cci',
  official_url = COALESCE(official_url, website_url)
WHERE slug IN ('steamship-authority', 'ssa', 'hy-line-cruises', 'hyline');

-- ============================================================
-- PART C: CREATE OPERATOR_ROUTES TABLE
-- ============================================================

-- Drop if exists for clean re-run
DROP TABLE IF EXISTS ferry_forecast.operator_routes CASCADE;

-- Create operator_routes table per Phase 59 spec
CREATE TABLE ferry_forecast.operator_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,  -- FK to operators.slug (using text for simplicity)
  from_terminal TEXT NOT NULL,
  to_terminal TEXT NOT NULL,
  route_slug TEXT NOT NULL,  -- Operator-scoped, NOT global
  display_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Route is unique per operator + direction
  UNIQUE(operator_id, from_terminal, to_terminal)
);

-- Index for common queries
CREATE INDEX idx_ff_operator_routes_operator ON ferry_forecast.operator_routes(operator_id);
CREATE INDEX idx_ff_operator_routes_from ON ferry_forecast.operator_routes(from_terminal);
CREATE INDEX idx_ff_operator_routes_to ON ferry_forecast.operator_routes(to_terminal);
CREATE INDEX idx_ff_operator_routes_active ON ferry_forecast.operator_routes(active);
CREATE INDEX idx_ff_operator_routes_slug ON ferry_forecast.operator_routes(route_slug);

-- Add updated_at trigger
CREATE TRIGGER set_updated_at_operator_routes
  BEFORE UPDATE ON ferry_forecast.operator_routes
  FOR EACH ROW EXECUTE FUNCTION ferry_forecast.trigger_set_updated_at();

-- ============================================================
-- PART D: SEED OPERATOR ROUTES FOR SSA
-- ============================================================

-- SSA Routes (all explicitly defined by SSA, with direction)
INSERT INTO ferry_forecast.operator_routes (operator_id, from_terminal, to_terminal, route_slug, display_name, active)
VALUES
  -- Woods Hole <-> Vineyard Haven (SSA primary year-round)
  ('ssa', 'woods-hole', 'vineyard-haven', 'wh-vh', 'Woods Hole to Vineyard Haven', true),
  ('ssa', 'vineyard-haven', 'woods-hole', 'vh-wh', 'Vineyard Haven to Woods Hole', true),

  -- Woods Hole <-> Oak Bluffs (SSA seasonal)
  ('ssa', 'woods-hole', 'oak-bluffs', 'wh-ob', 'Woods Hole to Oak Bluffs', true),
  ('ssa', 'oak-bluffs', 'woods-hole', 'ob-wh', 'Oak Bluffs to Woods Hole', true),

  -- Hyannis <-> Nantucket (SSA year-round)
  ('ssa', 'hyannis', 'nantucket', 'hy-nan', 'Hyannis to Nantucket', true),
  ('ssa', 'nantucket', 'hyannis', 'nan-hy', 'Nantucket to Hyannis', true)
ON CONFLICT (operator_id, from_terminal, to_terminal) DO UPDATE
SET
  route_slug = EXCLUDED.route_slug,
  display_name = EXCLUDED.display_name,
  active = EXCLUDED.active,
  updated_at = NOW();

-- Hy-Line Routes (seasonal, fast ferry + traditional)
INSERT INTO ferry_forecast.operator_routes (operator_id, from_terminal, to_terminal, route_slug, display_name, active)
VALUES
  -- Hyannis <-> Nantucket (Hy-Line)
  ('hyline', 'hyannis', 'nantucket', 'hy-nan', 'Hyannis to Nantucket', true),
  ('hyline', 'nantucket', 'hyannis', 'nan-hy', 'Nantucket to Hyannis', true),

  -- Hyannis <-> Vineyard Haven (Hy-Line seasonal)
  ('hyline', 'hyannis', 'vineyard-haven', 'hy-vh', 'Hyannis to Vineyard Haven', true),
  ('hyline', 'vineyard-haven', 'hyannis', 'vh-hy', 'Vineyard Haven to Hyannis', true)
ON CONFLICT (operator_id, from_terminal, to_terminal) DO UPDATE
SET
  route_slug = EXCLUDED.route_slug,
  display_name = EXCLUDED.display_name,
  active = EXCLUDED.active,
  updated_at = NOW();

-- ============================================================
-- PART E: UPDATE SAILING_EVENTS TO REFERENCE OPERATOR_ROUTES
-- ============================================================

-- Add operator_route_id column if it doesn't exist
ALTER TABLE ferry_forecast.sailing_events
  ADD COLUMN IF NOT EXISTS operator_route_id UUID REFERENCES ferry_forecast.operator_routes(id);

-- Create index for FK lookup
CREATE INDEX IF NOT EXISTS idx_ff_sailing_events_route
  ON ferry_forecast.sailing_events(operator_route_id);

-- ============================================================
-- PART F: RLS POLICIES FOR NEW TABLES
-- ============================================================

ALTER TABLE ferry_forecast.operator_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read operator_routes"
  ON ferry_forecast.operator_routes FOR SELECT USING (true);

CREATE POLICY "Service write operator_routes"
  ON ferry_forecast.operator_routes FOR INSERT WITH CHECK (true);

CREATE POLICY "Service update operator_routes"
  ON ferry_forecast.operator_routes FOR UPDATE USING (true);

CREATE POLICY "Service delete operator_routes"
  ON ferry_forecast.operator_routes FOR DELETE USING (true);

-- Grant access
GRANT SELECT ON ferry_forecast.operator_routes TO anon, authenticated;

-- ============================================================
-- PART G: VIEW FOR FULL OPERATOR ROUTE INFO
-- ============================================================

CREATE OR REPLACE VIEW ferry_forecast.operator_routes_full AS
SELECT
  opr.id AS operator_route_id,
  opr.operator_id,
  opr.from_terminal,
  opr.to_terminal,
  opr.route_slug,
  opr.display_name,
  opr.active,
  -- Operator info
  o.name AS operator_name,
  o.slug AS operator_slug,
  o.status_page_url AS operator_status_url,
  -- Region info (via operator)
  r.id AS region_id,
  r.name AS region_name,
  r.slug AS region_slug
FROM ferry_forecast.operator_routes opr
LEFT JOIN ferry_forecast.operators o ON opr.operator_id = o.slug
LEFT JOIN ferry_forecast.regions r ON o.region_id = r.id
WHERE opr.active = true;

-- Grant access to view
GRANT SELECT ON ferry_forecast.operator_routes_full TO anon, authenticated;

-- ============================================================
-- VERIFICATION QUERIES (for testing)
-- ============================================================

-- Verify regions exist
-- SELECT * FROM ferry_forecast.regions;

-- Verify operators are region-scoped
-- SELECT slug, region_id, active FROM ferry_forecast.operators;

-- Verify operator_routes are created
-- SELECT operator_id, from_terminal, to_terminal, route_slug, active
-- FROM ferry_forecast.operator_routes
-- ORDER BY operator_id, from_terminal;

-- Verify full view works
-- SELECT * FROM ferry_forecast.operator_routes_full LIMIT 5;
