-- Ferry Forecast Database Schema
-- Phase 2: Normalized production schema
-- Run this in the Supabase SQL Editor

-- ============================================
-- CLEANUP (for re-running)
-- ============================================

-- Drop existing tables if re-running (in reverse dependency order)
DROP TABLE IF EXISTS operator_status_cache CASCADE;
DROP TABLE IF EXISTS weather_cache CASCADE;
DROP TABLE IF EXISTS disruption_history CASCADE;
DROP TABLE IF EXISTS risk_profiles CASCADE;
DROP TABLE IF EXISTS vessel_thresholds CASCADE;
DROP TABLE IF EXISTS route_vessels CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS vessels CASCADE;
DROP TABLE IF EXISTS operators CASCADE;
DROP TABLE IF EXISTS ports CASCADE;
DROP TABLE IF EXISTS regions CASCADE;

-- Drop old tables from Phase 1 if they exist
DROP TABLE IF EXISTS ferry_routes CASCADE;

-- Drop existing types if re-running
DROP TYPE IF EXISTS advisory_level CASCADE;
DROP TYPE IF EXISTS official_status CASCADE;
DROP TYPE IF EXISTS crossing_type CASCADE;
DROP TYPE IF EXISTS vessel_class CASCADE;
DROP TYPE IF EXISTS confidence_rating CASCADE;

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE advisory_level AS ENUM (
  'none',
  'small_craft_advisory',
  'gale_warning',
  'storm_warning',
  'hurricane_warning'
);

CREATE TYPE official_status AS ENUM (
  'on_time',
  'delayed',
  'canceled',
  'unknown'
);

CREATE TYPE crossing_type AS ENUM (
  'open_water',
  'protected',
  'mixed'
);

CREATE TYPE vessel_class AS ENUM (
  'large_ferry',
  'fast_ferry',
  'traditional_ferry',
  'high_speed_catamaran'
);

CREATE TYPE confidence_rating AS ENUM (
  'low',
  'medium',
  'high'
);

-- ============================================
-- CORE CONFIGURATION TABLES
-- ============================================

