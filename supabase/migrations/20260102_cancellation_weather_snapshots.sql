-- Phase 50: Cancellation Weather Snapshots
-- Stores immutable weather observations at the moment of cancellation
--
-- This table captures weather data from multiple sources (NDBC buoys, NWS stations)
-- when a sailing first transitions to status='canceled'.
--
-- IMMUTABILITY RULES:
-- 1. One sailing_event_id → one row per source/location combination
-- 2. NEVER update a row once inserted
-- 3. NEVER delete rows (historical record)

-- Create the cancellation_weather_snapshots table
CREATE TABLE IF NOT EXISTS ferry_forecast.cancellation_weather_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to the canceled sailing
  sailing_event_id UUID NOT NULL REFERENCES ferry_forecast.sailing_events(id) ON DELETE CASCADE,

  -- Source identification
  source TEXT NOT NULL,                    -- 'ndbc' | 'nws_station' | 'noaa_grid'
  location_type TEXT NOT NULL,             -- 'buoy' | 'land_station' | 'gridpoint'
  location_id TEXT NOT NULL,               -- Station ID (e.g., '44020', 'KHYA')
  location_name TEXT,                      -- Human-readable name
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),

  -- Timing
  observation_time TIMESTAMPTZ NOT NULL,   -- When the weather was observed
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When we captured it

  -- Wind data (primary for ferry ops)
  wind_speed_mph DECIMAL(5,1),
  wind_direction_deg INTEGER,
  wind_gusts_mph DECIMAL(5,1),

  -- Wave data (from buoys)
  wave_height_ft DECIMAL(4,1),
  wave_period_sec DECIMAL(4,1),

  -- Temperature
  water_temp_f DECIMAL(4,1),
  air_temp_f DECIMAL(5,1),

  -- Atmospheric
  pressure_mb DECIMAL(6,1),
  visibility_mi DECIMAL(5,1),

  -- Raw data for debugging and future analysis
  raw_data JSONB,

  -- Fetch performance
  fetch_latency_ms INTEGER,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immutability enforced via unique constraint
-- One snapshot per sailing_event + source + location
-- This prevents duplicate inserts on retry
CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_weather_unique
  ON ferry_forecast.cancellation_weather_snapshots(sailing_event_id, source, location_id);

-- Fast lookup by sailing event
CREATE INDEX IF NOT EXISTS idx_cancellation_weather_sailing
  ON ferry_forecast.cancellation_weather_snapshots(sailing_event_id);

-- Query by source for analysis
CREATE INDEX IF NOT EXISTS idx_cancellation_weather_source
  ON ferry_forecast.cancellation_weather_snapshots(source, captured_at DESC);

-- Add comments for documentation
COMMENT ON TABLE ferry_forecast.cancellation_weather_snapshots IS
  'Phase 50: Immutable weather snapshots captured at the moment of sailing cancellation. Used for ML training and post-hoc analysis.';

COMMENT ON COLUMN ferry_forecast.cancellation_weather_snapshots.source IS
  'Weather data source: ndbc (buoy), nws_station (airport METAR), noaa_grid (gridpoint forecast)';

COMMENT ON COLUMN ferry_forecast.cancellation_weather_snapshots.observation_time IS
  'When the weather observation was recorded at the source station';

COMMENT ON COLUMN ferry_forecast.cancellation_weather_snapshots.captured_at IS
  'When Ferry Forecast captured this snapshot (always at cancellation time)';

-- Grant access (adjust as needed for your Supabase setup)
-- GRANT SELECT, INSERT ON ferry_forecast.cancellation_weather_snapshots TO service_role;
-- GRANT SELECT ON ferry_forecast.cancellation_weather_snapshots TO anon;
