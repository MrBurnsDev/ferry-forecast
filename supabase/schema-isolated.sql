-- Ferry Forecast Database Schema (Isolated Schema Version)
-- All tables live in the `ferry_forecast` schema for multi-app Supabase projects
-- Run this in the Supabase SQL Editor

-- ============================================
-- CREATE ISOLATED SCHEMA
-- ============================================

-- Create the ferry_forecast schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS ferry_forecast;

-- Set search path for this session (makes subsequent commands easier)
SET search_path TO ferry_forecast, public;

-- ============================================
-- CLEANUP (for re-running)
-- ============================================

-- Drop existing tables if re-running (in reverse dependency order)
DROP TABLE IF EXISTS ferry_forecast.operator_status_cache CASCADE;
DROP TABLE IF EXISTS ferry_forecast.weather_cache CASCADE;
DROP TABLE IF EXISTS ferry_forecast.disruption_history CASCADE;
DROP TABLE IF EXISTS ferry_forecast.risk_profiles CASCADE;
DROP TABLE IF EXISTS ferry_forecast.vessel_thresholds CASCADE;
DROP TABLE IF EXISTS ferry_forecast.route_vessels CASCADE;
DROP TABLE IF EXISTS ferry_forecast.routes CASCADE;
DROP TABLE IF EXISTS ferry_forecast.vessels CASCADE;
DROP TABLE IF EXISTS ferry_forecast.operators CASCADE;
DROP TABLE IF EXISTS ferry_forecast.ports CASCADE;
DROP TABLE IF EXISTS ferry_forecast.regions CASCADE;

-- Drop existing types if re-running (types are schema-scoped)
DROP TYPE IF EXISTS ferry_forecast.advisory_level CASCADE;
DROP TYPE IF EXISTS ferry_forecast.official_status CASCADE;
DROP TYPE IF EXISTS ferry_forecast.crossing_type CASCADE;
DROP TYPE IF EXISTS ferry_forecast.vessel_class CASCADE;
DROP TYPE IF EXISTS ferry_forecast.confidence_rating CASCADE;

-- ============================================
-- NOTE: Using gen_random_uuid() instead of gen_random_uuid()
-- gen_random_uuid() is built into PostgreSQL 13+ and always available in Supabase
-- ============================================

-- ============================================
-- ENUM TYPES (in ferry_forecast schema)
-- ============================================

CREATE TYPE ferry_forecast.advisory_level AS ENUM (
  'none',
  'small_craft_advisory',
  'gale_warning',
  'storm_warning',
  'hurricane_warning'
);

CREATE TYPE ferry_forecast.official_status AS ENUM (
  'on_time',
  'delayed',
  'canceled',
  'unknown'
);

CREATE TYPE ferry_forecast.crossing_type AS ENUM (
  'open_water',
  'protected',
  'mixed'
);

CREATE TYPE ferry_forecast.vessel_class AS ENUM (
  'large_ferry',
  'fast_ferry',
  'traditional_ferry',
  'high_speed_catamaran'
);

CREATE TYPE ferry_forecast.confidence_rating AS ENUM (
  'low',
  'medium',
  'high'
);

-- ============================================
-- CORE CONFIGURATION TABLES
-- ============================================

