/**
 * Auth Module - SIMPLIFIED
 *
 * Google and Apple OAuth authentication.
 * Session exists = authenticated. Profile is optional.
 *
 * Phase 96: Includes OAuth safety detection for iOS PWA/WebView blocking.
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

// OAuth safety detection (Phase 96)
export {
  detectOAuthSafety,
  useOAuthSafety,
  getCanonicalUrl,
  type OAuthSafetyResult,
} from './oauth-safety';

// Helper to check if auth is available
export function useAuthAvailable(): boolean {
  // Auth is always "available" - just may not be configured
  return true;
}
