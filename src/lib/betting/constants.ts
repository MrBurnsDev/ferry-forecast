/**
 * Prediction Game Constants
 *
 * Shared constants for prediction system - used by both client and server.
 *
 * TERMINOLOGY: All "bet/betting" terminology has been replaced with
 * "prediction/game" terminology. Backward compatibility aliases provided.
 */

/**
 * Prediction lockout window in minutes.
 * Predictions must be placed at least this many minutes before departure.
 *
 * This value is used:
 * - Server: /api/betting/place route validation
 * - Client: SailingPredictionCard to show disabled state with explanation
 * - Database: place_bet function calculates locked_at
 */
export const PREDICTION_LOCKOUT_MINUTES = 60;

/** @deprecated Use PREDICTION_LOCKOUT_MINUTES instead */
export const BETTING_LOCKOUT_MINUTES = PREDICTION_LOCKOUT_MINUTES;

/**
 * Default stake for all predictions (simplified prediction model)
 */
export const DEFAULT_STAKE_POINTS = 100;

/**
 * Initial bankroll balance for new users
 */
export const INITIAL_BANKROLL_POINTS = 1000;

/**
 * Daily spending limit
 */
export const DAILY_LIMIT_POINTS = 500;
