'use client';

/**
 * Prediction Game Context
 *
 * React context for managing prediction game state across the app.
 * Handles user settings, bankroll (points), and active predictions.
 *
 * CRITICAL: Game mode is disabled by default. Users must explicitly
 * opt-in via the settings toggle in their account.
 *
 * Phase 86E: Uses Bearer token auth instead of cookies for all prediction API calls.
 * Phase 86F: Simplified to thumbs up/down model - frontend sends intent only,
 *            server computes all prediction math (odds, stake, payout).
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
  Prediction,
  PredictionChoice,
  UserBankroll,
  GameSettings,
  LanguageMode,
  LanguageStrings,
  LeaderboardEntry,
  DailyCrown,
  // Backward compatibility aliases
  Bet,
  BetType,
  BettingSettings,
} from './types';
import {
  DEFAULT_GAME_SETTINGS,
  DEFAULT_BANKROLL,
  NEUTRAL_LANGUAGE,
  GAME_LANGUAGE,
} from './types';
import { PREDICTION_LOCKOUT_MINUTES } from './constants';
import { calculateProfit } from './odds';
import { useAuthSafe } from '@/lib/auth';
import { mapToApiChoice, mapFromApiChoice, type PlaceBetRequest } from '@/types/betting-api';

// ============================================================
// STATE
// ============================================================

interface PredictionGameState {
  // Settings
  settings: GameSettings;
  languageMode: LanguageMode;
  language: LanguageStrings;

  // Bankroll (Points)
  bankroll: UserBankroll;

  // Active predictions
  predictions: Map<string, Prediction>; // keyed by sailingId
  /** @deprecated Use predictions instead */
  bets: Map<string, Prediction>; // deprecated alias

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

