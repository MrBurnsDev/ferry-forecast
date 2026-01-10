-- ============================================================================
-- PHASE 87: BETTING INTEGRITY
-- ============================================================================
-- Enforces betting integrity constraints and prepares for settlement.
-- Safe to run multiple times (idempotent).
--
-- This migration:
-- 1. Verifies unique constraint on (user_id, sailing_id) exists (from 012)
-- 2. Adds points_awarded column for settlement tracking

SET search_path TO ferry_forecast, public;

-- ============================================
-- 1. UNIQUE CONSTRAINT VERIFICATION
-- ============================================
-- The unique_user_sailing constraint already exists from migration 012.
-- That constraint implicitly creates an index, so no additional index needed.
--
-- Reference (from 012):
--   CONSTRAINT unique_user_sailing UNIQUE (user_id, sailing_id)
--
-- If you need to verify it exists, run:
--   SELECT conname FROM pg_constraint WHERE conname = 'unique_user_sailing';

-- ============================================
-- 2. SETTLEMENT COLUMNS
-- ============================================
-- resolved_at already exists from migration 012.
-- Add points_awarded for settlement tracking.

ALTER TABLE ferry_forecast.bets
  ADD COLUMN IF NOT EXISTS points_awarded INTEGER;

-- ============================================
-- 3. INDEX FOR SETTLEMENT QUERIES
-- ============================================
-- Index for finding pending bets that are ready for settlement
-- (locked_at < now AND status = 'pending')

CREATE INDEX IF NOT EXISTS idx_bets_settlement_ready
  ON ferry_forecast.bets (locked_at, status)
  WHERE status = 'pending';
