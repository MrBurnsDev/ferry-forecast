'use client';

/**
 * Betting Context
 *
 * React context for managing betting mode state across the app.
 * Handles user settings, bankroll, and active bets.
 *
 * CRITICAL: Betting mode is disabled by default. Users must explicitly
 * opt-in via the settings toggle in their account.
 *
 * Phase 85: Now backed by server-side API for persistent betting state.
 * localStorage is only used for unauthenticated UI preferences.
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
import { useAuthSafe } from '@/lib/auth';

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
  isSyncing: boolean;
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
  isSyncing: false,
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
  | { type: 'SET_BETS'; payload: Bet[] }
  | { type: 'UPDATE_BET'; payload: { sailingId: string; updates: Partial<Bet> } }
  | { type: 'RESOLVE_BET'; payload: { sailingId: string; outcome: 'sailed' | 'canceled' } }
  | { type: 'SET_LEADERBOARD'; payload: { daily: LeaderboardEntry[]; allTime: LeaderboardEntry[]; crown: DailyCrown | null } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' };

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

    case 'SET_BETS': {
      const newBets = new Map<string, Bet>();
      action.payload.forEach(bet => {
        newBets.set(bet.sailingId, bet);
      });
      return {
        ...state,
        bets: newBets,
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

    case 'SET_SYNCING':
      return {
        ...state,
        isSyncing: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    case 'RESET_STATE':
      return {
        ...initialState,
      };

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
    corridorId: string,
    betType: BetType,
    stake: BetSize,
    likelihood: number,
    departureTimestampMs: number
  ) => Promise<{ success: boolean; error?: string }>;
  getBetForSailing: (sailingId: string) => Bet | undefined;
  canPlaceBet: (stake: BetSize) => boolean;
  getTimeUntilLock: (departureTimestampMs: number) => { minutes: number; locked: boolean };

  // Sync
  refreshBets: () => Promise<void>;
  refreshLeaderboard: () => Promise<void>;

  // Language helpers
  isBettingMode: boolean;
  lang: LanguageStrings;
}

const BettingContext = createContext<BettingContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function BettingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(bettingReducer, initialState);

  // Use safe auth hook that returns null if outside AuthProvider
  const auth = useAuthSafe();
  const profile = auth?.profile;
  const session = auth?.session;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const userId = session?.user?.id;

  // Sync betting mode from user's profile setting
  useEffect(() => {
    if (isAuthenticated && profile) {
      dispatch({ type: 'TOGGLE_BETTING_MODE', payload: profile.bettingModeEnabled });
    } else if (!isAuthenticated) {
      dispatch({ type: 'RESET_STATE' });
    }
  }, [isAuthenticated, profile]);

  // Fetch user's bets from API on auth
  const refreshBets = useCallback(async () => {
    if (!isAuthenticated) return;

    dispatch({ type: 'SET_SYNCING', payload: true });
    try {
      const response = await fetch('/api/betting/bets');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.bets) {
          // Transform API bets to local format
          const bets: Bet[] = data.bets.map((apiBet: {
            id: string;
            sailingId: string;
            corridorId: string;
            betType: BetType;
            stakePoints: number;
            likelihoodSnapshot: number;
            oddsSnapshot: number;
            payoutPoints: number;
            status: 'pending' | 'locked' | 'won' | 'lost' | 'push';
            placedAt: string;
            lockedAt: string | null;
            resolvedAt: string | null;
          }) => ({
            id: apiBet.id,
            userId: userId || '',
            sailingId: apiBet.sailingId,
            corridorId: apiBet.corridorId,
            betType: apiBet.betType,
            stake: apiBet.stakePoints,
            likelihoodSnapshot: apiBet.likelihoodSnapshot,
            americanOdds: apiBet.oddsSnapshot,
            potentialPayout: apiBet.payoutPoints,
            placedAt: apiBet.placedAt,
            lockedAt: apiBet.lockedAt,
            resolvedAt: apiBet.resolvedAt,
            status: apiBet.status,
            outcome: null,
            profit: apiBet.status === 'won' ? apiBet.payoutPoints - apiBet.stakePoints :
                   apiBet.status === 'lost' ? -apiBet.stakePoints : null,
          }));
          dispatch({ type: 'SET_BETS', payload: bets });
        }
      }
    } catch (err) {
      console.error('[BETTING] Failed to fetch bets:', err);
    } finally {
      dispatch({ type: 'SET_SYNCING', payload: false });
    }
  }, [isAuthenticated, userId]);

  // Fetch bets on initial auth
  useEffect(() => {
    if (isAuthenticated) {
      refreshBets();
    }
  }, [isAuthenticated, refreshBets]);

  // Fetch leaderboard
  const refreshLeaderboard = useCallback(async () => {
    try {
      const response = await fetch('/api/betting/leaderboard');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          dispatch({
            type: 'SET_LEADERBOARD',
            payload: {
              daily: data.daily || [],
              allTime: data.allTime || [],
              crown: null, // TODO: Fetch crown data
            },
          });
        }
      }
    } catch (err) {
      console.error('[BETTING] Failed to fetch leaderboard:', err);
    }
  }, []);

  // ============================================================
  // ACTIONS
  // ============================================================

  const toggleBettingMode = useCallback((enabled: boolean) => {
    // Local UI update - actual persistence is handled by auth context
    dispatch({ type: 'TOGGLE_BETTING_MODE', payload: enabled });
  }, []);

  const updateSettings = useCallback((settings: Partial<BettingSettings>) => {
    dispatch({
      type: 'SET_SETTINGS',
      payload: { ...state.settings, ...settings },
    });
  }, [state.settings]);

  const placeBet = useCallback(async (
    sailingId: string,
    corridorId: string,
    betType: BetType,
    stake: BetSize,
    likelihood: number,
    departureTimestampMs: number
  ): Promise<{ success: boolean; error?: string }> => {
    // Validate betting mode is enabled
    if (!state.settings.enabled) {
      return { success: false, error: 'Betting mode is not enabled' };
    }

    // Validate user is authenticated
    if (!isAuthenticated) {
      return { success: false, error: 'Must be signed in to place bets' };
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

    // Calculate odds for optimistic update
    const americanOdds = getOddsForBetType(likelihood, betType);
    const potentialPayout = calculateProfit(stake, americanOdds) + stake;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const response = await fetch('/api/betting/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sailingId,
          corridorId,
          betType,
          stakePoints: stake,
          likelihood,
          departureTimestampMs,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        dispatch({ type: 'SET_ERROR', payload: data.error || 'Failed to place bet' });
        return { success: false, error: data.error || 'Failed to place bet' };
      }

      // Create bet from server response
      const bet: Bet = {
        id: data.bet.id,
        userId: userId || '',
        sailingId,
        betType,
        stake,
        likelihoodSnapshot: likelihood,
        americanOdds: data.bet.oddsSnapshot || americanOdds,
        potentialPayout: data.bet.payoutPoints || potentialPayout,
        placedAt: data.bet.placedAt || new Date().toISOString(),
        lockedAt: null,
        resolvedAt: null,
        status: 'pending',
        outcome: null,
        profit: null,
      };

      dispatch({ type: 'PLACE_BET', payload: bet });

      // Update bankroll from server
      if (data.newBalance !== undefined) {
        dispatch({
          type: 'SET_BANKROLL',
          payload: {
            ...state.bankroll,
            balance: data.newBalance,
            spentToday: state.bankroll.spentToday + stake,
          },
        });
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, error: message };
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.settings.enabled, state.bankroll, state.bets, isAuthenticated, userId]);

  const getBetForSailing = useCallback((sailingId: string): Bet | undefined => {
    return state.bets.get(sailingId);
  }, [state.bets]);

  const canPlaceBet = useCallback((stake: BetSize): boolean => {
    return state.settings.enabled && isAuthenticated && stake <= state.bankroll.balance;
  }, [state.settings.enabled, state.bankroll.balance, isAuthenticated]);

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
    refreshBets,
    refreshLeaderboard,
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
