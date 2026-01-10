'use client';

/**
 * Auth Context
 *
 * React context for Google and Apple OAuth authentication.
 * Handles sign-in, sign-out, session persistence, and betting mode.
 *
 * Uses onAuthStateChange as the primary auth detection method.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
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
  const initialCheckDone = useRef(false);

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
        'get_or_create_user' as never,
        {
          p_auth_provider: authProvider,
          p_auth_provider_id: authProviderId,
          p_username: username,
          p_email: email,
        }
      );

      if (rpcError) {
        console.error('[AUTH] RPC get_or_create_user error:', rpcError.message, rpcError.details, rpcError);
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
        // PGRST116 means no rows found - that's okay for bankroll
        if (fetchError.code !== 'PGRST116') {
          console.error('[AUTH] Bankroll fetch error:', fetchError);
        }
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

    const username =
      (metadata.full_name as string) ||
      (metadata.name as string) ||
      (metadata.email as string)?.split('@')[0] ||
      'user';

    const email = (metadata.email as string) || null;
    const provider = (appMetadata.provider as AuthProvider) || 'google';

    return { username, email, provider };
  }, []);

  /**
   * Handle authenticated session
   */
  const handleSession = useCallback(async (
    authUser: { id: string; created_at: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }
  ) => {
    const { username, email, provider } = extractUserInfo(authUser);

    // Check if this is a new user (created within last 10 seconds)
    const createdAt = new Date(authUser.created_at).getTime();
    const isNewUser = Date.now() - createdAt < 10000;

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
    } else {
      // Fallback: create session user from auth data only
      setUser({
        id: authUser.id,
        username,
        provider,
        bettingModeEnabled: false,
        isNewUser,
      });
    }
    setIsLoading(false);
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
   * Refresh user - just triggers re-check via onAuthStateChange
   */
  const refreshUser = useCallback(async () => {
    // The onAuthStateChange listener will handle this
    // We just need to trigger a refresh of the session
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await handleSession(session.user);
      } else {
        setUser(null);
        setBankroll(null);
        setIsLoading(false);
      }
    } catch {
      // Silent fail - onAuthStateChange will handle state
      setIsLoading(false);
    }
  }, [handleSession]);

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

      setUser(prev => prev ? { ...prev, bettingModeEnabled: enabled } : null);
    } catch (err) {
      console.error('[AUTH] Toggle betting mode failed:', err);
      setError('Failed to update betting mode');
    }
  }, [user]);

  // ============================================================
  // EFFECTS
  // ============================================================

  // Set up auth state listener - this is the PRIMARY auth detection method
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      console.log('[AUTH] Supabase not configured');
      setIsLoading(false);
      return;
    }

    console.log('[AUTH] Setting up auth state listener...');

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AUTH] Auth state change:', event, session?.user?.id ? 'has user' : 'no user');

        if (event === 'INITIAL_SESSION') {
          // This fires when the listener is first set up
          initialCheckDone.current = true;
          if (session?.user) {
            await handleSession(session.user);
          } else {
            setUser(null);
            setBankroll(null);
            setIsLoading(false);
          }
        } else if (event === 'SIGNED_IN' && session?.user) {
          await handleSession(session.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setBankroll(null);
          setIsLoading(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Token refreshed, user is still logged in
          console.log('[AUTH] Token refreshed');
        }
      }
    );

    // Fallback: if INITIAL_SESSION doesn't fire within 3 seconds, stop loading
    const fallbackTimer = setTimeout(() => {
      if (!initialCheckDone.current) {
        console.log('[AUTH] Initial check fallback triggered');
        setIsLoading(false);
      }
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, [handleSession]);

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

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthAvailable(): boolean {
  const context = useContext(AuthContext);
  return context !== null;
}

export function useUser(): SessionUser | null {
  const context = useContext(AuthContext);
  return context?.user ?? null;
}

export function useAuthSafe(): AuthContextValue | null {
  return useContext(AuthContext);
}
