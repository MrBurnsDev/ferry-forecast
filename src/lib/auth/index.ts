/**
 * Auth Module - SIMPLIFIED
 *
 * Google and Apple OAuth authentication.
 * Session exists = authenticated. Profile is optional.
 */

// Types from new context
export type {
  AuthProvider as AuthProviderType,
  UserProfile,
  AuthContextValue,
} from './context';

// Context and hooks
export {
  AuthProvider,
  useAuth,
  useAuthSafe,
  useIsAuthenticated,
} from './context';

// Helper to check if auth is available
export function useAuthAvailable(): boolean {
  // Auth is always "available" - just may not be configured
  return true;
}
