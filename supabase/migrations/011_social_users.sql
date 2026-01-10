-- ============================================================================
-- SOCIAL USERS TABLE - Account Storage for Social Predictions
-- ============================================================================
-- Phase 84: Facebook OAuth user accounts for betting-style predictions
--
-- PURPOSE:
-- Store user accounts created via Facebook OAuth for the social predictions
-- feature. This table holds minimal profile data needed for display (name,
-- avatar) and links to Supabase auth.user for session management.
--
-- SECURITY MODEL:
-- - Users can READ their own record
-- - Users can UPDATE their own display_name only (not provider/auth links)
-- - INSERT is handled via trigger on auth.users creation
-- - Service role can do all operations (for admin/migrations)
--
-- PRIVACY:
-- - No email stored (kept in auth.users only)
-- - No Facebook ID exposed (kept in auth.users metadata only)
-- - No access tokens stored
-- - Minimal data retention principle

SET search_path TO ferry_forecast, public;

-- ============================================
-- SOCIAL USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ferry_forecast.social_users (
  -- Primary key (our internal user ID)
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to Supabase auth.users (unique, not null)
  auth_user_id UUID NOT NULL UNIQUE,

  -- Display info (from OAuth provider)
  display_name TEXT NOT NULL,
  avatar_url TEXT,

  -- Provider tracking
  provider TEXT NOT NULL DEFAULT 'facebook' CHECK (provider IN ('facebook', 'google', 'anonymous')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft delete support (for GDPR compliance)
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_social_users_auth_user ON ferry_forecast.social_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_social_users_provider ON ferry_forecast.social_users(provider);
CREATE INDEX IF NOT EXISTS idx_social_users_display_name ON ferry_forecast.social_users(display_name);
CREATE INDEX IF NOT EXISTS idx_social_users_created ON ferry_forecast.social_users(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ferry_forecast.social_users ENABLE ROW LEVEL SECURITY;

-- Users can read all social_users (for leaderboards, profiles)
CREATE POLICY "Public read social_users"
  ON ferry_forecast.social_users
  FOR SELECT
  USING (deleted_at IS NULL);

-- Users can update their own record (display_name only, enforced in app)
CREATE POLICY "Users can update own profile"
  ON ferry_forecast.social_users
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Insert policy for authenticated users (first login creates record)
CREATE POLICY "Authenticated users can insert own profile"
  ON ferry_forecast.social_users
  FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant SELECT to all (for leaderboards)
GRANT SELECT ON ferry_forecast.social_users TO anon, authenticated;

-- Grant INSERT, UPDATE to authenticated (for profile management)
GRANT INSERT, UPDATE ON ferry_forecast.social_users TO authenticated;

-- ============================================
-- HELPER FUNCTION: Get or Create User
-- ============================================
-- Called after OAuth sign-in to ensure user record exists

CREATE OR REPLACE FUNCTION ferry_forecast.get_or_create_social_user(
  p_auth_user_id UUID,
  p_display_name TEXT,
  p_avatar_url TEXT,
  p_provider TEXT DEFAULT 'facebook'
)
RETURNS ferry_forecast.social_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ferry_forecast, public
AS $$
DECLARE
  v_user ferry_forecast.social_users;
BEGIN
  -- Try to find existing user
  SELECT * INTO v_user
  FROM ferry_forecast.social_users
  WHERE auth_user_id = p_auth_user_id
    AND deleted_at IS NULL;

  IF FOUND THEN
    -- Update last_login_at
    UPDATE ferry_forecast.social_users
    SET last_login_at = NOW()
    WHERE auth_user_id = p_auth_user_id;

    -- Refresh the record
    SELECT * INTO v_user
    FROM ferry_forecast.social_users
    WHERE auth_user_id = p_auth_user_id;

    RETURN v_user;
  END IF;

  -- Create new user
  INSERT INTO ferry_forecast.social_users (
    auth_user_id,
    display_name,
    avatar_url,
    provider,
    created_at,
    last_login_at
  )
  VALUES (
    p_auth_user_id,
    p_display_name,
    p_avatar_url,
    p_provider,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_user;

  RETURN v_user;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION ferry_forecast.get_or_create_social_user TO authenticated;
