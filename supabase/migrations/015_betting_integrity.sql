-- ============================================================================
-- PHASE 87: BETTING INTEGRITY
-- ============================================================================
-- Enforces betting integrity constraints and prepares for settlement.
-- Safe to run multiple times (idempotent).
--
-- This migration:
-- 1. Adds unique index on (user_id, sailing_id) if not exists
-- 2. Adds points_awarded column for settlement if not exists

SET search_path TO ferry_forecast, public;

-- ============================================
-- 1. UNIQUE INDEX: ONE BET PER SAILING PER USER
-- ============================================
-- Note: unique_user_sailing constraint already exists from migration 012.
-- This creates an explicit index for query performance if it doesn't exist.

CREATE UNIQUE INDEX IF NOT EXISTS idx_bets_unique_user_sailing
  ON ferry_forecast.bets (user_id, sailing_id);

-- ============================================
-- 2. SETTLEMENT COLUMNS
-- ============================================
-- resolved_at already exists from migration 012.
-- Add points_awarded for settlement tracking.

ALTER TABLE ferry_forecast.bets
  ADD COLUMN IF NOT EXISTS points_awarded INTEGER;
