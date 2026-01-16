/**
 * Prediction Game Types
 *
 * Core type definitions for the opt-in prediction game.
 * This is a points-based, zero-stakes social game - no money involved.
 *
 * TERMINOLOGY REFACTOR: All "bet/betting" terminology has been replaced with
 * "prediction/game" terminology. Backward compatibility aliases are provided
 * at the bottom of this file for any code that hasn't been migrated yet.
 */

// ============================================================
// PREDICTION TYPES
// ============================================================

/**
 * User's prediction choice for a sailing
 * - 'will_sail': User predicts the sailing will operate normally
 * - 'will_cancel': User predicts the sailing will be canceled
 */
export type PredictionChoice = 'will_sail' | 'will_cancel';

/**
 * Status of a user's prediction
 */
export type PredictionStatus =
  | 'pending'      // Prediction placed, outcome not yet known
  | 'locked'       // Prediction locked (< 60 min before departure)
  | 'won'          // Outcome resolved - user was correct
  | 'lost'         // Outcome resolved - user was incorrect
  | 'push';        // Edge case - points returned (e.g., no outcome data)

/**
 * A user's prediction on a sailing
 */
export interface Prediction {
  id: string;
  userId: string;
  sailingId: string;
  corridorId: string;              // Corridor for linking (e.g., 'woods-hole-vineyard-haven')
  choice: PredictionChoice;        // What the user predicted
  /** @deprecated Use choice instead */
  betType?: PredictionChoice;      // Deprecated alias for choice
  stake: number;                    // Points wagered
  likelihoodSnapshot: number;       // Likelihood at prediction time (0-100)
  americanOdds: number;            // Display odds at prediction time
  potentialPayout: number;         // Calculated at prediction time
  placedAt: string;                // ISO timestamp
  lockedAt: string | null;         // When prediction was locked (60 min before departure)
  resolvedAt: string | null;       // When outcome was determined
  status: PredictionStatus;
  outcome: 'sailed' | 'canceled' | null;  // Actual outcome
  profit: number | null;           // Net profit/loss after resolution
}

// ============================================================
// BANKROLL (Points System)
// ============================================================

export interface UserBankroll {
  userId: string;
  balance: number;                 // Current point balance
  dailyLimit: number;              // Max points per day (replenishes)
  spentToday: number;              // Points wagered today
  lastReplenishDate: string;       // ISO date (YYYY-MM-DD)
}

export const DEFAULT_BANKROLL = {
  balance: 1000,
  dailyLimit: 500,
  spentToday: 0,
};

export const STAKE_SIZES = [10, 25, 50, 100] as const;
export type StakeSize = typeof STAKE_SIZES[number];

// ============================================================
// ODDS CONVERSION
// ============================================================

/**
 * Odds display for game mode
 * Converts likelihood percentage to American odds format
 */
export interface OddsDisplay {
  sailOdds: number;        // American odds for "will sail"
  cancelOdds: number;      // American odds for "will cancel"
  sailImplied: number;     // Implied probability for sail (%)
  cancelImplied: number;   // Implied probability for cancel (%)
}

// ============================================================
// LEADERBOARD
// ============================================================

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  dailyProfit: number;
  allTimeProfit: number;
  roi: number;             // Return on investment (%)
  winRate: number;         // Win percentage
  totalPredictions: number;
  biggestWin: number;
  hasCrown: boolean;       // Daily crown holder
}

export interface DailyCrown {
  userId: string;
  displayName: string;
  date: string;            // ISO date
  profit: number;          // Winning profit amount
  awardedAt: string;       // ISO timestamp
}

// ============================================================
// USER SETTINGS
// ============================================================

export interface GameSettings {
  enabled: boolean;        // Game mode toggle
  soundsEnabled: boolean;  // Sound effects for wins/losses
  showOdds: boolean;       // Show American odds (vs just %)
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  enabled: false,          // Disabled by default - explicit opt-in required
  soundsEnabled: true,
  showOdds: true,
};

// ============================================================
// UI LANGUAGE MODES
// ============================================================

/**
 * Language mode determines terminology throughout the UI
 * - 'neutral': Default prediction language (predict, likelihood, outcome)
 * - 'game': Game terminology (predict, odds, stake, correct, incorrect)
 */
export type LanguageMode = 'neutral' | 'game';

