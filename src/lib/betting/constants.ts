/**
 * Betting Constants
 *
 * Shared constants for betting system - used by both client and server.
 */

/**
 * Betting lockout window in minutes.
 * Bets must be placed at least this many minutes before departure.
 *
 * This value is used:
 * - Server: /api/betting/place route validation
 * - Client: SailingBetCard to show disabled state with explanation
 * - Database: place_bet function calculates locked_at
 */
export const BETTING_LOCKOUT_MINUTES = 60;

/**
 * Default stake for all bets (simplified prediction model)
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
