'use client';

/**
 * Betting Context
 *
 * React context for managing betting mode state across the app.
 * Handles user settings, bankroll, and active bets.
 *
 * CRITICAL: Betting mode is disabled by default. Users must explicitly
 * opt-in via the settings toggle.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type {
  Bet,
  BetType,
  BetSize,
  UserBankroll,
  BettingSettings,
  LanguageMode,
  LanguageStrings,
  LeaderboardEntry,
  DailyCrown,
} from './types';
import {
  DEFAULT_BETTING_SETTINGS,
  DEFAULT_BANKROLL,
  NEUTRAL_LANGUAGE,
  BETTING_LANGUAGE,
} from './types';
import { getOddsForBetType, calculateProfit } from './odds';

// ============================================================
// STATE
// ============================================================

interface BettingState {
  // Settings
  settings: BettingSettings;
  languageMode: LanguageMode;
  language: LanguageStrings;

  // Bankroll
  bankroll: UserBankroll;

  // Active bets
  bets: Map<string, Bet>; // keyed by sailingId

  // Leaderboard cache
  leaderboard: {
    daily: LeaderboardEntry[];
    allTime: LeaderboardEntry[];
    crown: DailyCrown | null;
    loadedAt: number | null;
  };

  // UI state
  isLoading: boolean;
  error: string | null;
}

const initialState: BettingState = {
  settings: DEFAULT_BETTING_SETTINGS,
  languageMode: 'neutral',
  language: NEUTRAL_LANGUAGE,
  bankroll: {
    userId: '',
    balance: DEFAULT_BANKROLL.balance,
    dailyLimit: DEFAULT_BANKROLL.dailyLimit,
    spentToday: DEFAULT_BANKROLL.spentToday,
    lastReplenishDate: new Date().toISOString().split('T')[0],
  },
  bets: new Map(),
  leaderboard: {
    daily: [],
    allTime: [],
    crown: null,
    loadedAt: null,
  },
  isLoading: false,
  error: null,
};

// ============================================================
// ACTIONS
// ============================================================

type BettingAction =
  | { type: 'SET_SETTINGS'; payload: BettingSettings }
  | { type: 'TOGGLE_BETTING_MODE'; payload: boolean }
  | { type: 'SET_BANKROLL'; payload: UserBankroll }
  | { type: 'PLACE_BET'; payload: Bet }
  | { type: 'UPDATE_BET'; payload: { sailingId: string; updates: Partial<Bet> } }
  | { type: 'RESOLVE_BET'; payload: { sailingId: string; outcome: 'sailed' | 'canceled' } }
  | { type: 'SET_LEADERBOARD'; payload: { daily: LeaderboardEntry[]; allTime: LeaderboardEntry[]; crown: DailyCrown | null } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'REPLENISH_DAILY' };

function bettingReducer(state: BettingState, action: BettingAction): BettingState {
  switch (action.type) {
    case 'SET_SETTINGS':
      return {
        ...state,
        settings: action.payload,
        languageMode: action.payload.enabled ? 'betting' : 'neutral',
        language: action.payload.enabled ? BETTING_LANGUAGE : NEUTRAL_LANGUAGE,
      };

    case 'TOGGLE_BETTING_MODE': {
      const enabled = action.payload;
      return {
        ...state,
        settings: { ...state.settings, enabled },
        languageMode: enabled ? 'betting' : 'neutral',
        language: enabled ? BETTING_LANGUAGE : NEUTRAL_LANGUAGE,
      };
    }

    case 'SET_BANKROLL':
      return {
        ...state,
        bankroll: action.payload,
      };

    case 'PLACE_BET': {
      const newBets = new Map(state.bets);
      newBets.set(action.payload.sailingId, action.payload);
      return {
        ...state,
        bets: newBets,
        bankroll: {
          ...state.bankroll,
          balance: state.bankroll.balance - action.payload.stake,
          spentToday: state.bankroll.spentToday + action.payload.stake,
        },
      };
    }

    case 'UPDATE_BET': {
      const existingBet = state.bets.get(action.payload.sailingId);
      if (!existingBet) return state;

      const newBets = new Map(state.bets);
      newBets.set(action.payload.sailingId, { ...existingBet, ...action.payload.updates });
      return {
        ...state,
        bets: newBets,
      };
    }

    case 'RESOLVE_BET': {
      const bet = state.bets.get(action.payload.sailingId);
      if (!bet) return state;

      const outcome = action.payload.outcome;
      const won = (bet.betType === 'will_sail' && outcome === 'sailed') ||
                  (bet.betType === 'will_cancel' && outcome === 'canceled');

      const profit = won ? calculateProfit(bet.stake, bet.americanOdds) : -bet.stake;
      const newBalance = state.bankroll.balance + (won ? bet.stake + profit : 0);

      const newBets = new Map(state.bets);
      newBets.set(action.payload.sailingId, {
        ...bet,
        status: won ? 'won' : 'lost',
        outcome,
        profit,
        resolvedAt: new Date().toISOString(),
      });

      return {
        ...state,
        bets: newBets,
        bankroll: {
          ...state.bankroll,
          balance: newBalance,
        },
      };
    }

    case 'SET_LEADERBOARD':
      return {
        ...state,
        leaderboard: {
          ...action.payload,
          loadedAt: Date.now(),
        },
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    case 'REPLENISH_DAILY': {
      const today = new Date().toISOString().split('T')[0];
      if (state.bankroll.lastReplenishDate === today) {
        return state; // Already replenished today
      }
      return {
        ...state,
        bankroll: {
          ...state.bankroll,
          balance: DEFAULT_BANKROLL.balance,
          spentToday: 0,
          lastReplenishDate: today,
        },
      };
    }

    default:
      return state;
  }
}

// ============================================================
// CONTEXT
// ============================================================

interface BettingContextValue {
  state: BettingState;

  // Settings
  toggleBettingMode: (enabled: boolean) => void;
  updateSettings: (settings: Partial<BettingSettings>) => void;

  // Betting
  placeBet: (
    sailingId: string,
    betType: BetType,
    stake: BetSize,
    likelihood: number,
    departureTimestampMs: number
  ) => { success: boolean; error?: string };
  getBetForSailing: (sailingId: string) => Bet | undefined;
  canPlaceBet: (stake: BetSize) => boolean;
  getTimeUntilLock: (departureTimestampMs: number) => { minutes: number; locked: boolean };

  // Language helpers
  isBettingMode: boolean;
  lang: LanguageStrings;
}

const BettingContext = createContext<BettingContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

const STORAGE_KEY = 'ferry-betting-state';

export function BettingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(bettingReducer, initialState);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);

        // Restore settings
        if (parsed.settings) {
          dispatch({ type: 'SET_SETTINGS', payload: parsed.settings });
        }

        // Restore bankroll (with daily replenish check)
        if (parsed.bankroll) {
          const today = new Date().toISOString().split('T')[0];
          const bankroll = {
            ...parsed.bankroll,
            // Replenish if new day
            balance: parsed.bankroll.lastReplenishDate !== today
              ? DEFAULT_BANKROLL.balance
              : parsed.bankroll.balance,
            spentToday: parsed.bankroll.lastReplenishDate !== today
              ? 0
              : parsed.bankroll.spentToday,
            lastReplenishDate: today,
          };
          dispatch({ type: 'SET_BANKROLL', payload: bankroll });
        }

        // Restore bets (filter out resolved ones older than 24h)
        if (parsed.bets) {
          const cutoff = Date.now() - (24 * 60 * 60 * 1000);
          Object.entries(parsed.bets).forEach(([sailingId, bet]) => {
            const typedBet = bet as Bet;
            const betTime = new Date(typedBet.placedAt).getTime();
            if (betTime > cutoff || typedBet.status === 'pending' || typedBet.status === 'locked') {
              dispatch({ type: 'PLACE_BET', payload: { ...typedBet, sailingId } });
            }
          });
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    try {
      const toStore = {
        settings: state.settings,
        bankroll: state.bankroll,
        bets: Object.fromEntries(state.bets),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      // Ignore storage errors
    }
  }, [state.settings, state.bankroll, state.bets]);

  // Check for daily replenish
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: 'REPLENISH_DAILY' });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // ============================================================
  // ACTIONS
  // ============================================================

  const toggleBettingMode = useCallback((enabled: boolean) => {
    dispatch({ type: 'TOGGLE_BETTING_MODE', payload: enabled });
  }, []);

  const updateSettings = useCallback((settings: Partial<BettingSettings>) => {
    dispatch({
      type: 'SET_SETTINGS',
      payload: { ...state.settings, ...settings },
    });
  }, [state.settings]);

  const placeBet = useCallback((
    sailingId: string,
    betType: BetType,
    stake: BetSize,
    likelihood: number,
    departureTimestampMs: number
  ): { success: boolean; error?: string } => {
    // Validate betting mode is enabled
    if (!state.settings.enabled) {
      return { success: false, error: 'Betting mode is not enabled' };
    }

    // Validate sufficient balance
    if (stake > state.bankroll.balance) {
      return { success: false, error: 'Insufficient balance' };
    }

    // Validate not already bet on this sailing
    if (state.bets.has(sailingId)) {
      return { success: false, error: 'Already placed a bet on this sailing' };
    }

    // Validate betting window (60 min before departure)
    const minutesUntil = (departureTimestampMs - Date.now()) / (1000 * 60);
    if (minutesUntil < 60) {
      return { success: false, error: 'Betting window has closed' };
    }

    // Calculate odds and payout
    const americanOdds = getOddsForBetType(likelihood, betType);
    const potentialPayout = calculateProfit(stake, americanOdds) + stake;

    const bet: Bet = {
      id: `${sailingId}-${Date.now()}`,
      userId: state.bankroll.userId || 'anonymous',
      sailingId,
      betType,
      stake,
      likelihoodSnapshot: likelihood,
      americanOdds,
      potentialPayout,
      placedAt: new Date().toISOString(),
      lockedAt: null,
      resolvedAt: null,
      status: 'pending',
      outcome: null,
      profit: null,
    };

    dispatch({ type: 'PLACE_BET', payload: bet });
    return { success: true };
  }, [state.settings.enabled, state.bankroll.balance, state.bankroll.userId, state.bets]);

  const getBetForSailing = useCallback((sailingId: string): Bet | undefined => {
    return state.bets.get(sailingId);
  }, [state.bets]);

  const canPlaceBet = useCallback((stake: BetSize): boolean => {
    return state.settings.enabled && stake <= state.bankroll.balance;
  }, [state.settings.enabled, state.bankroll.balance]);

  const getTimeUntilLock = useCallback((departureTimestampMs: number): { minutes: number; locked: boolean } => {
    const minutesUntil = (departureTimestampMs - Date.now()) / (1000 * 60);
    const lockMinutes = minutesUntil - 60; // Lock 60 min before departure

    return {
      minutes: Math.max(0, Math.floor(lockMinutes)),
      locked: lockMinutes <= 0,
    };
  }, []);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value: BettingContextValue = {
    state,
    toggleBettingMode,
    updateSettings,
    placeBet,
    getBetForSailing,
    canPlaceBet,
    getTimeUntilLock,
    isBettingMode: state.settings.enabled,
    lang: state.language,
  };

  return (
    <BettingContext.Provider value={value}>
      {children}
    </BettingContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

export function useBetting(): BettingContextValue {
  const context = useContext(BettingContext);
  if (!context) {
    throw new Error('useBetting must be used within a BettingProvider');
  }
  return context;
}

/**
 * Hook to check if betting mode is available
 * Returns false if context is not mounted (SSR safety)
 */
export function useBettingAvailable(): boolean {
  const context = useContext(BettingContext);
  return context !== null;
}
