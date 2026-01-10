'use client';

/**
 * Auth Context
 *
 * React context for Google and Apple OAuth authentication.
 * Handles sign-in, sign-out, session persistence, and betting mode.
 *
 * Facebook has been intentionally removed.
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
import type { AuthContextValue, SessionUser, Bankroll, User, AuthProvider } from './types';

// ============================================================
// CONTEXT
// ============================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [bankroll, setBankroll] = useState<Bankroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Convert database user to SessionUser
   */
  const toSessionUser = useCallback((
    dbUser: User,
    isNewUser = false
  ): SessionUser => {
    return {
      id: dbUser.id,
      username: dbUser.username,
      provider: dbUser.auth_provider,
      bettingModeEnabled: dbUser.betting_mode_enabled,
      isNewUser,
    };
  }, []);

  /**
   * Get or create user profile from auth data
   */
  const getOrCreateUser = useCallback(async (
    authProvider: AuthProvider,
    authProviderId: string,
    username: string,
    email: string | null
  ): Promise<User | null> => {
    if (!supabase) return null;

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_or_create_user',
        {
          p_auth_provider: authProvider,
          p_auth_provider_id: authProviderId,
          p_username: username,
          p_email: email,
        }
      );

      if (rpcError) {
        console.error('[AUTH] RPC error:', rpcError);
        return null;
      }

      return data as User;
    } catch (err) {
      console.error('[AUTH] Failed to get/create user:', err);
      return null;
    }
  }, []);

  /**
   * Fetch user's bankroll
   */
  const fetchBankroll = useCallback(async (userId: string): Promise<Bankroll | null> => {
    if (!supabase) return null;

    try {
      const { data, error: fetchError } = await supabase
        .from('bankrolls')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (fetchError) {
        console.error('[AUTH] Bankroll fetch error:', fetchError);
        return null;
      }

      return {
        userId: data.user_id,
        balancePoints: data.balance_points,
        dailyLimit: data.daily_limit,
        spentToday: data.spent_today,
        lastResetAt: data.last_reset_at,
      };
    } catch (err) {
      console.error('[AUTH] Failed to fetch bankroll:', err);
      return null;
    }
  }, []);

  /**
   * Extract user info from Supabase auth session
   */
  const extractUserInfo = useCallback((authUser: { id: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) => {
    const metadata = authUser.user_metadata || {};
    const appMetadata = authUser.app_metadata || {};

    // Get display name from various provider fields
    const username =
      (metadata.full_name as string) ||
      (metadata.name as string) ||
      (metadata.email as string)?.split('@')[0] ||
      'user';

    const email = (metadata.email as string) || null;

    // Determine provider from app_metadata
    const provider = (appMetadata.provider as AuthProvider) || 'google';

    return { username, email, provider };
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
        setBankroll(null);
        setIsLoading(false);
        return;
      }

      if (!session?.user) {
        setUser(null);
        setBankroll(null);
        setIsLoading(false);
        return;
      }

      const authUser = session.user;
      const { username, email, provider } = extractUserInfo(authUser);

      // Get or create user profile
      const dbUser = await getOrCreateUser(
        provider,
        authUser.id,
        username,
        email
      );

      if (dbUser) {
        setUser(toSessionUser(dbUser, false));
        const userBankroll = await fetchBankroll(dbUser.id);
        setBankroll(userBankroll);
      } else {
        // Fallback: create session user from auth data only
        setUser({
          id: authUser.id,
          username,
          provider,
          bettingModeEnabled: false,
          isNewUser: false,
        });
      }
    } catch (err) {
      console.error('[AUTH] Refresh failed:', err);
      setError('Failed to load user session');
    } finally {
      setIsLoading(false);
    }
  }, [extractUserInfo, getOrCreateUser, toSessionUser, fetchBankroll]);

  /**
   * Sign in with Google OAuth
   */
  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Authentication not configured');
      return;
    }

    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) {
        console.error('[AUTH] Google sign in error:', signInError);
        setError('Failed to sign in with Google. Please try again.');
      }
    } catch (err) {
      console.error('[AUTH] Google sign in failed:', err);
      setError('Something went wrong. Please try again.');
    }
  }, []);

  /**
   * Sign in with Apple OAuth
   */
  const signInWithApple = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Authentication not configured');
      return;
    }

    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) {
        console.error('[AUTH] Apple sign in error:', signInError);
        setError('Failed to sign in with Apple. Please try again.');
      }
    } catch (err) {
      console.error('[AUTH] Apple sign in failed:', err);
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
      setBankroll(null);
      setError(null);
    } catch (err) {
      console.error('[AUTH] Sign out failed:', err);
      setError('Failed to sign out');
    }
  }, []);

  /**
   * Toggle betting mode
   */
  const toggleBettingMode = useCallback(async (enabled: boolean) => {
    if (!supabase || !user) {
      setError('Not authenticated');
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ betting_mode_enabled: enabled })
        .eq('id', user.id);

      if (updateError) {
        console.error('[AUTH] Failed to update betting mode:', updateError);
        setError('Failed to update betting mode');
        return;
      }

      // Update local state
      setUser(prev => prev ? { ...prev, bettingModeEnabled: enabled } : null);
    } catch (err) {
      console.error('[AUTH] Toggle betting mode failed:', err);
      setError('Failed to update betting mode');
    }
  }, [user]);

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
          const { username, email, provider } = extractUserInfo(authUser);

          // Check if this is a new user (created within last 5 seconds)
          const createdAt = new Date(authUser.created_at).getTime();
          const isNewUser = Date.now() - createdAt < 5000;

          const dbUser = await getOrCreateUser(
            provider,
            authUser.id,
            username,
            email
          );

          if (dbUser) {
            setUser(toSessionUser(dbUser, isNewUser));
            const userBankroll = await fetchBankroll(dbUser.id);
            setBankroll(userBankroll);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setBankroll(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [extractUserInfo, getOrCreateUser, toSessionUser, fetchBankroll]);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value: AuthContextValue = {
    user,
    bankroll,
    isLoading,
    isAuthenticated: !!user,
    error,
    signInWithGoogle,
    signInWithApple,
    signOut,
    refreshUser,
    toggleBettingMode,
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

/**
 * Safe auth hook that returns null values if outside provider
 * Use for components that may exist without AuthProvider
 */
export function useAuthSafe(): AuthContextValue | null {
  return useContext(AuthContext);
}
