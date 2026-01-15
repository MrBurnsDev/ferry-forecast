/**
 * Betting System Types
 *
 * Core type definitions for the opt-in betting-style prediction game.
 * This is a points-based, zero-stakes social game - no money involved.
 */

// ============================================================
// BET TYPES
// ============================================================

export type BetType = 'will_sail' | 'will_cancel';

export type BetStatus =
  | 'pending'      // Bet placed, outcome not yet known
  | 'locked'       // Bet locked (< 60 min before departure)
  | 'won'          // Outcome resolved - user won
  | 'lost'         // Outcome resolved - user lost
  | 'push';        // Edge case - stake returned (e.g., no outcome data)

export interface Bet {
  id: string;
  userId: string;
  sailingId: string;
  corridorId: string;              // Corridor for linking (e.g., 'woods-hole-vineyard-haven')
  betType: BetType;
  stake: number;                    // Points wagered
  likelihoodSnapshot: number;       // Likelihood at bet time (0-100)
  americanOdds: number;            // Display odds at bet time
  potentialPayout: number;         // Calculated at bet time
  placedAt: string;                // ISO timestamp
  lockedAt: string | null;         // When bet was locked (60 min before departure)
  resolvedAt: string | null;       // When outcome was determined
  status: BetStatus;
  outcome: 'sailed' | 'canceled' | null;  // Actual outcome
  profit: number | null;           // Net profit/loss after resolution
}

// ============================================================
// BANKROLL
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

export const BET_SIZES = [10, 25, 50, 100] as const;
export type BetSize = typeof BET_SIZES[number];

// ============================================================
// ODDS CONVERSION
// ============================================================

/**
 * Odds display for betting mode
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
  totalBets: number;
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

export interface BettingSettings {
  enabled: boolean;        // Betting mode toggle
  soundsEnabled: boolean;  // Sound effects for wins/losses
  showOdds: boolean;       // Show American odds (vs just %)
}

export const DEFAULT_BETTING_SETTINGS: BettingSettings = {
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
 * - 'betting': Sports betting terminology (bet, odds, stake, win, lose)
 */
export type LanguageMode = 'neutral' | 'betting';

export interface LanguageStrings {
  // Actions
  placeAction: string;     // "Predict" vs "Bet"
  stakeLabel: string;      // "Confidence" vs "Stake"

  // Outcomes
  correctLabel: string;    // "Correct" vs "Won"
  incorrectLabel: string;  // "Incorrect" vs "Lost"

  // Options
  sailOption: string;      // "Will sail" vs "Bet: WILL SAIL"
  cancelOption: string;    // "Will cancel" vs "Bet: WILL CANCEL"

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

export const BETTING_LANGUAGE: LanguageStrings = {
  placeAction: 'Place Bet',
  stakeLabel: 'Stake',
  correctLabel: 'Won',
  incorrectLabel: 'Lost',
  sailOption: 'WILL SAIL',
  cancelOption: 'WILL CANCEL',
  pointsLabel: 'Profit',
  rankLabel: 'Position',
};

// ============================================================
// RESOLUTION
// ============================================================

export interface BetResolution {
  betId: string;
  sailingId: string;
  outcome: 'sailed' | 'canceled';
  userBetType: BetType;
  won: boolean;
  stake: number;
  payout: number;          // 0 if lost, stake + profit if won
  profit: number;          // Negative if lost
  resolvedAt: string;
}

// ============================================================
// API RESPONSES
// ============================================================

export interface PlaceBetRequest {
  sailingId: string;
  betType: BetType;
  stake: BetSize;
  likelihoodSnapshot: number;
}

export interface PlaceBetResponse {
  success: boolean;
  bet?: Bet;
  error?: string;
  newBalance?: number;
}

export interface LeaderboardResponse {
  daily: LeaderboardEntry[];
  allTime: LeaderboardEntry[];
  crown: DailyCrown | null;
}