-- Regions (e.g., Cape Cod & Islands, Puget Sound, etc.)
CREATE TABLE regions (
  region_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regions_slug ON regions(slug);
CREATE INDEX idx_regions_active ON regions(active);

-- Ports within regions
CREATE TABLE ports (
  port_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID NOT NULL REFERENCES regions(region_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  noaa_station_id TEXT, -- For tide data lookup
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(region_id, slug)
);

CREATE INDEX idx_ports_region ON ports(region_id);
CREATE INDEX idx_ports_slug ON ports(slug);
CREATE INDEX idx_ports_active ON ports(active);

-- Ferry Operators
CREATE TABLE operators (
  operator_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  website_url TEXT,
  status_page_url TEXT, -- For scraping official status
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operators_slug ON operators(slug);
CREATE INDEX idx_operators_active ON operators(active);

-- Routes (origin + destination + operator = unique route)
CREATE TABLE routes (
  route_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID NOT NULL REFERENCES regions(region_id) ON DELETE CASCADE,
  origin_port_id UUID NOT NULL REFERENCES ports(port_id) ON DELETE CASCADE,
  destination_port_id UUID NOT NULL REFERENCES ports(port_id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(operator_id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE, -- e.g., 'wh-vh-ssa'
  crossing_type crossing_type NOT NULL DEFAULT 'open_water',
  bearing_degrees INTEGER NOT NULL CHECK (bearing_degrees >= 0 AND bearing_degrees < 360),
  typical_duration_minutes INTEGER, -- Crossing time
  distance_nautical_miles DECIMAL(5,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(origin_port_id, destination_port_id, operator_id)
);

CREATE INDEX idx_routes_region ON routes(region_id);
CREATE INDEX idx_routes_origin ON routes(origin_port_id);
CREATE INDEX idx_routes_destination ON routes(destination_port_id);
CREATE INDEX idx_routes_operator ON routes(operator_id);
CREATE INDEX idx_routes_slug ON routes(slug);
CREATE INDEX idx_routes_active ON routes(active);

-- Vessels
CREATE TABLE vessels (
  vessel_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL REFERENCES operators(operator_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vessel_class vessel_class NOT NULL DEFAULT 'traditional_ferry',
  year_built INTEGER,
  passenger_capacity INTEGER,
  vehicle_capacity INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(operator_id, name)
);

CREATE INDEX idx_vessels_operator ON vessels(operator_id);
CREATE INDEX idx_vessels_class ON vessels(vessel_class);
CREATE INDEX idx_vessels_active ON vessels(active);

-- Route-Vessel mapping (which vessels can serve which routes)
CREATE TABLE route_vessels (
  route_id UUID NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES vessels(vessel_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false, -- Primary vessel for this route
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (route_id, vessel_id)
);

CREATE INDEX idx_route_vessels_route ON route_vessels(route_id);
CREATE INDEX idx_route_vessels_vessel ON route_vessels(vessel_id);

-- Vessel-specific weather thresholds
CREATE TABLE vessel_thresholds (
  threshold_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vessel_id UUID NOT NULL REFERENCES vessels(vessel_id) ON DELETE CASCADE,
  wind_limit_mph INTEGER NOT NULL DEFAULT 35,
  gust_limit_mph INTEGER NOT NULL DEFAULT 50,
  wave_height_limit_ft DECIMAL(4,1),
  -- Directional sensitivity: multiplier applied based on wind angle to route
  -- 1.0 = neutral, >1.0 = more sensitive, <1.0 = less sensitive
  directional_sensitivity DECIMAL(3,2) NOT NULL DEFAULT 1.0
    CHECK (directional_sensitivity >= 0.5 AND directional_sensitivity <= 2.0),
  -- Advisory sensitivity: multiplier for advisory impact on score
  advisory_sensitivity DECIMAL(3,2) NOT NULL DEFAULT 1.0
    CHECK (advisory_sensitivity >= 0.5 AND advisory_sensitivity <= 2.0),
  -- Optional: detailed thresholds as JSON for complex rules
  custom_thresholds JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vessel_id)
);

CREATE INDEX idx_vessel_thresholds_vessel ON vessel_thresholds(vessel_id);

-- ============================================
-- OPERATIONAL DATA TABLES
-- ============================================

-- Calculated risk profiles (cached forecasts)
CREATE TABLE risk_profiles (
  profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forecast_time TIMESTAMPTZ NOT NULL,
  route_id UUID NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES vessels(vessel_id) ON DELETE SET NULL,
  -- Weather conditions at time of calculation
  wind_speed_mph INTEGER NOT NULL,
  wind_gust_mph INTEGER NOT NULL,
  wind_direction_degrees INTEGER NOT NULL CHECK (wind_direction_degrees >= 0 AND wind_direction_degrees < 360),
  advisory_level advisory_level NOT NULL DEFAULT 'none',
  wave_height_ft DECIMAL(4,1),
  visibility_nm DECIMAL(4,1),
  -- Tide conditions
  tide_height_ft DECIMAL(5,2),
  tide_phase TEXT, -- 'rising', 'falling', 'slack', 'high', 'low'
  tide_swing_ft DECIMAL(4,2),
  -- Calculated score
  predicted_score INTEGER NOT NULL CHECK (predicted_score >= 0 AND predicted_score <= 100),
  confidence_rating confidence_rating NOT NULL DEFAULT 'low',
  contributing_factors JSONB, -- Array of { factor, description, weight, value }
  model_version TEXT NOT NULL,
  -- Official status if known at time of calculation
  official_status official_status,
  official_status_source TEXT,
  official_status_message TEXT,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_profiles_route ON risk_profiles(route_id);
CREATE INDEX idx_risk_profiles_forecast_time ON risk_profiles(forecast_time);
CREATE INDEX idx_risk_profiles_route_time ON risk_profiles(route_id, forecast_time DESC);

-- Historical disruption records (for learning)
-- NOTE: Only insert REAL disruptions from actual events
CREATE TABLE disruption_history (
  disruption_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  disruption_date DATE NOT NULL,
  route_id UUID NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES vessels(vessel_id) ON DELETE SET NULL,
  scheduled_sailings INTEGER NOT NULL DEFAULT 0,
  delayed_sailings INTEGER NOT NULL DEFAULT 0,
  canceled_sailings INTEGER NOT NULL DEFAULT 0,
  reason_text TEXT,
  source_url TEXT,
  -- Weather conditions at time of disruption (for pattern matching)
  weather_snapshot JSONB,
  -- Verification
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disruption_history_route ON disruption_history(route_id);
CREATE INDEX idx_disruption_history_date ON disruption_history(disruption_date);
CREATE INDEX idx_disruption_history_route_date ON disruption_history(route_id, disruption_date DESC);

-- ============================================
-- CACHING TABLES
-- ============================================

-- Weather data cache
CREATE TABLE weather_cache (
  cache_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID NOT NULL REFERENCES regions(region_id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL, -- e.g., 'current', 'hourly_24h'
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(region_id, cache_key)
);

CREATE INDEX idx_weather_cache_region ON weather_cache(region_id);
CREATE INDEX idx_weather_cache_expires ON weather_cache(expires_at);

-- Operator status cache
CREATE TABLE operator_status_cache (
  cache_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
  status official_status NOT NULL DEFAULT 'unknown',
  message TEXT,
  effective_time TIMESTAMPTZ,
  source_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(route_id)
);

CREATE INDEX idx_operator_status_route ON operator_status_cache(route_id);
CREATE INDEX idx_operator_status_expires ON operator_status_cache(expires_at);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at_regions
  BEFORE UPDATE ON regions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_ports
  BEFORE UPDATE ON ports
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_operators
  BEFORE UPDATE ON operators
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_routes
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_vessels
  BEFORE UPDATE ON vessels
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_vessel_thresholds
  BEFORE UPDATE ON vessel_thresholds
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Function to clean up expired cache
CREATE OR REPLACE FUNCTION cleanup_expired_caches()
RETURNS void AS $$
BEGIN
  DELETE FROM weather_cache WHERE expires_at < NOW();
  DELETE FROM operator_status_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ports ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE disruption_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_status_cache ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ ACCESS for configuration tables (anonymous users need this for selector)
CREATE POLICY "Public read regions" ON regions FOR SELECT USING (true);
CREATE POLICY "Public read ports" ON ports FOR SELECT USING (true);
CREATE POLICY "Public read operators" ON operators FOR SELECT USING (true);
CREATE POLICY "Public read routes" ON routes FOR SELECT USING (true);
CREATE POLICY "Public read vessels" ON vessels FOR SELECT USING (true);
CREATE POLICY "Public read route_vessels" ON route_vessels FOR SELECT USING (true);

-- Public can also read risk profiles and cached status
CREATE POLICY "Public read risk_profiles" ON risk_profiles FOR SELECT USING (true);
CREATE POLICY "Public read operator_status_cache" ON operator_status_cache FOR SELECT USING (true);

-- SERVICE ROLE ONLY for writes (allows INSERT, UPDATE, DELETE with service key)
CREATE POLICY "Service write regions" ON regions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update regions" ON regions FOR UPDATE USING (true);
CREATE POLICY "Service delete regions" ON regions FOR DELETE USING (true);

CREATE POLICY "Service write ports" ON ports FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update ports" ON ports FOR UPDATE USING (true);
CREATE POLICY "Service delete ports" ON ports FOR DELETE USING (true);

CREATE POLICY "Service write operators" ON operators FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update operators" ON operators FOR UPDATE USING (true);
CREATE POLICY "Service delete operators" ON operators FOR DELETE USING (true);

CREATE POLICY "Service write routes" ON routes FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update routes" ON routes FOR UPDATE USING (true);
CREATE POLICY "Service delete routes" ON routes FOR DELETE USING (true);

CREATE POLICY "Service write vessels" ON vessels FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update vessels" ON vessels FOR UPDATE USING (true);
CREATE POLICY "Service delete vessels" ON vessels FOR DELETE USING (true);

CREATE POLICY "Service write route_vessels" ON route_vessels FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update route_vessels" ON route_vessels FOR UPDATE USING (true);
CREATE POLICY "Service delete route_vessels" ON route_vessels FOR DELETE USING (true);

CREATE POLICY "Service write vessel_thresholds" ON vessel_thresholds FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update vessel_thresholds" ON vessel_thresholds FOR UPDATE USING (true);
CREATE POLICY "Service delete vessel_thresholds" ON vessel_thresholds FOR DELETE USING (true);

CREATE POLICY "Service write risk_profiles" ON risk_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update risk_profiles" ON risk_profiles FOR UPDATE USING (true);
CREATE POLICY "Service delete risk_profiles" ON risk_profiles FOR DELETE USING (true);

CREATE POLICY "Service write disruption_history" ON disruption_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update disruption_history" ON disruption_history FOR UPDATE USING (true);
CREATE POLICY "Service delete disruption_history" ON disruption_history FOR DELETE USING (true);

CREATE POLICY "Service write weather_cache" ON weather_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update weather_cache" ON weather_cache FOR UPDATE USING (true);
CREATE POLICY "Service delete weather_cache" ON weather_cache FOR DELETE USING (true);

CREATE POLICY "Service write operator_status_cache" ON operator_status_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update operator_status_cache" ON operator_status_cache FOR UPDATE USING (true);
CREATE POLICY "Service delete operator_status_cache" ON operator_status_cache FOR DELETE USING (true);

-- ============================================
-- VIEWS (for convenience)
-- ============================================

-- Full route view with all related data
CREATE OR REPLACE VIEW routes_full AS
SELECT
  r.route_id,
  r.slug AS route_slug,
  r.crossing_type,
  r.bearing_degrees,
  r.typical_duration_minutes,
  r.distance_nautical_miles,
  r.active AS route_active,
  -- Region
  reg.region_id,
  reg.name AS region_name,
  reg.slug AS region_slug,
  -- Origin port
  op.port_id AS origin_port_id,
  op.name AS origin_port_name,
  op.slug AS origin_port_slug,
  op.latitude AS origin_latitude,
  op.longitude AS origin_longitude,
  op.noaa_station_id AS origin_noaa_station,
  -- Destination port
  dp.port_id AS destination_port_id,
  dp.name AS destination_port_name,
  dp.slug AS destination_port_slug,
  dp.latitude AS destination_latitude,
  dp.longitude AS destination_longitude,
  dp.noaa_station_id AS destination_noaa_station,
  -- Operator
  o.operator_id,
  o.name AS operator_name,
  o.slug AS operator_slug,
  o.website_url AS operator_website,
  o.status_page_url AS operator_status_page
FROM routes r
JOIN regions reg ON r.region_id = reg.region_id
JOIN ports op ON r.origin_port_id = op.port_id
JOIN ports dp ON r.destination_port_id = dp.port_id
JOIN operators o ON r.operator_id = o.operator_id
WHERE r.active = true
  AND reg.active = true
  AND op.active = true
  AND dp.active = true
  AND o.active = true;

-- Route with vessels view
CREATE OR REPLACE VIEW route_vessels_full AS
SELECT
  rv.route_id,
  rv.vessel_id,
  rv.is_primary,
  v.name AS vessel_name,
  v.vessel_class,
  v.passenger_capacity,
  v.vehicle_capacity,
  vt.wind_limit_mph,
  vt.gust_limit_mph,
  vt.directional_sensitivity,
  vt.advisory_sensitivity
FROM route_vessels rv
JOIN vessels v ON rv.vessel_id = v.vessel_id
LEFT JOIN vessel_thresholds vt ON v.vessel_id = vt.vessel_id
WHERE v.active = true;
