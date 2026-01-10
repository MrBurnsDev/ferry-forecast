/**
 * Auth Module
 *
 * Google and Apple OAuth authentication.
 * Facebook has been intentionally removed.
 */

// Types
export type {
  AuthProvider as AuthProviderType,
  User,
  SessionUser,
  Bankroll,
  AuthState,
  AuthActions,
  AuthContextValue,
  OAuthCallbackResult,
} from './types';

// Context and hooks
export {
  AuthProvider,
  useAuth,
  useAuthAvailable,
  useUser,
  useAuthSafe,
} from './context';
