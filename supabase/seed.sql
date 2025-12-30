-- Ferry Forecast Seed Data
-- Run this AFTER schema.sql in the Supabase SQL Editor
-- Contains ONLY real configuration data (routes, ports, operators)
-- NO fake weather data, NO fake disruption history

-- ============================================
-- REGION
-- ============================================

INSERT INTO regions (name, slug, display_order, active)
VALUES
  ('Cape Cod & Islands', 'cape-cod-islands', 1, true);

-- ============================================
-- PORTS
-- ============================================

-- Get the region_id for Cape Cod
DO $$
DECLARE
  cape_cod_region_id UUID;
BEGIN
  SELECT region_id INTO cape_cod_region_id FROM regions WHERE slug = 'cape-cod-islands';

  -- Insert ports with NOAA tide station IDs
  INSERT INTO ports (region_id, name, slug, latitude, longitude, noaa_station_id, display_order, active)
  VALUES
    -- Cape Cod mainland ports
    (cape_cod_region_id, 'Woods Hole', 'woods-hole', 41.5234, -70.6693, '8447930', 1, true),
    (cape_cod_region_id, 'Hyannis', 'hyannis', 41.6362, -70.2826, '8447241', 2, true),
    -- Martha's Vineyard ports
    (cape_cod_region_id, 'Vineyard Haven', 'vineyard-haven', 41.4535, -70.6036, '8449130', 3, true),
    (cape_cod_region_id, 'Oak Bluffs', 'oak-bluffs', 41.4571, -70.5566, '8448725', 4, true),
    -- Nantucket
    (cape_cod_region_id, 'Nantucket', 'nantucket', 41.2835, -70.0995, '8449726', 5, true);
END $$;

-- ============================================
-- OPERATORS
-- ============================================

INSERT INTO operators (name, slug, website_url, status_page_url, active)
VALUES
  (
    'The Steamship Authority',
    'steamship-authority',
    'https://www.steamshipauthority.com',
    'https://www.steamshipauthority.com/schedules',
    true
  ),
  (
    'Hy-Line Cruises',
    'hy-line-cruises',
    'https://www.hylinecruises.com',
    'https://www.hylinecruises.com/ferry-schedules',
    true
  );

-- ============================================
-- ROUTES
-- ============================================

-- Insert routes using subqueries to get foreign key IDs
DO $$
DECLARE
  cape_cod_region_id UUID;
  woods_hole_id UUID;
  hyannis_id UUID;
  vineyard_haven_id UUID;
  oak_bluffs_id UUID;
  nantucket_id UUID;
  ssa_id UUID;
  hlc_id UUID;
