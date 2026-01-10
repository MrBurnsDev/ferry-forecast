/**
 * Betting System
 *
 * Opt-in betting-style prediction game for ferry sailings.
 * Points-based, zero-stakes social competition.
 */

// Constants (shared between client and server)
export {
  BETTING_LOCKOUT_MINUTES,
  DEFAULT_STAKE_POINTS,
  INITIAL_BANKROLL_POINTS,
  DAILY_LIMIT_POINTS,
} from './constants';

// Types
export type {
  Bet,
  BetType,
  BetSize,
  BetStatus,
  UserBankroll,
  BettingSettings,
  LanguageMode,
  LanguageStrings,
  LeaderboardEntry,
  DailyCrown,
  OddsDisplay,
  BetResolution,
  PlaceBetRequest,
  PlaceBetResponse,
  LeaderboardResponse,
} from './types';

export {
  BET_SIZES,
  DEFAULT_BANKROLL,
  DEFAULT_BETTING_SETTINGS,
  NEUTRAL_LANGUAGE,
  BETTING_LANGUAGE,
} from './types';

// Odds utilities
export {
  likelihoodToAmericanOdds,
  americanOddsToMultiplier,
  calculatePayout,
  calculateProfit,
  getOddsDisplay,
  formatOdds,
  getOddsForBetType,
  formatPotentialPayout,
  getOddsRiskLevel,
  getTimeBonus,
  calculateFinalPayout,
} from './odds';

// Context and hooks
export {
  BettingProvider,
  useBetting,
  useBettingAvailable,
} from './context';
