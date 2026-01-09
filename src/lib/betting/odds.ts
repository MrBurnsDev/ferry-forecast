/**
 * Odds Conversion Utilities
 *
 * Converts likelihood percentages to American odds format for betting UI.
 * These are visual odds only - no real money involved.
 */

import type { OddsDisplay, BetType } from './types';

/**
 * Convert likelihood percentage to American odds
 *
 * American odds format:
 * - Negative (-) odds: Amount you need to bet to win $100
 * - Positive (+) odds: Amount you win on a $100 bet
 *
 * Examples:
 * - 90% → -900 (bet 900 to win 100)
 * - 70% → -233 (bet 233 to win 100)
 * - 50% → +100 (bet 100 to win 100)
 * - 30% → +233 (bet 100 to win 233)
 * - 10% → +900 (bet 100 to win 900)
 */
export function likelihoodToAmericanOdds(likelihood: number): number {
  // Clamp to valid range
  const pct = Math.max(1, Math.min(99, likelihood));

  if (pct >= 50) {
    // Favorite: negative odds
    // Formula: -100 * (probability / (1 - probability))
    const odds = -Math.round((pct / (100 - pct)) * 100);
    return odds;
  } else {
    // Underdog: positive odds
    // Formula: 100 * ((1 - probability) / probability)
    const odds = Math.round(((100 - pct) / pct) * 100);
    return odds;
  }
}

/**
 * Convert American odds to decimal multiplier
 * Used for payout calculations
 *
 * Examples:
 * - -200 → 1.5 (win 50% of stake)
 * - +200 → 3.0 (win 200% of stake)
 * - +100 → 2.0 (win 100% of stake)
 */
export function americanOddsToMultiplier(odds: number): number {
  if (odds < 0) {
    // Negative odds: multiplier = 1 + (100 / |odds|)
    return 1 + (100 / Math.abs(odds));
  } else {
    // Positive odds: multiplier = 1 + (odds / 100)
    return 1 + (odds / 100);
  }
}

/**
 * Calculate potential payout from stake and odds
 */
export function calculatePayout(stake: number, americanOdds: number): number {
  const multiplier = americanOddsToMultiplier(americanOdds);
  return Math.round(stake * multiplier);
}

/**
 * Calculate profit (payout minus stake)
 */
export function calculateProfit(stake: number, americanOdds: number): number {
  const payout = calculatePayout(stake, americanOdds);
  return payout - stake;
}

/**
 * Get full odds display for a sailing based on likelihood
 */
export function getOddsDisplay(likelihood: number): OddsDisplay {
  const sailLikelihood = likelihood;
  const cancelLikelihood = 100 - likelihood;

  return {
    sailOdds: likelihoodToAmericanOdds(sailLikelihood),
    cancelOdds: likelihoodToAmericanOdds(cancelLikelihood),
    sailImplied: sailLikelihood,
    cancelImplied: cancelLikelihood,
  };
}

/**
 * Format American odds for display
 * Always shows + or - prefix
 */
export function formatOdds(odds: number): string {
  if (odds >= 0) {
    return `+${odds}`;
  }
  return `${odds}`;
}

/**
 * Get the odds for a specific bet type
 */
export function getOddsForBetType(likelihood: number, betType: BetType): number {
  const display = getOddsDisplay(likelihood);
  return betType === 'will_sail' ? display.sailOdds : display.cancelOdds;
}

/**
 * Format payout for display
 * Shows potential winnings clearly
 */
export function formatPotentialPayout(stake: number, odds: number): string {
  const profit = calculateProfit(stake, odds);
  if (profit > 0) {
    return `Win ${profit} pts`;
  }
  return `Win ${profit} pts`;
}

/**
 * Get risk assessment based on odds
 * Higher positive odds = higher risk, higher reward
 */
export function getOddsRiskLevel(odds: number): 'safe' | 'moderate' | 'risky' | 'longshot' {
  if (odds <= -300) return 'safe';      // Heavy favorite
  if (odds <= -100) return 'moderate';  // Slight favorite
  if (odds <= +200) return 'risky';     // Slight underdog
  return 'longshot';                     // Heavy underdog
}

/**
 * Calculate the "value" of a bet
 * Compares implied odds to actual likelihood
 * Positive value = good bet, negative = bad bet
 *
 * Note: Since we use the actual likelihood to set odds,
 * value is always 0 (fair odds). This is intentional for
 * the game - we're not a real sportsbook with a vig.
 *
 * @returns 0 for fair odds (no edge in this game)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function calculateBetValue(likelihood: number, betType: BetType): number {
  // Since our odds are derived directly from likelihood,
  // there's no edge - this is a fair game
  // Returns 0 to indicate fair odds
  return 0;
}

/**
 * Get time bonus multiplier
 * Earlier bets get a small bonus (locked in before conditions change)
 *
 * Bonus schedule:
 * - >24h before: 1.1x (10% bonus)
 * - >12h before: 1.05x (5% bonus)
 * - >6h before: 1.02x (2% bonus)
 * - <6h before: 1.0x (no bonus)
 */
export function getTimeBonus(departureTimestampMs: number): number {
  const now = Date.now();
  const hoursUntil = (departureTimestampMs - now) / (1000 * 60 * 60);

  if (hoursUntil > 24) return 1.1;
  if (hoursUntil > 12) return 1.05;
  if (hoursUntil > 6) return 1.02;
  return 1.0;
}

/**
 * Calculate final payout with time bonus applied
 */
export function calculateFinalPayout(
  stake: number,
  americanOdds: number,
  departureTimestampMs: number
): { basePayout: number; timeBonus: number; finalPayout: number } {
  const basePayout = calculatePayout(stake, americanOdds);
  const timeBonus = getTimeBonus(departureTimestampMs);
  const finalPayout = Math.round(basePayout * timeBonus);

  return {
    basePayout,
    timeBonus,
    finalPayout,
  };
}
