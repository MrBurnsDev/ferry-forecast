'use client';

/**
 * Auth Context - Phase 86E Aligned
 *
 * CRITICAL RULES:
 * 1. Session exists = user is authenticated (NEVER check DB for auth state)
 * 2. User provisioning is async and non-blocking
 * 3. DB failures NEVER cause logout or redirect
 * 4. Missing user records NEVER block rendering
 *
 * Phase 86E: Uses Bearer token auth for API calls - no server-side cookie gating needed.
 * Uses ferry_forecast.users table and get_or_create_user function.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

// ============================================================
// TYPES
// ============================================================

export type AuthProvider = 'google' | 'apple';

/**
 * Normalize Supabase user to our allowed provider values.
 * Checks both app_metadata.provider and identities[].provider.
 * Returns null for unknown providers (provisioning will be skipped).
 *
 * Rules:
 * - Any value containing "google" → 'google'
 * - Any value containing "apple" → 'apple'
 * - Otherwise return null (skip provisioning, don't block auth)
 */
function normalizeAuthProvider(user: SupabaseUser): AuthProvider | null {
  // Collect all provider values to check
  const providersToCheck: string[] = [];

  // Check app_metadata.provider
  const appMetaProvider = user.app_metadata?.provider;
  if (typeof appMetaProvider === 'string') {
    providersToCheck.push(appMetaProvider);
  }

  // Check identities[].provider
  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      if (typeof identity.provider === 'string') {
        providersToCheck.push(identity.provider);
      }
    }
  }

  console.log('[AUTH] Checking providers:', providersToCheck);

  // Check each provider value
  for (const raw of providersToCheck) {
    const lower = raw.toLowerCase();

    // Google variants: 'google', 'google-oauth2', 'google.com', 'Google'
    if (lower.includes('google')) {
      console.log('[AUTH] Normalized provider to google (from:', raw, ')');
      return 'google';
    }

    // Apple variants: 'apple', 'apple.com', 'Apple'
    if (lower.includes('apple')) {
      console.log('[AUTH] Normalized provider to apple (from:', raw, ')');
      return 'apple';
    }
  }

  // No recognized provider found - return null to skip provisioning
  console.warn('[AUTH] No recognized provider found, skipping provisioning. Checked:', providersToCheck);
  return null;
}

/**
 * App-level user profile (from ferry_forecast.users table)
 * This is OPTIONAL - session alone = authenticated
 */
export interface UserProfile {
  id: string;
  username: string;
  authProvider: AuthProvider;
  email: string | null;
  gameModeEnabled: boolean;
}

export interface AuthContextValue {
  // Core auth state - ONLY based on Supabase session
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Optional app-level profile (may be null even when authenticated)
  profile: UserProfile | null;
  profileLoading: boolean;

  // Actions
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;

  // Profile updates
  setGameMode: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  /** @deprecated Use setGameMode instead */
  setBettingMode: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
}

