'use client';

/**
 * Auth Context
 *
 * React context for Facebook OAuth authentication.
 * Handles sign-in, sign-out, and session persistence.
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
import type { AuthContextValue, SessionUser, SocialUser } from './types';

// ============================================================
// CONTEXT
// ============================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Convert Supabase auth user + social profile to SessionUser
   */
  const toSessionUser = useCallback((
    socialUser: SocialUser,
    isNewUser = false
  ): SessionUser => {
    return {
      id: socialUser.user_id,
      displayName: socialUser.display_name,
      avatarUrl: socialUser.avatar_url,
      provider: socialUser.provider,
      isNewUser,
    };
  }, []);

  /**
   * Get or create social user profile from auth user
   */
  const getOrCreateSocialUser = useCallback(async (
    authUserId: string,
    displayName: string,
    avatarUrl: string | null,
    provider: string
  ): Promise<SocialUser | null> => {
    if (!supabase) return null;

    try {
      // Call the database function to get or create user
      const { data, error: rpcError } = await supabase.rpc(
        'get_or_create_social_user',
        {
          p_auth_user_id: authUserId,
          p_display_name: displayName,
          p_avatar_url: avatarUrl,
          p_provider: provider,
        }
      );

      if (rpcError) {
        console.error('[AUTH] RPC error:', rpcError);
        return null;
      }

      return data as SocialUser;
    } catch (err) {
      console.error('[AUTH] Failed to get/create social user:', err);
      return null;
    }
  }, []);

  /**
   * Extract user info from Supabase auth session
   */
  const extractUserInfo = useCallback((authUser: { id: string; user_metadata?: Record<string, unknown> }) => {
    const metadata = authUser.user_metadata || {};

    // Facebook provides these fields
    const displayName =
      (metadata.full_name as string) ||
      (metadata.name as string) ||
      'Ferry Fan';

    const avatarUrl =
      (metadata.avatar_url as string) ||
      (metadata.picture as string) ||
      null;

    const provider =
      (metadata.provider as string) ||
      'facebook';

    return { displayName, avatarUrl, provider };
  }, []);

  /**
   * Refresh user from current session
   */
  const refreshUser = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[AUTH] Session error:', sessionError);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (!session?.user) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const authUser = session.user;
      const { displayName, avatarUrl, provider } = extractUserInfo(authUser);

      // Get or create social user profile
      const socialUser = await getOrCreateSocialUser(
        authUser.id,
        displayName,
        avatarUrl,
        provider
      );

      if (socialUser) {
        setUser(toSessionUser(socialUser, false));
      } else {
        // Fallback: create session user from auth data only
        setUser({
          id: authUser.id,
          displayName,
          avatarUrl,
          provider: provider as 'facebook' | 'google' | 'anonymous',
          isNewUser: false,
        });
      }
    } catch (err) {
      console.error('[AUTH] Refresh failed:', err);
      setError('Failed to load user session');
    } finally {
      setIsLoading(false);
    }
  }, [extractUserInfo, getOrCreateSocialUser, toSessionUser]);

  /**
   * Sign in with Facebook OAuth
   */
  const signInWithFacebook = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Authentication not configured');
      return;
    }

    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'public_profile',
        },
      });

      if (signInError) {
        console.error('[AUTH] Sign in error:', signInError);
        setError('Failed to sign in. Please try again.');
      }
      // Note: OAuth redirects, so no need to handle success here
    } catch (err) {
      console.error('[AUTH] Sign in failed:', err);
      setError('Something went wrong. Please try again.');
    }
  }, []);

  /**
   * Sign out
   */
  const signOut = useCallback(async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('[AUTH] Sign out failed:', err);
      setError('Failed to sign out');
    }
  }, []);

  // ============================================================
  // EFFECTS
  // ============================================================

  // Initial session check
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Listen for auth state changes
  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const authUser = session.user;
          const { displayName, avatarUrl, provider } = extractUserInfo(authUser);

          // Check if this is a new user (created within last 5 seconds)
          const createdAt = new Date(authUser.created_at).getTime();
          const isNewUser = Date.now() - createdAt < 5000;

          const socialUser = await getOrCreateSocialUser(
            authUser.id,
            displayName,
            avatarUrl,
            provider
          );

          if (socialUser) {
            setUser(toSessionUser(socialUser, isNewUser));
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [extractUserInfo, getOrCreateSocialUser, toSessionUser]);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    signInWithFacebook,
    signOut,
    refreshUser,
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

/**
 * Use auth context
 * @throws if used outside AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Check if auth is available (safe for conditional rendering)
 */
export function useAuthAvailable(): boolean {
  const context = useContext(AuthContext);
  return context !== null;
}

/**
 * Get current user (null if not authenticated)
 * Does not throw if outside provider
 */
export function useUser(): SessionUser | null {
  const context = useContext(AuthContext);
  return context?.user ?? null;
}
