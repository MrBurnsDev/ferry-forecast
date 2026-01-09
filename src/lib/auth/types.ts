/**
 * Auth Types
 *
 * Type definitions for Facebook OAuth authentication.
 */

/**
 * Social user profile stored in database
 */
export interface SocialUser {
  user_id: string;
  auth_user_id: string;
  display_name: string;
  avatar_url: string | null;
  provider: 'facebook' | 'google' | 'anonymous';
  created_at: string;
  last_login_at: string;
}

/**
 * Session-safe user object (returned to client)
 * Does not include internal IDs or sensitive data
 */
export interface SessionUser {
  id: string;              // user_id
  displayName: string;
  avatarUrl: string | null;
  provider: 'facebook' | 'google' | 'anonymous';
  isNewUser: boolean;      // First login indicator
}

/**
 * Auth state for context
 */
export interface AuthState {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

/**
 * Auth actions available in context
 */
export interface AuthActions {
  signInWithFacebook: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