// ============================================================
// CONTEXT
// ============================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  // Core auth state - ONLY from Supabase session
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Optional profile state - never blocks auth
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  /**
   * Provision user in database - ASYNC, NON-BLOCKING
   * Failures are logged but NEVER affect auth state
   *
   * Calls ferry_forecast.get_or_create_user per Phase 85 spec
   */
  const provisionUser = useCallback(async (user: SupabaseUser) => {
    if (!supabase) return;

    // DIAGNOSTIC: Log provisioning start
    console.log('[AUTH_DIAG] Provisioning Start:', {
      supabaseUserId: user.id,
      email: user.email ? `${user.email.substring(0, 3)}***` : null,
      appMetaProvider: user.app_metadata?.provider,
      identityProviders: user.identities?.map(i => i.provider),
      timestamp: new Date().toISOString(),
    });

    setProfileLoading(true);

    try {
      const metadata = user.user_metadata || {};

      // CRITICAL: Normalize provider - if null, skip provisioning (don't block auth)
      const provider = normalizeAuthProvider(user);
      if (provider === null) {
        console.warn('[AUTH_DIAG] Provisioning Skipped - no recognized provider:', {
          appMetaProvider: user.app_metadata?.provider,
          identityProviders: user.identities?.map(i => i.provider),
        });
        setProfileLoading(false);
        return;
      }
      console.log('[AUTH_DIAG] Provider normalized:', provider);

      // Generate username from user metadata
      const username =
        (metadata.full_name as string) ||
        (metadata.name as string) ||
        (metadata.email as string)?.split('@')[0] ||
        'User';

      const email = (metadata.email as string) || user.email || null;

      console.log('[AUTH_DIAG] Calling get_or_create_user RPC:', {
        provider,
        authProviderId: user.id,
        username,
        hasEmail: !!email,
      });

      // Call Phase 85 canonical function: get_or_create_user
      // Parameters: p_auth_provider, p_auth_provider_id, p_username, p_email
      const { data, error } = await supabase.rpc(
        'get_or_create_user',
        {
          p_auth_provider: provider,
          p_auth_provider_id: user.id, // This is auth.uid() - Supabase user ID
          p_username: username,
          p_email: email,
        }
      );

      if (error) {
        // DIAGNOSTIC: Log full error details
        console.error('[AUTH_DIAG] Provisioning RPC Failed:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          provider,
          authProviderId: user.id,
        });
        return;
      }

      if (data) {
        console.log('[AUTH_DIAG] Provisioning Success:', {
          userId: data.id,
          username: data.username,
          provider: data.auth_provider,
          isNewUser: data.created_at === data.last_login_at,
        });
        setProfile({
          id: data.id,
          username: data.username,
          authProvider: data.auth_provider as AuthProvider,
          email: data.email,
          // Map from DB column name to new frontend property name
          gameModeEnabled: data.betting_mode_enabled || false,
        });
      } else {
        console.warn('[AUTH_DIAG] Provisioning returned no data');
      }
    } catch (err) {
      // DIAGNOSTIC: Log catch-all errors with full details
      console.error('[AUTH_DIAG] Provisioning Exception:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.substring(0, 200) : undefined,
      });
    } finally {
      setProfileLoading(false);
    }
  }, []);

  /**
   * Sign in with Google OAuth
   */
  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      console.error('[AUTH] Supabase not configured');
      return;
    }

    // DIAGNOSTIC: Log OAuth initiation details
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback`;
    const isWww = origin.includes('www.');
    console.log('[AUTH_DIAG] OAuth Initiation:', {
      provider: 'google',
      origin,
      redirectTo,
      isWww,
      fullUrl: window.location.href,
      userAgent: navigator.userAgent.substring(0, 100),
      timestamp: new Date().toISOString(),
    });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (error) {
      console.error('[AUTH_DIAG] Google sign in error:', {
        message: error.message,
        status: error.status,
        origin,
        redirectTo,
      });
    }
  }, []);

  /**
   * Sign in with Apple OAuth
   * TEMPORARILY DISABLED - Apple OAuth backend not implemented
   * To re-enable: uncomment the OAuth call below and restore the Apple button in SignInButtons.tsx
   */
  const signInWithApple = useCallback(async () => {
    // TEMPORARILY DISABLED - Apple OAuth backend not implemented
    console.warn('[AUTH] Apple sign-in is temporarily disabled. Use Google sign-in instead.');
    return;

    /* RE-ENABLE WHEN APPLE OAUTH BACKEND IS READY:
    if (!isSupabaseConfigured() || !supabase) {
      console.error('[AUTH] Supabase not configured');
      return;
    }

    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback`;
    const isWww = origin.includes('www.');
    console.log('[AUTH_DIAG] OAuth Initiation:', {
      provider: 'apple',
      origin,
      redirectTo,
      isWww,
      fullUrl: window.location.href,
      userAgent: navigator.userAgent.substring(0, 100),
      timestamp: new Date().toISOString(),
    });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo,
      },
    });

    if (error) {
      console.error('[AUTH_DIAG] Apple sign in error:', {
        message: error.message,
        status: error.status,
        origin,
        redirectTo,
      });
    }
    */
  }, []);

  /**
   * Sign out - ONLY called by explicit user action
   */
  const signOut = useCallback(async () => {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[AUTH] Sign out error:', error);
    }
    // State will be cleared by onAuthStateChange listener
  }, []);

  /**
   * Set game mode - persists to database via RPC
   * Updates local profile state optimistically on success
   * Note: DB function is still named 'set_betting_mode' for backward compatibility
   */
  const setGameMode = useCallback(async (enabled: boolean): Promise<{ success: boolean; error?: string }> => {
    if (!supabase) {
      return { success: false, error: 'Supabase not configured' };
    }

    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    console.log('[AUTH] Setting game mode:', enabled);

    try {
      // Note: DB function retains old name for backward compatibility
      const { error } = await supabase.rpc('set_betting_mode', {
        p_enabled: enabled,
      });

      if (error) {
        console.error('[AUTH] Failed to set game mode:', error.message);
        return { success: false, error: error.message };
      }

      // Update local profile state
      if (profile) {
        setProfile({
          ...profile,
          gameModeEnabled: enabled,
        });
      }

      console.log('[AUTH] Game mode updated successfully:', enabled);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[AUTH] Error setting game mode:', message);
      return { success: false, error: message };
    }
  }, [session, profile]);

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      console.log('[AUTH] Supabase not configured');
      setIsLoading(false);
      return;
    }

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // DIAGNOSTIC: Enhanced auth state change logging
        console.log('[AUTH_DIAG] Auth State Change:', {
          event,
          hasSession: !!newSession,
          hasUser: !!newSession?.user,
          userId: newSession?.user?.id,
          provider: newSession?.user?.app_metadata?.provider,
          timestamp: new Date().toISOString(),
        });

        // Update session state
        setSession(newSession);
        setIsLoading(false);

        // Handle events
        if (event === 'SIGNED_IN' && newSession?.user) {
          console.log('[AUTH_DIAG] SIGNED_IN - Starting provisioning');
          // Provision user async - NEVER blocks
          provisionUser(newSession.user);
        } else if (event === 'SIGNED_OUT') {
          console.log('[AUTH_DIAG] SIGNED_OUT - Clearing profile');
          setProfile(null);
        } else if (event === 'INITIAL_SESSION') {
          console.log('[AUTH_DIAG] INITIAL_SESSION:', {
            hasUser: !!newSession?.user,
            willProvision: !!newSession?.user,
          });
          // Initial load - provision if we have a user
          if (newSession?.user) {
            provisionUser(newSession.user);
          }
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('[AUTH_DIAG] TOKEN_REFRESHED');
        } else {
          console.log('[AUTH_DIAG] Unhandled event:', event);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [provisionUser]);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value: AuthContextValue = {
    session,
    isLoading,
    isAuthenticated: !!session, // Session exists = authenticated. Period.
    profile,
    profileLoading,
    signInWithGoogle,
    signInWithApple,
    signOut,
    setGameMode,
    setBettingMode: setGameMode, // deprecated alias
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// HOOKS
// ============================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthSafe(): AuthContextValue | null {
  return useContext(AuthContext);
}

// Convenience hook for checking auth
export function useIsAuthenticated(): boolean {
  const context = useContext(AuthContext);
  return context?.isAuthenticated ?? false;
}
