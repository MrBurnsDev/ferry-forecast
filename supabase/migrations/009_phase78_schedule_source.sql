-- ============================================================
-- PHASE 78.1: SSA FULL DAY SCHEDULE INGESTION
-- ============================================================
--
-- MANUAL APPLY INSTRUCTIONS:
-- 1. Open Supabase SQL Editor
-- 2. Paste this ENTIRE file
-- 3. Click "Run"
-- 4. If any step fails, fix the issue and re-run (migration is idempotent)
--
-- This migration is ORDERED and IDEMPOTENT:
-- A. Add schedule_source column (if not exists)
-- B. Backfill NULL values with default
-- C. De-duplicate rows that would block unique index
-- D. Create unique index (if not exists)
-- E. Add CHECK constraint (if not exists)
-- F. Create views/functions (uses CREATE OR REPLACE)
--
-- CANONICAL schedule_source VALUES:
-- - 'operator_snapshot': Full-day schedule from operator (base schedule)
-- - 'operator_status': Status-only update from operator (overlay)
-- - 'template': Static fallback (only when no operator data)
-- ============================================================

-- ============================================================
-- STEP A: ADD schedule_source COLUMN IF NOT EXISTS
-- ============================================================
-- Must run FIRST before any queries that reference the column

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ferry_forecast'
    AND table_name = 'sailing_events'
    AND column_name = 'schedule_source'
  ) THEN
    ALTER TABLE ferry_forecast.sailing_events
    ADD COLUMN schedule_source TEXT;

    RAISE NOTICE 'Added schedule_source column';
  ELSE
    RAISE NOTICE 'schedule_source column already exists';
  END IF;
END $$;

-- ============================================================
-- STEP B: BACKFILL NULL schedule_source VALUES
-- ============================================================
-- Set existing rows to 'operator_status' as safe default
-- (they were status overlay updates before Phase 78.1)

UPDATE ferry_forecast.sailing_events
SET schedule_source = 'operator_status'
WHERE schedule_source IS NULL;

-- Log how many rows were backfilled
DO $$
DECLARE
  backfilled_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backfilled_count
  FROM ferry_forecast.sailing_events
  WHERE schedule_source = 'operator_status';

  RAISE NOTICE 'Rows with schedule_source=operator_status: %', backfilled_count;
END $$;

-- ============================================================
-- STEP C: DE-DUPLICATE ROWS BLOCKING UNIQUE INDEX
-- ============================================================
-- Natural key: (operator_id, service_date, from_port, to_port, departure_time)
-- Keep the NEWEST row per key (by observed_at, then created_at, then id)
-- Delete older duplicates

-- First, show how many duplicates exist (for logging)
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT operator_id, service_date, from_port, to_port, departure_time
    FROM ferry_forecast.sailing_events
    GROUP BY operator_id, service_date, from_port, to_port, departure_time
    HAVING COUNT(*) > 1
  ) dupes;

  RAISE NOTICE 'Duplicate key groups found: %', dup_count;
END $$;

-- Delete duplicates, keeping only the newest row per natural key
-- Uses window function with deterministic ordering
DELETE FROM ferry_forecast.sailing_events
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
  PARTITION BY operator_id, service_date, from_port, to_port, departure_time
  ORDER BY
    observed_at DESC NULLS LAST,
    created_at DESC NULLS LAST,
    id DESC
) AS rn

    FROM ferry_forecast.sailing_events
  ) ranked
  WHERE rn > 1  -- Keep only the first (newest) row per partition
);

-- Log how many rows remain
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM ferry_forecast.sailing_events;
  RAISE NOTICE 'Rows remaining after de-dupe: %', remaining_count;
END $$;

-- ============================================================
-- STEP D: CREATE UNIQUE INDEX (IF NOT EXISTS)
-- ============================================================
-- This enforces idempotent upserts going forward

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'ferry_forecast'
    AND tablename = 'sailing_events'
    AND indexname = 'sailing_events_natural_key_unique'
  ) THEN
    CREATE UNIQUE INDEX sailing_events_natural_key_unique
    ON ferry_forecast.sailing_events (operator_id, service_date, from_port, to_port, departure_time);

    RAISE NOTICE 'Created unique index sailing_events_natural_key_unique';
  ELSE
    RAISE NOTICE 'Unique index sailing_events_natural_key_unique already exists';
  END IF;
END $$;