BEGIN
  -- Get region ID
  SELECT region_id INTO cape_cod_region_id FROM regions WHERE slug = 'cape-cod-islands';

  -- Get port IDs
  SELECT port_id INTO woods_hole_id FROM ports WHERE slug = 'woods-hole';
  SELECT port_id INTO hyannis_id FROM ports WHERE slug = 'hyannis';
  SELECT port_id INTO vineyard_haven_id FROM ports WHERE slug = 'vineyard-haven';
  SELECT port_id INTO oak_bluffs_id FROM ports WHERE slug = 'oak-bluffs';
  SELECT port_id INTO nantucket_id FROM ports WHERE slug = 'nantucket';

  -- Get operator IDs
  SELECT operator_id INTO ssa_id FROM operators WHERE slug = 'steamship-authority';
  SELECT operator_id INTO hlc_id FROM operators WHERE slug = 'hy-line-cruises';

  -- Steamship Authority Routes
  -- Woods Hole <-> Vineyard Haven (main route, ~45 min)
  INSERT INTO routes (region_id, origin_port_id, destination_port_id, operator_id, slug, crossing_type, bearing_degrees, typical_duration_minutes, distance_nautical_miles, active)
  VALUES
    (cape_cod_region_id, woods_hole_id, vineyard_haven_id, ssa_id, 'wh-vh-ssa', 'open_water', 180, 45, 7.0, true),
    (cape_cod_region_id, vineyard_haven_id, woods_hole_id, ssa_id, 'vh-wh-ssa', 'open_water', 0, 45, 7.0, true);

  -- Woods Hole <-> Oak Bluffs (seasonal, ~45 min)
  INSERT INTO routes (region_id, origin_port_id, destination_port_id, operator_id, slug, crossing_type, bearing_degrees, typical_duration_minutes, distance_nautical_miles, active)
  VALUES
    (cape_cod_region_id, woods_hole_id, oak_bluffs_id, ssa_id, 'wh-ob-ssa', 'open_water', 165, 45, 7.5, true),
    (cape_cod_region_id, oak_bluffs_id, woods_hole_id, ssa_id, 'ob-wh-ssa', 'open_water', 345, 45, 7.5, true);

  -- Hyannis <-> Nantucket (traditional ferry, ~2h 15min)
  INSERT INTO routes (region_id, origin_port_id, destination_port_id, operator_id, slug, crossing_type, bearing_degrees, typical_duration_minutes, distance_nautical_miles, active)
  VALUES
    (cape_cod_region_id, hyannis_id, nantucket_id, ssa_id, 'hy-nan-ssa', 'open_water', 135, 135, 25.0, true),
    (cape_cod_region_id, nantucket_id, hyannis_id, ssa_id, 'nan-hy-ssa', 'open_water', 315, 135, 25.0, true);

  -- Hy-Line Cruises Routes
  -- Hyannis <-> Nantucket (high-speed, ~1h)
  INSERT INTO routes (region_id, origin_port_id, destination_port_id, operator_id, slug, crossing_type, bearing_degrees, typical_duration_minutes, distance_nautical_miles, active)
  VALUES
    (cape_cod_region_id, hyannis_id, nantucket_id, hlc_id, 'hy-nan-hlc', 'open_water', 135, 60, 25.0, true),
    (cape_cod_region_id, nantucket_id, hyannis_id, hlc_id, 'nan-hy-hlc', 'open_water', 315, 60, 25.0, true);

  -- Hyannis <-> Vineyard Haven (high-speed, seasonal)
  INSERT INTO routes (region_id, origin_port_id, destination_port_id, operator_id, slug, crossing_type, bearing_degrees, typical_duration_minutes, distance_nautical_miles, active)
  VALUES
    (cape_cod_region_id, hyannis_id, vineyard_haven_id, hlc_id, 'hy-vh-hlc', 'open_water', 200, 55, 22.0, true),
    (cape_cod_region_id, vineyard_haven_id, hyannis_id, hlc_id, 'vh-hy-hlc', 'open_water', 20, 55, 22.0, true);
END $$;

-- ============================================
-- VESSELS
-- ============================================
-- NOTE: I have NOT inserted specific vessel data because I cannot verify
-- the exact current fleet composition. You should manually add vessels
-- with accurate information from the operators' websites.
--
-- When you have verified vessel information, insert them like this:
--
-- INSERT INTO vessels (operator_id, name, vessel_class, year_built, passenger_capacity, vehicle_capacity, active)
-- SELECT operator_id, 'Island Home', 'large_ferry', 2007, 1200, 76, true
-- FROM operators WHERE slug = 'steamship-authority';
--
-- Then add vessel thresholds:
-- INSERT INTO vessel_thresholds (vessel_id, wind_limit_mph, gust_limit_mph, directional_sensitivity, advisory_sensitivity)
-- SELECT vessel_id, 40, 55, 0.9, 0.9
-- FROM vessels WHERE name = 'Island Home';
--
-- And link vessels to routes:
-- INSERT INTO route_vessels (route_id, vessel_id, is_primary)
-- SELECT r.route_id, v.vessel_id, true
-- FROM routes r, vessels v
-- WHERE r.slug = 'wh-vh-ssa' AND v.name = 'Island Home';

-- ============================================
-- VERIFICATION QUERIES (optional, run to check data)
-- ============================================

-- Uncomment to verify data was inserted correctly:
-- SELECT * FROM regions;
-- SELECT p.name, p.slug, r.name as region FROM ports p JOIN regions r ON p.region_id = r.region_id;
-- SELECT * FROM operators;
-- SELECT * FROM routes_full;
