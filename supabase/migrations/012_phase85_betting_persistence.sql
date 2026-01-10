-- ============================================================================
-- PHASE 85: BETTING PERSISTENCE & TRUST LAYER
-- ============================================================================
-- Implements persistent, account-backed betting system with:
-- - Users table (replaces social_users, supports Google/Apple auth)
-- - Bankrolls table (persistent point balances)
-- - Bets table (immutable bet records)
-- - Crowns table (daily achievements)
-- - Leaderboard views (computed rankings)
--
-- IMPORTANT: Facebook auth has been removed. Only Google and Apple supported.

SET search_path TO ferry_forecast, public;

-- ============================================
-- 1. USERS TABLE (Source of Truth)
-- ============================================
-- Replaces social_users with new schema per Phase 85 spec

-- Drop old social_users table (data migration would be done separately)
-- Note: In production, you'd want to migrate existing data first
DROP TABLE IF EXISTS ferry_forecast.social_users CASCADE;

CREATE TABLE ferry_forecast.users (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Public identity
  username TEXT NOT NULL UNIQUE,

  -- Auth provider linkage
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google', 'apple')),
  auth_provider_id TEXT NOT NULL,

  -- Optional email (not user-facing)
  email TEXT,

  -- Betting mode toggle (opt-in)
  betting_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint on provider + provider_id
  CONSTRAINT unique_auth_provider UNIQUE (auth_provider, auth_provider_id)
);

-- Indexes
CREATE INDEX idx_users_username ON ferry_forecast.users(username);
CREATE INDEX idx_users_auth_provider ON ferry_forecast.users(auth_provider);
CREATE INDEX idx_users_created_at ON ferry_forecast.users(created_at DESC);
CREATE INDEX idx_users_betting_mode ON ferry_forecast.users(betting_mode_enabled) WHERE betting_mode_enabled = TRUE;

-- ============================================
-- 2. BANKROLLS TABLE
-- ============================================

CREATE TABLE ferry_forecast.bankrolls (
  -- Primary key = user_id (one bankroll per user)
  user_id UUID PRIMARY KEY REFERENCES ferry_forecast.users(id) ON DELETE CASCADE,

  -- Point balance
  balance_points INTEGER NOT NULL DEFAULT 1000 CHECK (balance_points >= 0),

  -- Daily reset tracking
  daily_limit INTEGER NOT NULL DEFAULT 500,
  spent_today INTEGER NOT NULL DEFAULT 0 CHECK (spent_today >= 0),
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for reset queries
CREATE INDEX idx_bankrolls_last_reset ON ferry_forecast.bankrolls(last_reset_at);

-- ============================================
-- 3. BETS TABLE
-- ============================================

CREATE TABLE ferry_forecast.bets (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL REFERENCES ferry_forecast.users(id) ON DELETE CASCADE,

  -- Sailing reference
  sailing_id TEXT NOT NULL,
  corridor_id TEXT NOT NULL,

  -- Bet details (immutable after placement)
  bet_type TEXT NOT NULL CHECK (bet_type IN ('sail', 'cancel')),
  stake_points INTEGER NOT NULL CHECK (stake_points > 0),

  -- Snapshot values at bet time (never recomputed)
  likelihood_snapshot NUMERIC(5, 2) NOT NULL CHECK (likelihood_snapshot >= 0 AND likelihood_snapshot <= 100),
  odds_snapshot INTEGER NOT NULL, -- American odds
  payout_points INTEGER NOT NULL CHECK (payout_points >= 0),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'push')),

  -- Timestamps
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ, -- When betting closed (60 min before departure)
  resolved_at TIMESTAMPTZ,

  -- Unique constraint: one bet per user per sailing
  CONSTRAINT unique_user_sailing UNIQUE (user_id, sailing_id)
);

-- Indexes
CREATE INDEX idx_bets_user_id ON ferry_forecast.bets(user_id);
CREATE INDEX idx_bets_sailing_id ON ferry_forecast.bets(sailing_id);
CREATE INDEX idx_bets_corridor_id ON ferry_forecast.bets(corridor_id);
CREATE INDEX idx_bets_status ON ferry_forecast.bets(status);
CREATE INDEX idx_bets_placed_at ON ferry_forecast.bets(placed_at DESC);
CREATE INDEX idx_bets_pending ON ferry_forecast.bets(user_id, status) WHERE status = 'pending';

