/**
 * Auth Types
 *
 * Type definitions for Google and Apple OAuth authentication.
 * Facebook has been intentionally removed.
 */

/**
 * Supported auth providers
 */
export type AuthProvider = 'google' | 'apple';

/**
 * User record stored in database (users table)
 * Note: Database column is still 'betting_mode_enabled' for backward compatibility
 */
export interface User {
  id: string;
  username: string;
  auth_provider: AuthProvider;
  auth_provider_id: string;
  email: string | null;
  betting_mode_enabled: boolean;  // DB column name (aliased as gameModeEnabled in frontend)
  created_at: string;
  last_login_at: string;
}

/**
 * Session-safe user object (returned to client)
 * Does not include auth_provider_id or other sensitive data
 */
export interface SessionUser {
  id: string;
  username: string;
  provider: AuthProvider;
  gameModeEnabled: boolean;
  isNewUser: boolean;
}

/**
 * Bankroll state (points system)
 */
export interface Bankroll {
  userId: string;
  balancePoints: number;
  dailyLimit: number;
  spentToday: number;
  lastResetAt: string;
}

/**
 * Auth state for context
 */
export interface AuthState {
  user: SessionUser | null;
  bankroll: Bankroll | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

/**
 * Auth actions available in context
 */
export interface AuthActions {
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  toggleGameMode: (enabled: boolean) => Promise<void>;
}

/**
 * Combined auth context value
 */
export interface AuthContextValue extends AuthState, AuthActions {}

/**
 * OAuth callback response
 */
export interface OAuthCallbackResult {
  success: boolean;
  user?: SessionUser;
  error?: string;
}

// ============================================================
// BACKWARD COMPATIBILITY
// ============================================================

/**
 * @deprecated Use SessionUser.gameModeEnabled instead
 * This interface extends SessionUser to provide the old property name
 */
export interface SessionUserCompat extends Omit<SessionUser, 'gameModeEnabled'> {
  bettingModeEnabled: boolean;
  gameModeEnabled: boolean;
}

/**
 * @deprecated Use toggleGameMode instead
 */
export interface AuthActionsCompat extends Omit<AuthActions, 'toggleGameMode'> {
  toggleBettingMode: (enabled: boolean) => Promise<void>;
  toggleGameMode: (enabled: boolean) => Promise<void>;
}