-- ============================================================
-- STEP E: ADD CHECK CONSTRAINT (IF NOT EXISTS)
-- ============================================================
-- Allows canonical values + legacy values for backwards compatibility

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sailing_events_schedule_source_check'
    AND conrelid = 'ferry_forecast.sailing_events'::regclass
  ) THEN
    ALTER TABLE ferry_forecast.sailing_events
    ADD CONSTRAINT sailing_events_schedule_source_check
    CHECK (schedule_source IN (
      'operator_snapshot',   -- Phase 78.1: Full daily schedule (BASE LAYER)
      'operator_status',     -- Phase 78.1: Status-only update
      'template',            -- Phase 78.1: Static fallback
      'operator_live',       -- Legacy: same as operator_status
      'operator_scraped',    -- Legacy: same as operator_snapshot
      'operator_published'   -- Legacy: same as operator_snapshot
    ));

    RAISE NOTICE 'Added CHECK constraint for schedule_source';
  ELSE
    RAISE NOTICE 'CHECK constraint already exists';
  END IF;
END $$;

-- Add column comment
COMMENT ON COLUMN ferry_forecast.sailing_events.schedule_source IS
  'Phase 78.1: Canonical source. operator_snapshot=full daily schedule, operator_status=status overlay, template=fallback';

-- ============================================================
-- STEP F: CREATE INDEX FOR schedule_source QUERIES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sailing_events_schedule_source
ON ferry_forecast.sailing_events (operator_id, service_date, schedule_source)
WHERE schedule_source = 'operator_snapshot';

-- ============================================================
-- STEP G: CREATE/REPLACE VIEWS AND FUNCTIONS
-- ============================================================
-- These use CREATE OR REPLACE so they're always idempotent

-- View: Today's operator schedule sailings
CREATE OR REPLACE VIEW ferry_forecast.v_today_operator_schedule AS
SELECT
  operator_id,
  service_date,
  from_port,
  to_port,
  departure_time,
  status,
  status_message,
  schedule_source,
  observed_at,
  source
FROM ferry_forecast.sailing_events
WHERE service_date = CURRENT_DATE
  AND schedule_source IN ('operator_snapshot', 'operator_status', 'operator_live', 'operator_scraped')
ORDER BY departure_time ASC;

COMMENT ON VIEW ferry_forecast.v_today_operator_schedule IS
  'Phase 78.1: Today''s operator-sourced sailings. If this has rows, templates should NOT be used.';

-- Function: Check if operator has schedule for date
CREATE OR REPLACE FUNCTION ferry_forecast.has_operator_schedule(
  p_operator_id TEXT,
  p_service_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  has_schedule BOOLEAN,
  sailing_count INTEGER,
  distinct_times INTEGER
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    COUNT(*) > 0 AS has_schedule,
    COUNT(*)::INTEGER AS sailing_count,
    COUNT(DISTINCT departure_time)::INTEGER AS distinct_times
  FROM ferry_forecast.sailing_events
  WHERE operator_id = p_operator_id
    AND service_date = p_service_date
    AND schedule_source IS NOT NULL;
$$;

COMMENT ON FUNCTION ferry_forecast.has_operator_schedule IS
  'Phase 78.1: Check if operator has ingested schedule data for a date.';

-- ============================================================
-- FINAL VERIFICATION
-- ============================================================

DO $$
DECLARE
  col_exists BOOLEAN;
  idx_exists BOOLEAN;
  dup_count INTEGER;
BEGIN
  -- Check column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ferry_forecast'
    AND table_name = 'sailing_events'
    AND column_name = 'schedule_source'
  ) INTO col_exists;

  -- Check index exists
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'ferry_forecast'
    AND tablename = 'sailing_events'
    AND indexname = 'sailing_events_natural_key_unique'
  ) INTO idx_exists;

  -- Check for remaining duplicates
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT operator_id, service_date, from_port, to_port, departure_time
    FROM ferry_forecast.sailing_events
    GROUP BY operator_id, service_date, from_port, to_port, departure_time
    HAVING COUNT(*) > 1
  ) dupes;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'PHASE 78.1 MIGRATION VERIFICATION';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'schedule_source column exists: %', col_exists;
  RAISE NOTICE 'unique index exists: %', idx_exists;
  RAISE NOTICE 'remaining duplicates: %', dup_count;

  IF col_exists AND idx_exists AND dup_count = 0 THEN
    RAISE NOTICE 'STATUS: SUCCESS - Migration complete';
  ELSE
    RAISE WARNING 'STATUS: INCOMPLETE - Check issues above';
  END IF;
  RAISE NOTICE '========================================';
END $$;
