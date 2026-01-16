/**
 * Prediction Game System
 *
 * Opt-in prediction game for ferry sailings.
 * Points-based, zero-stakes social competition.
 *
 * TERMINOLOGY: All "bet/betting" terminology has been replaced with
 * "prediction/game" terminology. Backward compatibility aliases provided.
 */

// Constants (shared between client and server)
export {
  PREDICTION_LOCKOUT_MINUTES,
  BETTING_LOCKOUT_MINUTES, // deprecated alias
  DEFAULT_STAKE_POINTS,
  INITIAL_BANKROLL_POINTS,
  DAILY_LIMIT_POINTS,
} from './constants';

// New terminology types
export type {
  Prediction,
  PredictionChoice,
  PredictionStatus,
  StakeSize,
  UserBankroll,
  GameSettings,
  LanguageMode,
  LanguageStrings,
  LeaderboardEntry,
  DailyCrown,
  OddsDisplay,
  PredictionResolution,
  SubmitPredictionRequest,
  SubmitPredictionResponse,
  LeaderboardResponse,
} from './types';

// Backward compatibility type aliases (deprecated)
export type {
  Bet,
  BetType,
  BetSize,
  BetStatus,
  BettingSettings,
  BetResolution,
  PlaceBetRequest,
  PlaceBetResponse,
} from './types';

// Constants exports
export {
  STAKE_SIZES,
  BET_SIZES, // deprecated alias
  DEFAULT_BANKROLL,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_BETTING_SETTINGS, // deprecated alias
  NEUTRAL_LANGUAGE,
  GAME_LANGUAGE,
  BETTING_LANGUAGE, // deprecated alias
  betToPrediction,
  predictionToBet,
} from './types';

// Odds utilities
export {
  likelihoodToAmericanOdds,
  americanOddsToMultiplier,
  calculatePayout,
  calculateProfit,
  getOddsDisplay,
  formatOdds,
  getOddsForChoice,
  getOddsForBetType, // deprecated alias
  formatPotentialPayout,
  getOddsRiskLevel,
  calculatePredictionValue,
  calculateBetValue, // deprecated alias
  getTimeBonus,
  calculateFinalPayout,
} from './odds';

// Context and hooks - new terminology
export {
  PredictionGameProvider,
  usePredictionGame,
  usePredictionGameAvailable,
} from './context';

// Context and hooks - backward compatibility aliases
export {
  BettingProvider,
  useBetting,
  useBettingAvailable,
} from './context';
