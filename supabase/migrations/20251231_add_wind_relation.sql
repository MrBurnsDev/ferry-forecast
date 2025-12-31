-- Phase 28: Add wind_relation column to sailing_events
-- Tracks directional wind relation (headwind/crosswind/tailwind) for each sailing event
-- This migration is idempotent-safe (can be run multiple times)

ALTER TABLE ferry_forecast.sailing_events
ADD COLUMN IF NOT EXISTS wind_relation TEXT;

-- Add comment for documentation
COMMENT ON COLUMN ferry_forecast.sailing_events.wind_relation IS 'Wind direction relative to sailing route (headwind, crosswind, tailwind)';
