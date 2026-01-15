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
 * Phase 86E: Uses Bearer token auth instead of cookies for all betting API calls.
 * Phase 86F: Simplified to thumbs up/down model - frontend sends intent only,
 *            server computes all betting math (odds, stake, payout).
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
  // Phase 86F: BetSize no longer used - server uses default stake
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
import { BETTING_LOCKOUT_MINUTES } from './constants';
// Phase 86F: calculateProfit still needed for RESOLVE_BET action (local resolution)
import { calculateProfit } from './odds';
import { useAuthSafe } from '@/lib/auth';
import { mapToApiBetType, mapFromApiBetType, type PlaceBetRequest } from '@/types/betting-api';

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

  /**
   * CRITICAL: This is the ONLY gate for betting UI visibility.
   * Derived from profile?.bettingModeEnabled === true
   * If false, NO betting UI should render (not disabled, not greyed - absent).
   */
  bettingEnabled: boolean;

  // Settings
  toggleBettingMode: (enabled: boolean) => void;
  updateSettings: (settings: Partial<BettingSettings>) => void;

  // Betting - Phase 86F: simplified to intent-only
  placeBet: (
    sailingId: string,
    corridorId: string,
    betType: BetType
  ) => Promise<{ success: boolean; error?: string }>;
  getBetForSailing: (sailingId: string) => Bet | undefined;
  canPlaceBet: () => boolean;
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
  const accessToken = session?.access_token;
  const userId = session?.user?.id;

  /**
   * CRITICAL: Single source of truth for betting UI visibility.
   * This is derived ONLY from the database-backed profile setting.
   * - Default is FALSE (betting is opt-in)
   * - If profile fails to load, this is FALSE
   * - If user signs out, this becomes FALSE immediately
   */
  const bettingEnabled = profile?.bettingModeEnabled === true;

  // Sync betting mode from user's profile setting
  useEffect(() => {
    if (isAuthenticated && profile) {
      dispatch({ type: 'TOGGLE_BETTING_MODE', payload: profile.bettingModeEnabled });
    } else if (!isAuthenticated) {
      dispatch({ type: 'RESET_STATE' });
    }
  }, [isAuthenticated, profile]);

  /**
   * Helper to make authenticated betting API calls with Bearer token.
   * Returns null if no token available.
   */
  const getAuthHeaders = useCallback((): HeadersInit | null => {
    if (!accessToken) {
      console.log('[BETTING] No access token available');
      return null;
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  // Fetch user's bets from API when betting is enabled and we have a token
  const refreshBets = useCallback(async () => {
    // Only fetch bets if betting mode is enabled and we have a token
    if (!bettingEnabled || !accessToken) {
      if (bettingEnabled && !accessToken) {
        console.log('[BETTING] Skipping refreshBets - no access token');
      }
      return;
    }

    const headers = getAuthHeaders();
    if (!headers) return;

    console.log('[BETTING] Fetching bets (hasToken: true)');
    dispatch({ type: 'SET_SYNCING', payload: true });
    try {
      const response = await fetch('/api/betting/bets', {
        headers,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.bets) {
          // Transform API bets to local format
          // Note: API stores 'sail'/'cancel', frontend uses 'will_sail'/'will_cancel'
          const bets: Bet[] = data.bets.map((apiBet: {
            id: string;
            sailingId: string;
            corridorId: string;
            betType: string; // API format: 'sail' | 'cancel'
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
            betType: mapFromApiBetType(apiBet.betType), // Convert API → frontend format
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

          // Update bankroll from API response
          if (data.bankroll) {
            dispatch({
              type: 'SET_BANKROLL',
              payload: {
                userId: userId || '',
                balance: data.bankroll.balance,
                dailyLimit: data.bankroll.dailyLimit,
                spentToday: data.bankroll.spentToday,
                lastReplenishDate: data.bankroll.lastResetAt?.split('T')[0] || new Date().toISOString().split('T')[0],
              },
            });
          }
        }
      } else {
        console.error('[BETTING] Failed to fetch bets:', response.status);
      }
    } catch (err) {
      console.error('[BETTING] Failed to fetch bets:', err);
    } finally {
      dispatch({ type: 'SET_SYNCING', payload: false });
    }
  }, [bettingEnabled, accessToken, getAuthHeaders, userId]);

  // Fetch bets when betting is enabled and we have a token
  useEffect(() => {
    if (bettingEnabled && accessToken) {
      refreshBets();
    }
  }, [bettingEnabled, accessToken, refreshBets]);

  // Fetch leaderboard (public endpoint, but include token if available)
  const refreshLeaderboard = useCallback(async () => {
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      const response = await fetch('/api/betting/leaderboard', { headers });
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
  }, [accessToken]);

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

  /**
   * Phase 86F: Simplified placeBet - send intent only, server computes all math.
   * Frontend sends: sailingId, corridorId, betType
   * Server computes: stake, odds, likelihood, payout, departure time
   */
  const placeBet = useCallback(async (
    sailingId: string,
    corridorId: string,
    betType: BetType
  ): Promise<{ success: boolean; error?: string }> => {
    // Validate we have an access token
    if (!accessToken) {
      console.warn('[BETTING] Cannot place bet - no access token');
      return { success: false, error: 'Not authenticated' };
    }

    // Validate betting mode is enabled
    if (!state.settings.enabled) {
      return { success: false, error: 'Betting mode is not enabled' };
    }

    // Validate user is authenticated
    if (!isAuthenticated) {
      return { success: false, error: 'Must be signed in to place bets' };
    }

    // Validate not already bet on this sailing (client-side check)
    if (state.bets.has(sailingId)) {
      return { success: false, error: 'Already placed a bet on this sailing' };
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    console.log('[BETTING] Placing bet (hasToken: true)', { sailingId, corridorId, betType });
    try {
      // Phase 86F: Send intent only - server computes everything else
      // Use shared type and mapping function for type safety
      const payload: PlaceBetRequest = {
        sailingId,
        corridorId,
        betType: mapToApiBetType(betType),
      };
      console.log('[BETTING] Sending payload:', payload);

      const response = await fetch('/api/betting/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        dispatch({ type: 'SET_ERROR', payload: data.error || 'Failed to place bet' });
        return { success: false, error: data.error || 'Failed to place bet' };
      }

      // Create bet from server response (all values come from server)
      const bet: Bet = {
        id: data.bet.id,
        userId: userId || '',
        sailingId: data.bet.sailingId,
        corridorId, // From function parameter
        betType,
        stake: data.bet.stakePoints,
        likelihoodSnapshot: data.bet.likelihoodSnapshot,
        americanOdds: data.bet.oddsSnapshot,
        potentialPayout: data.bet.payoutPoints,
        placedAt: data.bet.placedAt,
        lockedAt: data.bet.lockedAt,
        resolvedAt: null,
        status: data.bet.status,
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
            spentToday: state.bankroll.spentToday + bet.stake,
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
  }, [accessToken, state.settings.enabled, state.bankroll, state.bets, isAuthenticated, userId]);

  const getBetForSailing = useCallback((sailingId: string): Bet | undefined => {
    return state.bets.get(sailingId);
  }, [state.bets]);

  // Phase 86F: canPlaceBet no longer needs stake - server uses default stake
  const canPlaceBet = useCallback((): boolean => {
    return !!accessToken && state.settings.enabled && isAuthenticated;
  }, [accessToken, state.settings.enabled, isAuthenticated]);

  const getTimeUntilLock = useCallback((departureTimestampMs: number): { minutes: number; locked: boolean } => {
    const minutesUntil = (departureTimestampMs - Date.now()) / (1000 * 60);
    const lockMinutes = minutesUntil - BETTING_LOCKOUT_MINUTES;

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
    bettingEnabled,
    toggleBettingMode,
    updateSettings,
    placeBet,
    getBetForSailing,
    canPlaceBet,
    getTimeUntilLock,
    refreshBets,
    refreshLeaderboard,
    isBettingMode: bettingEnabled,
    lang: bettingEnabled ? BETTING_LANGUAGE : NEUTRAL_LANGUAGE,
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
