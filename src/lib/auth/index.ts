/**
 * Auth Module
 *
 * Facebook OAuth authentication for social predictions.
 */

// Types
export type {
  SocialUser,
  SessionUser,
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
} from './context';
