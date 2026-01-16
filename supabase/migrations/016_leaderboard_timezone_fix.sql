-- ============================================================================
-- PHASE 89.1: LEADERBOARD TIMEZONE FIX + THRESHOLD REMOVAL
-- ============================================================================
-- Fixes:
-- 1. Remove minimum bet thresholds (not needed during early adoption)
-- 2. Use Eastern Time (America/New_York) for "daily" calculations
--    instead of UTC to match the site's operating timezone
--
-- The site operates on Eastern time, so "today's" leaderboard should
-- reflect the Eastern timezone day, not UTC.

SET search_path TO ferry_forecast, public;

-- ============================================
-- 1. UPDATE DAILY LEADERBOARD VIEW
-- ============================================
-- Uses Eastern time for date comparison, removes minimum threshold

DROP VIEW IF EXISTS ferry_forecast.leaderboard_daily;

CREATE OR REPLACE VIEW ferry_forecast.leaderboard_daily AS
SELECT
  u.id AS user_id,
  u.username,
  COALESCE(SUM(
    CASE
      WHEN b.status = 'won' THEN b.payout_points - b.stake_points
      WHEN b.status = 'lost' THEN -b.stake_points
      ELSE 0
    END
  ), 0) AS daily_profit,
  COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) AS bets_today,
  COUNT(b.id) FILTER (WHERE b.status = 'won') AS wins_today,
  CASE
    WHEN COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) > 0
    THEN ROUND(100.0 * COUNT(b.id) FILTER (WHERE b.status = 'won') / COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')), 1)
    ELSE 0
  END AS win_rate_today
FROM ferry_forecast.users u
LEFT JOIN ferry_forecast.bets b ON b.user_id = u.id
  -- Use Eastern time for "today" calculation
  AND (b.resolved_at AT TIME ZONE 'America/New_York')::DATE = (NOW() AT TIME ZONE 'America/New_York')::DATE
WHERE u.betting_mode_enabled = TRUE
GROUP BY u.id, u.username
-- Removed: HAVING COUNT >= 2 threshold
HAVING COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) >= 1  -- At least 1 bet
ORDER BY daily_profit DESC, wins_today DESC
LIMIT 100;

-- ============================================
-- 2. UPDATE ALL-TIME LEADERBOARD VIEW
-- ============================================
-- Removes minimum 10 bet threshold

DROP VIEW IF EXISTS ferry_forecast.leaderboard_all_time;

CREATE OR REPLACE VIEW ferry_forecast.leaderboard_all_time AS
SELECT
  u.id AS user_id,
  u.username,
  COALESCE(SUM(
    CASE
      WHEN b.status = 'won' THEN b.payout_points - b.stake_points
      WHEN b.status = 'lost' THEN -b.stake_points
      ELSE 0
    END
  ), 0) AS all_time_profit,
  COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) AS total_bets,
  COUNT(b.id) FILTER (WHERE b.status = 'won') AS total_wins,
  CASE
    WHEN COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) > 0
    THEN ROUND(100.0 * COUNT(b.id) FILTER (WHERE b.status = 'won') / COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')), 1)
    ELSE 0
  END AS win_rate,
  CASE
    WHEN COALESCE(SUM(b.stake_points), 0) > 0
    THEN ROUND(100.0 * COALESCE(SUM(
      CASE
        WHEN b.status = 'won' THEN b.payout_points - b.stake_points
        WHEN b.status = 'lost' THEN -b.stake_points
        ELSE 0
      END
    ), 0) / SUM(b.stake_points), 1)
    ELSE 0
  END AS roi
FROM ferry_forecast.users u
LEFT JOIN ferry_forecast.bets b ON b.user_id = u.id AND b.status IN ('won', 'lost')
WHERE u.betting_mode_enabled = TRUE
GROUP BY u.id, u.username
-- Removed: HAVING COUNT >= 10 threshold
HAVING COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) >= 1  -- At least 1 bet
ORDER BY all_time_profit DESC, total_wins DESC
LIMIT 100;

-- ============================================
-- 3. UPDATE HELPER FUNCTION: GET DAILY LEADERBOARD BY DATE
-- ============================================
-- Used by win pages to verify a user was the daily winner on a specific date
-- Updated to use Eastern timezone

CREATE OR REPLACE FUNCTION ferry_forecast.get_daily_leaderboard(
  p_date DATE,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  daily_profit INTEGER,
  bets_today BIGINT,
  wins_today BIGINT,
  win_rate_today NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ferry_forecast, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.username,
    COALESCE(SUM(
      CASE
        WHEN b.status = 'won' THEN b.payout_points - b.stake_points
        WHEN b.status = 'lost' THEN -b.stake_points
        ELSE 0
      END
    ), 0)::INTEGER AS daily_profit,
    COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) AS bets_today,
    COUNT(b.id) FILTER (WHERE b.status = 'won') AS wins_today,
    CASE
      WHEN COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) > 0
      THEN ROUND(100.0 * COUNT(b.id) FILTER (WHERE b.status = 'won') / COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')), 1)
      ELSE 0
    END AS win_rate_today
  FROM ferry_forecast.users u
  LEFT JOIN ferry_forecast.bets b ON b.user_id = u.id
    -- Use Eastern time for date comparison
    AND (b.resolved_at AT TIME ZONE 'America/New_York')::DATE = p_date
  WHERE u.betting_mode_enabled = TRUE
  GROUP BY u.id, u.username
  HAVING COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) >= 1  -- At least 1 bet
  ORDER BY daily_profit DESC, wins_today DESC
  LIMIT p_limit;
END;
$$;

-- ============================================
-- 4. GRANTS (re-apply for views)
-- ============================================

GRANT SELECT ON ferry_forecast.leaderboard_daily TO anon, authenticated;
GRANT SELECT ON ferry_forecast.leaderboard_all_time TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ferry_forecast.get_daily_leaderboard TO anon, authenticated;