-- ============================================
-- 4. CROWNS TABLE (Achievements)
-- ============================================

CREATE TABLE ferry_forecast.crowns (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id UUID NOT NULL REFERENCES ferry_forecast.users(id) ON DELETE CASCADE,

  -- Crown details
  crown_type TEXT NOT NULL CHECK (crown_type IN ('daily_profit', 'weekly_profit', 'monthly_profit', 'streak')),
  date_awarded DATE NOT NULL,
  profit_amount INTEGER, -- For profit-based crowns

  -- Timestamps
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one crown type per user per date
  CONSTRAINT unique_crown_per_day UNIQUE (user_id, crown_type, date_awarded)
);

-- Indexes
CREATE INDEX idx_crowns_user_id ON ferry_forecast.crowns(user_id);
CREATE INDEX idx_crowns_date ON ferry_forecast.crowns(date_awarded DESC);
CREATE INDEX idx_crowns_type ON ferry_forecast.crowns(crown_type);

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE ferry_forecast.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.bankrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ferry_forecast.crowns ENABLE ROW LEVEL SECURITY;

-- ----- USERS POLICIES -----

-- Anyone can read users (for leaderboards, profiles)
CREATE POLICY "Public read users"
  ON ferry_forecast.users
  FOR SELECT
  USING (TRUE);

-- Users can update their own record
CREATE POLICY "Users update own profile"
  ON ferry_forecast.users
  FOR UPDATE
  USING (id = (SELECT id FROM ferry_forecast.users WHERE auth_provider_id = auth.uid()::TEXT))
  WITH CHECK (id = (SELECT id FROM ferry_forecast.users WHERE auth_provider_id = auth.uid()::TEXT));

-- ----- BANKROLLS POLICIES -----

-- Users can read their own bankroll
CREATE POLICY "Users read own bankroll"
  ON ferry_forecast.bankrolls
  FOR SELECT
  USING (user_id = (SELECT id FROM ferry_forecast.users WHERE auth_provider_id = auth.uid()::TEXT));

-- Users can update their own bankroll (via API only, enforced in app)
CREATE POLICY "Users update own bankroll"
  ON ferry_forecast.bankrolls
  FOR UPDATE
  USING (user_id = (SELECT id FROM ferry_forecast.users WHERE auth_provider_id = auth.uid()::TEXT))
  WITH CHECK (user_id = (SELECT id FROM ferry_forecast.users WHERE auth_provider_id = auth.uid()::TEXT));

-- ----- BETS POLICIES -----

-- Users can read their own bets
CREATE POLICY "Users read own bets"
  ON ferry_forecast.bets
  FOR SELECT
  USING (user_id = (SELECT id FROM ferry_forecast.users WHERE auth_provider_id = auth.uid()::TEXT));

-- Users can insert their own bets
CREATE POLICY "Users insert own bets"
  ON ferry_forecast.bets
  FOR INSERT
  WITH CHECK (user_id = (SELECT id FROM ferry_forecast.users WHERE auth_provider_id = auth.uid()::TEXT));

-- No update policy - bets are immutable after placement
-- Resolution is done via service role / server-side functions

-- ----- CROWNS POLICIES -----