const emptyPredictionsMap = new Map<string, Prediction>();
const initialState: PredictionGameState = {
  settings: DEFAULT_GAME_SETTINGS,
  languageMode: 'neutral',
  language: NEUTRAL_LANGUAGE,
  bankroll: {
    userId: '',
    balance: DEFAULT_BANKROLL.balance,
    dailyLimit: DEFAULT_BANKROLL.dailyLimit,
    spentToday: DEFAULT_BANKROLL.spentToday,
    lastReplenishDate: new Date().toISOString().split('T')[0],
  },
  predictions: emptyPredictionsMap,
  bets: emptyPredictionsMap, // deprecated alias pointing to same map
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

type PredictionGameAction =
  | { type: 'SET_SETTINGS'; payload: GameSettings }
  | { type: 'TOGGLE_GAME_MODE'; payload: boolean }
  | { type: 'SET_BANKROLL'; payload: UserBankroll }
  | { type: 'ADD_PREDICTION'; payload: Prediction }
  | { type: 'SET_PREDICTIONS'; payload: Prediction[] }
  | { type: 'UPDATE_PREDICTION'; payload: { sailingId: string; updates: Partial<Prediction> } }
  | { type: 'RESOLVE_PREDICTION'; payload: { sailingId: string; outcome: 'sailed' | 'canceled' } }
  | { type: 'SET_LEADERBOARD'; payload: { daily: LeaderboardEntry[]; allTime: LeaderboardEntry[]; crown: DailyCrown | null } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' };

function predictionGameReducer(state: PredictionGameState, action: PredictionGameAction): PredictionGameState {
  switch (action.type) {
    case 'SET_SETTINGS':
      return {
        ...state,
        settings: action.payload,
        languageMode: action.payload.enabled ? 'game' : 'neutral',
        language: action.payload.enabled ? GAME_LANGUAGE : NEUTRAL_LANGUAGE,
      };

    case 'TOGGLE_GAME_MODE': {
      const enabled = action.payload;
      return {
        ...state,
        settings: { ...state.settings, enabled },
        languageMode: enabled ? 'game' : 'neutral',
        language: enabled ? GAME_LANGUAGE : NEUTRAL_LANGUAGE,
      };
    }

    case 'SET_BANKROLL':
      return {
        ...state,
        bankroll: action.payload,
      };

    case 'ADD_PREDICTION': {
      const newPredictions = new Map(state.predictions);
      newPredictions.set(action.payload.sailingId, action.payload);
      return {
        ...state,
        predictions: newPredictions,
        bets: newPredictions, // deprecated alias
        bankroll: {
          ...state.bankroll,
          balance: state.bankroll.balance - action.payload.stake,
          spentToday: state.bankroll.spentToday + action.payload.stake,
        },
      };
    }

    case 'SET_PREDICTIONS': {
      const newPredictions = new Map<string, Prediction>();
      action.payload.forEach(prediction => {
        newPredictions.set(prediction.sailingId, prediction);
      });
      return {
        ...state,
        predictions: newPredictions,
        bets: newPredictions, // deprecated alias
      };
    }

    case 'UPDATE_PREDICTION': {
      const existingPrediction = state.predictions.get(action.payload.sailingId);
      if (!existingPrediction) return state;

      const newPredictions = new Map(state.predictions);
      newPredictions.set(action.payload.sailingId, { ...existingPrediction, ...action.payload.updates });
      return {
        ...state,
        predictions: newPredictions,
        bets: newPredictions, // deprecated alias
      };
    }

    case 'RESOLVE_PREDICTION': {
      const prediction = state.predictions.get(action.payload.sailingId);
      if (!prediction) return state;

      const outcome = action.payload.outcome;
      const won = (prediction.choice === 'will_sail' && outcome === 'sailed') ||
                  (prediction.choice === 'will_cancel' && outcome === 'canceled');

      const profit = won ? calculateProfit(prediction.stake, prediction.americanOdds) : -prediction.stake;
      const newBalance = state.bankroll.balance + (won ? prediction.stake + profit : 0);

      const newPredictions = new Map(state.predictions);
      newPredictions.set(action.payload.sailingId, {
        ...prediction,
        status: won ? 'won' : 'lost',
        outcome,
        profit,
        resolvedAt: new Date().toISOString(),
      });

      return {
        ...state,
        predictions: newPredictions,
        bets: newPredictions, // deprecated alias
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

interface PredictionGameContextValue {
  state: PredictionGameState;

  /**
   * CRITICAL: This is the ONLY gate for game UI visibility.
   * Derived from profile?.gameModeEnabled === true
   * If false, NO game UI should render (not disabled, not greyed - absent).
   */
  gameEnabled: boolean;
  /** @deprecated Use gameEnabled instead */
  bettingEnabled: boolean;

  // Settings
  toggleGameMode: (enabled: boolean) => void;
  updateSettings: (settings: Partial<GameSettings>) => void;

  // Predictions - Phase 86F: simplified to intent-only
  submitPrediction: (
    sailingId: string,
    corridorId: string,
    choice: PredictionChoice
  ) => Promise<{ success: boolean; error?: string }>;
  /** @deprecated Use submitPrediction instead */
  placeBet: (
    sailingId: string,
    corridorId: string,
    choice: PredictionChoice
  ) => Promise<{ success: boolean; error?: string }>;
  getPredictionForSailing: (sailingId: string) => Prediction | undefined;
  /** @deprecated Use getPredictionForSailing instead */
  getBetForSailing: (sailingId: string) => Prediction | undefined;
  canSubmitPrediction: () => boolean;
  /** @deprecated Use canSubmitPrediction instead */
  canPlaceBet: () => boolean;
  getTimeUntilLock: (departureTimestampMs: number) => { minutes: number; locked: boolean };

  // Sync
  refreshPredictions: () => Promise<void>;
  /** @deprecated Use refreshPredictions instead */
  refreshBets: () => Promise<void>;
  refreshLeaderboard: () => Promise<void>;

  // Language helpers
  isGameMode: boolean;
  /** @deprecated Use isGameMode instead */
  isBettingMode: boolean;
  lang: LanguageStrings;
}

const PredictionGameContext = createContext<PredictionGameContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function PredictionGameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(predictionGameReducer, initialState);

  // Use safe auth hook that returns null if outside AuthProvider
  const auth = useAuthSafe();
  const profile = auth?.profile;
  const session = auth?.session;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  /**
   * Phase 97: authReady indicates session rehydration from localStorage is complete.
   * This prevents premature API calls in Safari/iPad contexts.
   */
  const authReady = auth?.authReady ?? false;
  const accessToken = session?.access_token;
  const userId = session?.user?.id;

  /**
   * CRITICAL: Single source of truth for game UI visibility.
   * This is derived ONLY from the database-backed profile setting.
   * - Default is FALSE (game is opt-in)
   * - If profile fails to load, this is FALSE
   * - If user signs out, this becomes FALSE immediately
   */
  const gameEnabled = profile?.gameModeEnabled === true;

  // Sync game mode from user's profile setting
  useEffect(() => {
    if (isAuthenticated && profile) {
      dispatch({ type: 'TOGGLE_GAME_MODE', payload: profile.gameModeEnabled });
    } else if (!isAuthenticated) {
      dispatch({ type: 'RESET_STATE' });
    }
  }, [isAuthenticated, profile]);

  /**
   * Helper to make authenticated prediction API calls with Bearer token.
   * Returns null if no token available.
   */
  const getAuthHeaders = useCallback((): HeadersInit | null => {
    if (!accessToken) {
      console.log('[PREDICTION_GAME] No access token available');
      return null;
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  // Fetch user's predictions from API when game is enabled and we have a token
  const refreshPredictions = useCallback(async () => {
    // Phase 97: Hard gate on authReady to prevent Safari/iPad premature API calls
    if (!authReady) {
      console.log('[PREDICTION_GAME] Skipping refreshPredictions - auth not ready (rehydration pending)');
      return;
    }

    // Only fetch predictions if game mode is enabled and we have a token
    if (!gameEnabled || !accessToken) {
      if (gameEnabled && !accessToken) {
        console.log('[PREDICTION_GAME] Skipping refreshPredictions - no access token');
      }
      return;
    }

    const headers = getAuthHeaders();
    if (!headers) return;

    console.log('[PREDICTION_GAME] Fetching predictions (authReady: true, hasToken: true)');
    dispatch({ type: 'SET_SYNCING', payload: true });
    try {
      // Note: API endpoint retains old name for backward compatibility
      const response = await fetch('/api/betting/bets', {
        headers,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.bets) {
          // Transform API predictions to local format
          // Note: API stores 'sail'/'cancel', frontend uses 'will_sail'/'will_cancel'
          const predictions: Prediction[] = data.bets.map((apiPrediction: {
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
          }) => {
            const frontendChoice = mapFromApiChoice(apiPrediction.betType);
            return {
              id: apiPrediction.id,
              userId: userId || '',
              sailingId: apiPrediction.sailingId,
              corridorId: apiPrediction.corridorId,
              choice: frontendChoice, // Convert API → frontend format
              betType: frontendChoice, // deprecated alias
              stake: apiPrediction.stakePoints,
              likelihoodSnapshot: apiPrediction.likelihoodSnapshot,
              americanOdds: apiPrediction.oddsSnapshot,
              potentialPayout: apiPrediction.payoutPoints,
              placedAt: apiPrediction.placedAt,
              lockedAt: apiPrediction.lockedAt,
              resolvedAt: apiPrediction.resolvedAt,
              status: apiPrediction.status,
              outcome: null,
              profit: apiPrediction.status === 'won' ? apiPrediction.payoutPoints - apiPrediction.stakePoints :
                     apiPrediction.status === 'lost' ? -apiPrediction.stakePoints : null,
            };
          });
          dispatch({ type: 'SET_PREDICTIONS', payload: predictions });

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
        console.error('[PREDICTION_GAME] Failed to fetch predictions:', response.status);
      }
    } catch (err) {
      console.error('[PREDICTION_GAME] Failed to fetch predictions:', err);
    } finally {
      dispatch({ type: 'SET_SYNCING', payload: false });
    }
  }, [authReady, gameEnabled, accessToken, getAuthHeaders, userId]);

  // Fetch predictions when game is enabled, auth is ready, and we have a token
  // Phase 97: Added authReady to prevent Safari/iPad premature API calls
  useEffect(() => {
    if (authReady && gameEnabled && accessToken) {
      refreshPredictions();
    }
  }, [authReady, gameEnabled, accessToken, refreshPredictions]);

  // Fetch leaderboard (public endpoint, but include token if available)
  const refreshLeaderboard = useCallback(async () => {
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      // Note: API endpoint retains old name for backward compatibility
      const response = await fetch('/api/betting/leaderboard', { headers });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          dispatch({
            type: 'SET_LEADERBOARD',
            payload: {
              daily: data.daily || [],
              allTime: data.allTime || [],
              crown: null,
            },
          });
        }
      }
    } catch (err) {
      console.error('[PREDICTION_GAME] Failed to fetch leaderboard:', err);
    }
  }, [accessToken]);

  // ============================================================
  // ACTIONS
  // ============================================================

  const toggleGameMode = useCallback((enabled: boolean) => {
    // Local UI update - actual persistence is handled by auth context
    dispatch({ type: 'TOGGLE_GAME_MODE', payload: enabled });
  }, []);

  const updateSettings = useCallback((settings: Partial<GameSettings>) => {
    dispatch({
      type: 'SET_SETTINGS',
      payload: { ...state.settings, ...settings },
    });
  }, [state.settings]);

  /**
   * Phase 86F: Simplified submitPrediction - send intent only, server computes all math.
   * Frontend sends: sailingId, corridorId, choice
   * Server computes: stake, odds, likelihood, payout, departure time
   * Phase 97: Added authReady gate to prevent Safari/iPad premature submissions.
   */
  const submitPrediction = useCallback(async (
    sailingId: string,
    corridorId: string,
    choice: PredictionChoice
  ): Promise<{ success: boolean; error?: string }> => {
    // Phase 97: Hard gate on authReady to prevent Safari/iPad premature API calls
    if (!authReady) {
      console.warn('[PREDICTION_GAME] Cannot submit prediction - auth not ready');
      return { success: false, error: 'Authentication not ready' };
    }

    // Validate we have an access token
    if (!accessToken) {
      console.warn('[PREDICTION_GAME] Cannot submit prediction - no access token');
      return { success: false, error: 'Not authenticated' };
    }

    // Validate game mode is enabled
    if (!state.settings.enabled) {
      return { success: false, error: 'Game mode is not enabled' };
    }

    // Validate user is authenticated
    if (!isAuthenticated) {
      return { success: false, error: 'Must be signed in to make predictions' };
    }

    // Validate not already predicted on this sailing (client-side check)
    if (state.predictions.has(sailingId)) {
      return { success: false, error: 'Already made a prediction on this sailing' };
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    console.log('[PREDICTION_GAME] Submitting prediction (hasToken: true)', { sailingId, corridorId, choice });
    try {
      // Phase 86F: Send intent only - server computes everything else
      // Note: API still uses old field names for backward compatibility
      const payload: PlaceBetRequest = {
        sailingId,
        corridorId,
        betType: mapToApiChoice(choice),
      };
      console.log('[PREDICTION_GAME] Sending payload:', payload);

      // Note: API endpoint retains old name for backward compatibility
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
        dispatch({ type: 'SET_ERROR', payload: data.error || 'Failed to submit prediction' });
        return { success: false, error: data.error || 'Failed to submit prediction' };
      }

      // Create prediction from server response (all values come from server)
      const prediction: Prediction = {
        id: data.bet.id,
        userId: userId || '',
        sailingId: data.bet.sailingId,
        corridorId, // From function parameter
        choice,
        betType: choice, // deprecated alias
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

      dispatch({ type: 'ADD_PREDICTION', payload: prediction });

      // Update bankroll from server
      if (data.newBalance !== undefined) {
        dispatch({
          type: 'SET_BANKROLL',
          payload: {
            ...state.bankroll,
            balance: data.newBalance,
            spentToday: state.bankroll.spentToday + prediction.stake,
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
  }, [authReady, accessToken, state.settings.enabled, state.bankroll, state.predictions, isAuthenticated, userId]);

  const getPredictionForSailing = useCallback((sailingId: string): Prediction | undefined => {
    return state.predictions.get(sailingId);
  }, [state.predictions]);

  // Phase 97: canSubmitPrediction now requires authReady
  const canSubmitPrediction = useCallback((): boolean => {
    return authReady && !!accessToken && state.settings.enabled && isAuthenticated;
  }, [authReady, accessToken, state.settings.enabled, isAuthenticated]);

  const getTimeUntilLock = useCallback((departureTimestampMs: number): { minutes: number; locked: boolean } => {
    const minutesUntil = (departureTimestampMs - Date.now()) / (1000 * 60);
    const lockMinutes = minutesUntil - PREDICTION_LOCKOUT_MINUTES;

    return {
      minutes: Math.max(0, Math.floor(lockMinutes)),
      locked: lockMinutes <= 0,
    };
  }, []);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value: PredictionGameContextValue = {
    state,
    gameEnabled,
    bettingEnabled: gameEnabled, // deprecated alias
    toggleGameMode,
    updateSettings,
    submitPrediction,
    placeBet: submitPrediction, // deprecated alias
    getPredictionForSailing,
    getBetForSailing: getPredictionForSailing, // deprecated alias
    canSubmitPrediction,
    canPlaceBet: canSubmitPrediction, // deprecated alias
    getTimeUntilLock,
    refreshPredictions,
    refreshBets: refreshPredictions, // deprecated alias
    refreshLeaderboard,
    isGameMode: gameEnabled,
    isBettingMode: gameEnabled, // deprecated alias
    lang: gameEnabled ? GAME_LANGUAGE : NEUTRAL_LANGUAGE,
  };

  return (
    <PredictionGameContext.Provider value={value}>
      {children}
    </PredictionGameContext.Provider>
  );
}

// ============================================================
// HOOKS
// ============================================================

export function usePredictionGame(): PredictionGameContextValue {
  const context = useContext(PredictionGameContext);
  if (!context) {
    throw new Error('usePredictionGame must be used within a PredictionGameProvider');
  }
  return context;
}

/**
 * Hook to check if game mode is available
 * Returns false if context is not mounted (SSR safety)
 */
export function usePredictionGameAvailable(): boolean {
  const context = useContext(PredictionGameContext);
  return context !== null;
}

// ============================================================
// BACKWARD COMPATIBILITY ALIASES
// These maintain compatibility with existing code during migration
// ============================================================

/** @deprecated Use PredictionGameProvider instead */
export const BettingProvider = PredictionGameProvider;

/** @deprecated Use usePredictionGame instead */
export function useBetting(): PredictionGameContextValue {
  return usePredictionGame();
}

/** @deprecated Use usePredictionGameAvailable instead */
export function useBettingAvailable(): boolean {
  return usePredictionGameAvailable();
}

// Re-export types with old names for compatibility
export type { Bet, BetType, BettingSettings };
