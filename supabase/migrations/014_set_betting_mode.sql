-- ============================================================================
-- PHASE 86B: SET BETTING MODE RPC
-- ============================================================================
-- Allows authenticated users to toggle their betting mode setting.
-- Uses SECURITY DEFINER to bypass RLS for the update operation.

SET search_path TO ferry_forecast, public;

-- ============================================
-- SET BETTING MODE FUNCTION
-- ============================================
-- Called from client to toggle betting mode on/off
-- Uses auth.uid() to identify the calling user

CREATE OR REPLACE FUNCTION ferry_forecast.set_betting_mode(
  p_enabled BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ferry_forecast, public
AS $$
DECLARE
  v_auth_id TEXT;
  v_user_id UUID;
BEGIN
  -- Get the authenticated user's ID
  v_auth_id := auth.uid()::TEXT;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the user by their auth provider ID
  SELECT id INTO v_user_id
  FROM ferry_forecast.users
  WHERE auth_provider_id = v_auth_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Update the betting mode setting
  UPDATE ferry_forecast.users
  SET betting_mode_enabled = p_enabled
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION ferry_forecast.set_betting_mode TO authenticated;