-- Anyone can read crowns (for leaderboards)
CREATE POLICY "Public read crowns"
  ON ferry_forecast.crowns
  FOR SELECT
  USING (TRUE);

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Get or create user on OAuth sign-in
CREATE OR REPLACE FUNCTION ferry_forecast.get_or_create_user(
  p_auth_provider TEXT,
  p_auth_provider_id TEXT,
  p_username TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS ferry_forecast.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ferry_forecast, public
AS $$
DECLARE
  v_user ferry_forecast.users;
  v_username TEXT;
  v_suffix INTEGER := 0;
BEGIN
  -- Try to find existing user
  SELECT * INTO v_user
  FROM ferry_forecast.users
  WHERE auth_provider = p_auth_provider
    AND auth_provider_id = p_auth_provider_id;

  IF FOUND THEN
    -- Update last_login_at
    UPDATE ferry_forecast.users
    SET last_login_at = NOW()
    WHERE id = v_user.id;

    -- Refresh and return
    SELECT * INTO v_user
    FROM ferry_forecast.users
    WHERE id = v_user.id;

    RETURN v_user;
  END IF;

  -- Generate unique username
  v_username := p_username;
  WHILE EXISTS (SELECT 1 FROM ferry_forecast.users WHERE username = v_username) LOOP
    v_suffix := v_suffix + 1;
    v_username := p_username || v_suffix::TEXT;
  END LOOP;

  -- Create new user
  INSERT INTO ferry_forecast.users (
    auth_provider,
    auth_provider_id,
    username,
    email,
    betting_mode_enabled,
    created_at,
    last_login_at
  )
  VALUES (
    p_auth_provider,
    p_auth_provider_id,
    v_username,
    p_email,
    FALSE, -- Betting mode off by default
    NOW(),
    NOW()
  )
  RETURNING * INTO v_user;

  -- Create initial bankroll
  INSERT INTO ferry_forecast.bankrolls (
    user_id,
    balance_points,
    daily_limit,
    spent_today,
    last_reset_at,
    created_at,
    updated_at
  )
  VALUES (
    v_user.id,
    1000, -- Initial balance
    500,  -- Daily limit
    0,
    NOW(),
    NOW(),
    NOW()
  );

  RETURN v_user;
END;
$$;

-- Place a bet (transactional)
CREATE OR REPLACE FUNCTION ferry_forecast.place_bet(
  p_user_id UUID,
  p_sailing_id TEXT,
  p_corridor_id TEXT,
  p_bet_type TEXT,
  p_stake_points INTEGER,
  p_likelihood NUMERIC,
  p_odds INTEGER,
  p_payout_points INTEGER,
  p_departure_time TIMESTAMPTZ
)
RETURNS ferry_forecast.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ferry_forecast, public
AS $$
DECLARE
  v_user ferry_forecast.users;
  v_bankroll ferry_forecast.bankrolls;
  v_bet ferry_forecast.bets;
  v_lock_time TIMESTAMPTZ;
BEGIN
  -- Get user and verify betting mode is enabled
  SELECT * INTO v_user
  FROM ferry_forecast.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF NOT v_user.betting_mode_enabled THEN
    RAISE EXCEPTION 'Betting mode is not enabled';
  END IF;

  -- Get bankroll and verify balance
  SELECT * INTO v_bankroll
  FROM ferry_forecast.bankrolls
  WHERE user_id = p_user_id
  FOR UPDATE; -- Lock row for transaction

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bankroll not found';
  END IF;

  IF v_bankroll.balance_points < p_stake_points THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Verify betting window (>= 60 minutes before departure)
  IF p_departure_time - INTERVAL '60 minutes' <= NOW() THEN
    RAISE EXCEPTION 'Betting window has closed';
  END IF;

  -- Check for existing bet on this sailing
  IF EXISTS (SELECT 1 FROM ferry_forecast.bets WHERE user_id = p_user_id AND sailing_id = p_sailing_id) THEN
    RAISE EXCEPTION 'Already placed a bet on this sailing';
  END IF;

  -- Calculate lock time
  v_lock_time := p_departure_time - INTERVAL '60 minutes';

  -- Deduct stake from bankroll
  UPDATE ferry_forecast.bankrolls
  SET
    balance_points = balance_points - p_stake_points,
    spent_today = spent_today + p_stake_points,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Create bet record
  INSERT INTO ferry_forecast.bets (
    user_id,
    sailing_id,
    corridor_id,
    bet_type,
    stake_points,
    likelihood_snapshot,
    odds_snapshot,
    payout_points,
    status,
    placed_at,
    locked_at
  )
  VALUES (
    p_user_id,
    p_sailing_id,
    p_corridor_id,
    p_bet_type,
    p_stake_points,
    p_likelihood,
    p_odds,
    p_payout_points,
    'pending',
    NOW(),
    v_lock_time
  )
  RETURNING * INTO v_bet;

  RETURN v_bet;
END;
$$;

-- Resolve a bet (called when sailing outcome is known)
CREATE OR REPLACE FUNCTION ferry_forecast.resolve_bet(
  p_bet_id UUID,
  p_outcome TEXT -- 'sailed' or 'canceled'
)
RETURNS ferry_forecast.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ferry_forecast, public
AS $$
DECLARE
  v_bet ferry_forecast.bets;
  v_won BOOLEAN;
  v_new_status TEXT;
BEGIN
  -- Get bet and lock
  SELECT * INTO v_bet
  FROM ferry_forecast.bets
  WHERE id = p_bet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bet not found';
  END IF;

  IF v_bet.status != 'pending' THEN
    -- Already resolved - return existing
    RETURN v_bet;
  END IF;

  -- Determine if won
  v_won := (v_bet.bet_type = 'sail' AND p_outcome = 'sailed')
        OR (v_bet.bet_type = 'cancel' AND p_outcome = 'canceled');

  v_new_status := CASE WHEN v_won THEN 'won' ELSE 'lost' END;

  -- Update bet status
  UPDATE ferry_forecast.bets
  SET
    status = v_new_status,
    resolved_at = NOW()
  WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  -- Update bankroll if won
  IF v_won THEN
    UPDATE ferry_forecast.bankrolls
    SET
      balance_points = balance_points + v_bet.payout_points,
      updated_at = NOW()
    WHERE user_id = v_bet.user_id;
  END IF;

  RETURN v_bet;
END;
$$;

-- Reset bankroll daily (idempotent)
CREATE OR REPLACE FUNCTION ferry_forecast.reset_bankroll_daily(p_user_id UUID)
RETURNS ferry_forecast.bankrolls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ferry_forecast, public
AS $$
DECLARE
  v_bankroll ferry_forecast.bankrolls;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT * INTO v_bankroll
  FROM ferry_forecast.bankrolls
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bankroll not found';
  END IF;

  -- Only reset if not already reset today
  IF v_bankroll.last_reset_at::DATE < v_today THEN
    UPDATE ferry_forecast.bankrolls
    SET
      balance_points = 1000, -- Reset to initial balance
      spent_today = 0,
      last_reset_at = NOW(),
      updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO v_bankroll;
  END IF;

  RETURN v_bankroll;
END;
$$;

-- ============================================
-- 7. LEADERBOARD VIEWS
-- ============================================

-- Daily leaderboard (today's profit)
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
  AND b.resolved_at::DATE = CURRENT_DATE
WHERE u.betting_mode_enabled = TRUE
GROUP BY u.id, u.username
ORDER BY daily_profit DESC, wins_today DESC
LIMIT 100;

-- All-time leaderboard
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
HAVING COUNT(b.id) FILTER (WHERE b.status IN ('won', 'lost')) > 0
ORDER BY all_time_profit DESC, total_wins DESC
LIMIT 100;

-- ============================================
-- 8. GRANTS
-- ============================================

-- Tables
GRANT SELECT ON ferry_forecast.users TO anon, authenticated;
GRANT UPDATE ON ferry_forecast.users TO authenticated;

GRANT SELECT, UPDATE ON ferry_forecast.bankrolls TO authenticated;
GRANT INSERT ON ferry_forecast.bankrolls TO authenticated;

GRANT SELECT, INSERT ON ferry_forecast.bets TO authenticated;

GRANT SELECT ON ferry_forecast.crowns TO anon, authenticated;

-- Views
GRANT SELECT ON ferry_forecast.leaderboard_daily TO anon, authenticated;
GRANT SELECT ON ferry_forecast.leaderboard_all_time TO anon, authenticated;

-- Functions
GRANT EXECUTE ON FUNCTION ferry_forecast.get_or_create_user TO authenticated;
GRANT EXECUTE ON FUNCTION ferry_forecast.place_bet TO authenticated;
GRANT EXECUTE ON FUNCTION ferry_forecast.resolve_bet TO authenticated;
GRANT EXECUTE ON FUNCTION ferry_forecast.reset_bankroll_daily TO authenticated;

-- ============================================
-- 9. CLEANUP OLD FUNCTION
-- ============================================

-- Drop old social_users function
DROP FUNCTION IF EXISTS ferry_forecast.get_or_create_social_user;