export interface LanguageStrings {
  // Actions
  placeAction: string;     // "Predict"
  stakeLabel: string;      // "Confidence" vs "Stake"

  // Outcomes
  correctLabel: string;    // "Correct" vs "Won"
  incorrectLabel: string;  // "Incorrect" vs "Lost"

  // Options
  sailOption: string;      // "Will sail" vs "WILL SAIL"
  cancelOption: string;    // "Will cancel" vs "WILL CANCEL"

  // Leaderboard
  pointsLabel: string;     // "Points" vs "Profit"
  rankLabel: string;       // "Rank" vs "Position"
}

export const NEUTRAL_LANGUAGE: LanguageStrings = {
  placeAction: 'Predict',
  stakeLabel: 'Confidence',
  correctLabel: 'Correct',
  incorrectLabel: 'Incorrect',
  sailOption: 'Will sail',
  cancelOption: 'Will cancel',
  pointsLabel: 'Points',
  rankLabel: 'Rank',
};

export const GAME_LANGUAGE: LanguageStrings = {
  placeAction: 'Make Prediction',
  stakeLabel: 'Stake',
  correctLabel: 'Correct',
  incorrectLabel: 'Incorrect',
  sailOption: 'WILL SAIL',
  cancelOption: 'WILL CANCEL',
  pointsLabel: 'Points',
  rankLabel: 'Position',
};

// ============================================================
// RESOLUTION
// ============================================================

export interface PredictionResolution {
  predictionId: string;
  sailingId: string;
  outcome: 'sailed' | 'canceled';
  userChoice: PredictionChoice;
  won: boolean;
  stake: number;
  payout: number;          // 0 if lost, stake + profit if won
  profit: number;          // Negative if lost
  resolvedAt: string;
}

// ============================================================
// API RESPONSES
// ============================================================

export interface SubmitPredictionRequest {
  sailingId: string;
  choice: PredictionChoice;
  stake: StakeSize;
  likelihoodSnapshot: number;
}

export interface SubmitPredictionResponse {
  success: boolean;
  prediction?: Prediction;
  error?: string;
  newBalance?: number;
}

export interface LeaderboardResponse {
  daily: LeaderboardEntry[];
  allTime: LeaderboardEntry[];
  crown: DailyCrown | null;
}

// ============================================================
// BACKWARD COMPATIBILITY ALIASES
// These aliases maintain compatibility with existing code during migration.
// They will be removed in a future version.
// ============================================================

/** @deprecated Use PredictionChoice instead */
export type BetType = PredictionChoice;

/** @deprecated Use PredictionStatus instead */
export type BetStatus = PredictionStatus;

/** @deprecated Use Prediction instead */
export interface Bet extends Omit<Prediction, 'choice'> {
  betType: PredictionChoice;  // Alias for choice
}

/** @deprecated Use StakeSize instead */
export type BetSize = StakeSize;

/** @deprecated Use STAKE_SIZES instead */
export const BET_SIZES = STAKE_SIZES;

/** @deprecated Use GameSettings instead */
export type BettingSettings = GameSettings;

/** @deprecated Use DEFAULT_GAME_SETTINGS instead */
export const DEFAULT_BETTING_SETTINGS = DEFAULT_GAME_SETTINGS;

/** @deprecated Use GAME_LANGUAGE instead */
export const BETTING_LANGUAGE = GAME_LANGUAGE;

/** @deprecated Use PredictionResolution instead */
export interface BetResolution extends Omit<PredictionResolution, 'predictionId' | 'userChoice'> {
  betId: string;
  userBetType: PredictionChoice;
}

/** @deprecated Use SubmitPredictionRequest instead */
export interface PlaceBetRequest extends Omit<SubmitPredictionRequest, 'choice'> {
  betType: PredictionChoice;
}

/** @deprecated Use SubmitPredictionResponse instead */
export interface PlaceBetResponse extends Omit<SubmitPredictionResponse, 'prediction'> {
  bet?: Prediction;
}

// Helper to convert between Bet and Prediction interfaces
export function betToPrediction(bet: Bet): Prediction {
  const { betType, ...rest } = bet;
  return { ...rest, choice: betType };
}

export function predictionToBet(prediction: Prediction): Bet {
  const { choice, ...rest } = prediction;
  return { ...rest, betType: choice };
}
