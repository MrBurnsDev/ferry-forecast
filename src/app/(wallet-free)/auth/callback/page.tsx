'use client';

/**
 * OAuth Callback Page - SIMPLIFIED
 *
 * Rules:
 * 1. Let Supabase complete OAuth (detectSessionInUrl handles this)
 * 2. Redirect ONCE after session is detected
 * 3. NO timers, NO retries, NO polling
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // DIAGNOSTIC: Log callback page load with full URL details
    const fullUrl = window.location.href;
    const origin = window.location.origin;
    const isWww = origin.includes('www.');
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));

    console.log('[AUTH_DIAG] Callback Page Loaded:', {
      fullUrl: fullUrl.substring(0, 150), // Truncate for safety
      origin,
      isWww,
      pathname: window.location.pathname,
      hasCode: params.has('code'),
      hasError: params.has('error'),
      hasHashAccessToken: hashParams.has('access_token'),
      hasHashError: hashParams.has('error'),
      timestamp: new Date().toISOString(),
    });

    // Check for OAuth error in URL (both query params and hash)
    const urlError = params.get('error') || hashParams.get('error');
    const errorDescription = params.get('error_description') || hashParams.get('error_description');

    if (urlError) {
      console.error('[AUTH_DIAG] Callback OAuth Error:', {
        error: urlError,
        description: errorDescription,
        origin,
        isWww,
        fullUrl: fullUrl.substring(0, 150),
      });
      setError(errorDescription || urlError);
      return;
    }

    if (!supabase) {
      console.error('[AUTH_DIAG] Callback - Supabase not configured');
      setError('Authentication not configured');
      return;
    }

    // DIAGNOSTIC: Track time waiting for auth state change
    const startTime = Date.now();
    let authStateReceived = false;

    // Listen for auth state change - Supabase will fire SIGNED_IN when ready
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        authStateReceived = true;
        const elapsed = Date.now() - startTime;

        console.log('[AUTH_DIAG] Callback Auth State:', {
          event,
          hasSession: !!session,
          userId: session?.user?.id,
          provider: session?.user?.app_metadata?.provider,
          elapsedMs: elapsed,
          origin,
          isWww,
        });

        if (session) {
          // We have a session - redirect immediately
          const redirectTo = localStorage.getItem('auth_redirect') || '/';
          localStorage.removeItem('auth_redirect');
          console.log('[AUTH_DIAG] Callback Success - Redirecting:', {
            redirectTo,
            elapsedMs: elapsed,
          });
          router.replace(redirectTo);
        } else if (event === 'INITIAL_SESSION') {
          // DIAGNOSTIC: No session on initial - this is a failure state
          console.warn('[AUTH_DIAG] Callback INITIAL_SESSION with no session:', {
            origin,
            isWww,
            hasCode: params.has('code'),
            elapsedMs: elapsed,
          });
        }
      }
    );

    // DIAGNOSTIC: Log if we're stuck waiting
    const stuckTimer = setTimeout(() => {
      if (!authStateReceived) {
        console.warn('[AUTH_DIAG] Callback Stuck - No auth state after 10s:', {
          origin,
          isWww,
          hasCode: params.has('code'),
          fullUrl: fullUrl.substring(0, 150),
        });
      }
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(stuckTimer);
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md mx-auto p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertIcon className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Sign In Problem
          </h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center animate-pulse">
          <LoadingIcon className="w-8 h-8 text-accent" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Completing Sign In...
        </h1>
        <p className="text-muted-foreground">
          Just a moment.
        </p>
      </div>
    </div>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
