'use client';

/**
 * Auth Context - RESET & FIXED
 *
 * CRITICAL RULES:
 * 1. Session exists = user is authenticated (NEVER check DB for auth state)
 * 2. User provisioning is async and non-blocking
 * 3. DB failures NEVER cause logout or redirect
 * 4. Missing user records NEVER block rendering
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
 * App-level user profile (from social_users table)
 * This is OPTIONAL - session alone = authenticated
 */
export interface UserProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  provider: string;
  bettingModeEnabled: boolean;
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
   */
  const provisionUser = useCallback(async (user: SupabaseUser) => {
    if (!supabase) return;

    setProfileLoading(true);

    try {
      const metadata = user.user_metadata || {};
      const displayName =
        (metadata.full_name as string) ||
        (metadata.name as string) ||
        (metadata.email as string)?.split('@')[0] ||
        'User';
      const avatarUrl = (metadata.avatar_url as string) || null;
      const provider = (user.app_metadata?.provider as string) || 'google';

      // Call the CORRECT function that uses auth.uid()
      const { data, error } = await supabase.rpc(
        'get_or_create_social_user',
        {
          p_auth_user_id: user.id, // This IS auth.uid()
          p_display_name: displayName,
          p_avatar_url: avatarUrl,
          p_provider: provider,
        }
      );

      if (error) {
        // Log error but DO NOT affect auth state
        console.error('[AUTH] User provisioning failed (non-fatal):', error.message);
        return;
      }

      if (data) {
        setProfile({
          userId: data.user_id,
          displayName: data.display_name,
          avatarUrl: data.avatar_url,
          provider: data.provider,
          bettingModeEnabled: false, // TODO: Add to social_users if needed
        });
      }
    } catch (err) {
      // Catch-all - NEVER throw, NEVER affect auth
      console.error('[AUTH] User provisioning error (non-fatal):', err);
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

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error('[AUTH] Google sign in error:', error);
    }
  }, []);

  /**
   * Sign in with Apple OAuth
   */
  const signInWithApple = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      console.error('[AUTH] Supabase not configured');
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error('[AUTH] Apple sign in error:', error);
    }
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
        console.log('[AUTH] Auth state change:', event);

        // Update session state
        setSession(newSession);
        setIsLoading(false);

        // Handle events
        if (event === 'SIGNED_IN' && newSession?.user) {
          // Provision user async - NEVER blocks
          provisionUser(newSession.user);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
        } else if (event === 'INITIAL_SESSION') {
          // Initial load - provision if we have a user
          if (newSession?.user) {
            provisionUser(newSession.user);
          }
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