-- Regions (e.g., Cape Cod & Islands, Puget Sound, etc.)
CREATE TABLE ferry_forecast.regions (
  region_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ff_regions_slug ON ferry_forecast.regions(slug);
CREATE INDEX idx_ff_regions_active ON ferry_forecast.regions(active);

-- Ports within regions
CREATE TABLE ferry_forecast.ports (
  port_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES ferry_forecast.regions(region_id) ON DELETE CASCADE,
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

CREATE INDEX idx_ff_ports_region ON ferry_forecast.ports(region_id);
CREATE INDEX idx_ff_ports_slug ON ferry_forecast.ports(slug);
CREATE INDEX idx_ff_ports_active ON ferry_forecast.ports(active);

-- Ferry Operators
CREATE TABLE ferry_forecast.operators (
  operator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  website_url TEXT,
  status_page_url TEXT, -- For scraping official status
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ff_operators_slug ON ferry_forecast.operators(slug);
CREATE INDEX idx_ff_operators_active ON ferry_forecast.operators(active);

-- Routes (origin + destination + operator = unique route)
CREATE TABLE ferry_forecast.routes (
  route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES ferry_forecast.regions(region_id) ON DELETE CASCADE,
  origin_port_id UUID NOT NULL REFERENCES ferry_forecast.ports(port_id) ON DELETE CASCADE,
  destination_port_id UUID NOT NULL REFERENCES ferry_forecast.ports(port_id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES ferry_forecast.operators(operator_id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE, -- e.g., 'wh-vh-ssa'
  crossing_type ferry_forecast.crossing_type NOT NULL DEFAULT 'open_water',
  bearing_degrees INTEGER NOT NULL CHECK (bearing_degrees >= 0 AND bearing_degrees < 360),
  typical_duration_minutes INTEGER, -- Crossing time
  distance_nautical_miles DECIMAL(5,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(origin_port_id, destination_port_id, operator_id)
);

CREATE INDEX idx_ff_routes_region ON ferry_forecast.routes(region_id);
CREATE INDEX idx_ff_routes_origin ON ferry_forecast.routes(origin_port_id);
CREATE INDEX idx_ff_routes_destination ON ferry_forecast.routes(destination_port_id);
CREATE INDEX idx_ff_routes_operator ON ferry_forecast.routes(operator_id);
CREATE INDEX idx_ff_routes_slug ON ferry_forecast.routes(slug);
CREATE INDEX idx_ff_routes_active ON ferry_forecast.routes(active);

-- Vessels
CREATE TABLE ferry_forecast.vessels (
  vessel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES ferry_forecast.operators(operator_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vessel_class ferry_forecast.vessel_class NOT NULL DEFAULT 'traditional_ferry',
  year_built INTEGER,
  passenger_capacity INTEGER,
  vehicle_capacity INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(operator_id, name)
);

CREATE INDEX idx_ff_vessels_operator ON ferry_forecast.vessels(operator_id);
CREATE INDEX idx_ff_vessels_class ON ferry_forecast.vessels(vessel_class);
CREATE INDEX idx_ff_vessels_active ON ferry_forecast.vessels(active);

-- Route-Vessel mapping (which vessels can serve which routes)
CREATE TABLE ferry_forecast.route_vessels (
  route_id UUID NOT NULL REFERENCES ferry_forecast.routes(route_id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES ferry_forecast.vessels(vessel_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false, -- Primary vessel for this route
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (route_id, vessel_id)
);

CREATE INDEX idx_ff_route_vessels_route ON ferry_forecast.route_vessels(route_id);
CREATE INDEX idx_ff_route_vessels_vessel ON ferry_forecast.route_vessels(vessel_id);

-- Vessel-specific weather thresholds
CREATE TABLE ferry_forecast.vessel_thresholds (
  threshold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id UUID NOT NULL REFERENCES ferry_forecast.vessels(vessel_id) ON DELETE CASCADE,
  wind_limit_mph INTEGER NOT NULL DEFAULT 35,
  gust_limit_mph INTEGER NOT NULL DEFAULT 50,
  wave_height_limit_ft DECIMAL(4,1),
  directional_sensitivity DECIMAL(3,2) NOT NULL DEFAULT 1.0
    CHECK (directional_sensitivity >= 0.5 AND directional_sensitivity <= 2.0),
  advisory_sensitivity DECIMAL(3,2) NOT NULL DEFAULT 1.0
    CHECK (advisory_sensitivity >= 0.5 AND advisory_sensitivity <= 2.0),
  custom_thresholds JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vessel_id)
);

CREATE INDEX idx_ff_vessel_thresholds_vessel ON ferry_forecast.vessel_thresholds(vessel_id);

-- ============================================
-- OPERATIONAL DATA TABLES
-- ============================================

-- Calculated risk profiles (cached forecasts)
CREATE TABLE ferry_forecast.risk_profiles (
  profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_time TIMESTAMPTZ NOT NULL,
  route_id UUID NOT NULL REFERENCES ferry_forecast.routes(route_id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES ferry_forecast.vessels(vessel_id) ON DELETE SET NULL,
  wind_speed_mph INTEGER NOT NULL,
  wind_gust_mph INTEGER NOT NULL,
  wind_direction_degrees INTEGER NOT NULL CHECK (wind_direction_degrees >= 0 AND wind_direction_degrees < 360),
  advisory_level ferry_forecast.advisory_level NOT NULL DEFAULT 'none',
  wave_height_ft DECIMAL(4,1),
  visibility_nm DECIMAL(4,1),
  tide_height_ft DECIMAL(5,2),
  tide_phase TEXT,
  tide_swing_ft DECIMAL(4,2),
  predicted_score INTEGER NOT NULL CHECK (predicted_score >= 0 AND predicted_score <= 100),
  confidence_rating ferry_forecast.confidence_rating NOT NULL DEFAULT 'low',
  contributing_factors JSONB,
  model_version TEXT NOT NULL,
  official_status ferry_forecast.official_status,
  official_status_source TEXT,
  official_status_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ff_risk_profiles_route ON ferry_forecast.risk_profiles(route_id);
CREATE INDEX idx_ff_risk_profiles_forecast_time ON ferry_forecast.risk_profiles(forecast_time);
CREATE INDEX idx_ff_risk_profiles_route_time ON ferry_forecast.risk_profiles(route_id, forecast_time DESC);

-- Historical disruption records (for learning)
CREATE TABLE ferry_forecast.disruption_history (
  disruption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disruption_date DATE NOT NULL,
  route_id UUID NOT NULL REFERENCES ferry_forecast.routes(route_id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES ferry_forecast.vessels(vessel_id) ON DELETE SET NULL,
  scheduled_sailings INTEGER NOT NULL DEFAULT 0,
  delayed_sailings INTEGER NOT NULL DEFAULT 0,
  canceled_sailings INTEGER NOT NULL DEFAULT 0,
  reason_text TEXT,
  source_url TEXT,
  weather_snapshot JSONB,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ff_disruption_history_route ON ferry_forecast.disruption_history(route_id);
CREATE INDEX idx_ff_disruption_history_date ON ferry_forecast.disruption_history(disruption_date);
CREATE INDEX idx_ff_disruption_history_route_date ON ferry_forecast.disruption_history(route_id, disruption_date DESC);

-- ============================================
-- CACHING TABLES
-- ============================================

-- Weather data cache
CREATE TABLE ferry_forecast.weather_cache (
  cache_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES ferry_forecast.regions(region_id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(region_id, cache_key)
);

CREATE INDEX idx_ff_weather_cache_region ON ferry_forecast.weather_cache(region_id);
CREATE INDEX idx_ff_weather_cache_expires ON ferry_forecast.weather_cache(expires_at);

-- Operator status cache
CREATE TABLE ferry_forecast.operator_status_cache (
  cache_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES ferry_forecast.routes(route_id) ON DELETE CASCADE,
  status ferry_forecast.official_status NOT NULL DEFAULT 'unknown',
  message TEXT,
  effective_time TIMESTAMPTZ,
  source_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(route_id)
);

CREATE INDEX idx_ff_operator_status_route ON ferry_forecast.operator_status_cache(route_id);
CREATE INDEX idx_ff_operator_status_expires ON ferry_forecast.operator_status_cache(expires_at);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp (function in ferry_forecast schema)
CREATE OR REPLACE FUNCTION ferry_forecast.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at_regions
  BEFORE UPDATE ON ferry_forecast.regions
  FOR EACH ROW EXECUTE FUNCTION ferry_forecast.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_ports
  BEFORE UPDATE ON ferry_forecast.ports
  FOR EACH ROW EXECUTE FUNCTION ferry_forecast.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_operators
  BEFORE UPDATE ON ferry_forecast.operators
  FOR EACH ROW EXECUTE FUNCTION ferry_forecast.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_routes
  BEFORE UPDATE ON ferry_forecast.routes
  FOR EACH ROW EXECUTE FUNCTION ferry_forecast.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_vessels
  BEFORE UPDATE ON ferry_forecast.vessels
  FOR EACH ROW EXECUTE FUNCTION ferry_forecast.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_vessel_thresholds
  BEFORE UPDATE ON ferry_forecast.vessel_thresholds
  FOR EACH ROW EXECUTE FUNCTION ferry_forecast.trigger_set_updated_at();

-- Function to clean up expired cache
CREATE OR REPLACE FUNCTION ferry_forecast.cleanup_expired_caches()
RETURNS void AS $$
BEGIN
  DELETE FROM ferry_forecast.weather_cache WHERE expires_at < NOW();
  DELETE FROM ferry_forecast.operator_status_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all ferry_forecast tables
ALTER TABLE ferry_forecast.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.ports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.route_vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.vessel_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.disruption_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.operator_status_cache ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ ACCESS for configuration tables
CREATE POLICY "Public read regions" ON ferry_forecast.regions FOR SELECT USING (true);
CREATE POLICY "Public read ports" ON ferry_forecast.ports FOR SELECT USING (true);
CREATE POLICY "Public read operators" ON ferry_forecast.operators FOR SELECT USING (true);
CREATE POLICY "Public read routes" ON ferry_forecast.routes FOR SELECT USING (true);
CREATE POLICY "Public read vessels" ON ferry_forecast.vessels FOR SELECT USING (true);
CREATE POLICY "Public read route_vessels" ON ferry_forecast.route_vessels FOR SELECT USING (true);
CREATE POLICY "Public read vessel_thresholds" ON ferry_forecast.vessel_thresholds FOR SELECT USING (true);
CREATE POLICY "Public read risk_profiles" ON ferry_forecast.risk_profiles FOR SELECT USING (true);
CREATE POLICY "Public read operator_status_cache" ON ferry_forecast.operator_status_cache FOR SELECT USING (true);

-- SERVICE ROLE ONLY for writes
CREATE POLICY "Service write regions" ON ferry_forecast.regions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update regions" ON ferry_forecast.regions FOR UPDATE USING (true);
CREATE POLICY "Service delete regions" ON ferry_forecast.regions FOR DELETE USING (true);

CREATE POLICY "Service write ports" ON ferry_forecast.ports FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update ports" ON ferry_forecast.ports FOR UPDATE USING (true);
CREATE POLICY "Service delete ports" ON ferry_forecast.ports FOR DELETE USING (true);

CREATE POLICY "Service write operators" ON ferry_forecast.operators FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update operators" ON ferry_forecast.operators FOR UPDATE USING (true);
CREATE POLICY "Service delete operators" ON ferry_forecast.operators FOR DELETE USING (true);

CREATE POLICY "Service write routes" ON ferry_forecast.routes FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update routes" ON ferry_forecast.routes FOR UPDATE USING (true);
CREATE POLICY "Service delete routes" ON ferry_forecast.routes FOR DELETE USING (true);

CREATE POLICY "Service write vessels" ON ferry_forecast.vessels FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update vessels" ON ferry_forecast.vessels FOR UPDATE USING (true);
CREATE POLICY "Service delete vessels" ON ferry_forecast.vessels FOR DELETE USING (true);

CREATE POLICY "Service write route_vessels" ON ferry_forecast.route_vessels FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update route_vessels" ON ferry_forecast.route_vessels FOR UPDATE USING (true);
CREATE POLICY "Service delete route_vessels" ON ferry_forecast.route_vessels FOR DELETE USING (true);

CREATE POLICY "Service write vessel_thresholds" ON ferry_forecast.vessel_thresholds FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update vessel_thresholds" ON ferry_forecast.vessel_thresholds FOR UPDATE USING (true);
CREATE POLICY "Service delete vessel_thresholds" ON ferry_forecast.vessel_thresholds FOR DELETE USING (true);

CREATE POLICY "Service write risk_profiles" ON ferry_forecast.risk_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update risk_profiles" ON ferry_forecast.risk_profiles FOR UPDATE USING (true);
CREATE POLICY "Service delete risk_profiles" ON ferry_forecast.risk_profiles FOR DELETE USING (true);

CREATE POLICY "Service write disruption_history" ON ferry_forecast.disruption_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update disruption_history" ON ferry_forecast.disruption_history FOR UPDATE USING (true);
CREATE POLICY "Service delete disruption_history" ON ferry_forecast.disruption_history FOR DELETE USING (true);

CREATE POLICY "Service write weather_cache" ON ferry_forecast.weather_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update weather_cache" ON ferry_forecast.weather_cache FOR UPDATE USING (true);
CREATE POLICY "Service delete weather_cache" ON ferry_forecast.weather_cache FOR DELETE USING (true);

CREATE POLICY "Service write operator_status_cache" ON ferry_forecast.operator_status_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update operator_status_cache" ON ferry_forecast.operator_status_cache FOR UPDATE USING (true);
CREATE POLICY "Service delete operator_status_cache" ON ferry_forecast.operator_status_cache FOR DELETE USING (true);

-- ============================================
-- VIEWS (in ferry_forecast schema)
-- ============================================

-- Full route view with all related data
CREATE OR REPLACE VIEW ferry_forecast.routes_full AS
SELECT
  r.route_id,
  r.slug AS route_slug,
  r.crossing_type::text,
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
FROM ferry_forecast.routes r
JOIN ferry_forecast.regions reg ON r.region_id = reg.region_id
JOIN ferry_forecast.ports op ON r.origin_port_id = op.port_id
JOIN ferry_forecast.ports dp ON r.destination_port_id = dp.port_id
JOIN ferry_forecast.operators o ON r.operator_id = o.operator_id
WHERE r.active = true
  AND reg.active = true
  AND op.active = true
  AND dp.active = true
  AND o.active = true;

-- Route with vessels view
CREATE OR REPLACE VIEW ferry_forecast.route_vessels_full AS
SELECT
  rv.route_id,
  rv.vessel_id,
  rv.is_primary,
  v.name AS vessel_name,
  v.vessel_class::text,
  v.passenger_capacity,
  v.vehicle_capacity,
  vt.wind_limit_mph,
  vt.gust_limit_mph,
  vt.directional_sensitivity,
  vt.advisory_sensitivity
FROM ferry_forecast.route_vessels rv
JOIN ferry_forecast.vessels v ON rv.vessel_id = v.vessel_id
LEFT JOIN ferry_forecast.vessel_thresholds vt ON v.vessel_id = vt.vessel_id
WHERE v.active = true;

-- ============================================
-- GRANT USAGE ON SCHEMA TO anon AND authenticated ROLES
-- This is required for the Supabase client to access the schema
-- ============================================

GRANT USAGE ON SCHEMA ferry_forecast TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA ferry_forecast TO anon, authenticated;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA ferry_forecast TO anon, authenticated;

-- For future tables created in this schema
ALTER DEFAULT PRIVILEGES IN SCHEMA ferry_forecast GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA ferry_forecast GRANT SELECT ON SEQUENCES TO anon, authenticated;
