'use client';

/**
 * OAuth Callback Page
 *
 * Handles the redirect from OAuth providers (Google, Apple).
 * Uses PKCE flow - the Supabase client detects and processes the auth tokens
 * from the URL hash automatically via detectSessionInUrl.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check for error in URL params
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error) {
      console.error('[AUTH CALLBACK] OAuth error:', error, errorDescription);
      setStatus('error');
      setErrorMessage(errorDescription || error || 'Sign in failed');
      return;
    }

    // The Supabase client with detectSessionInUrl: true will automatically
    // process the auth tokens from the URL hash/params when it initializes.
    // We just need to wait a moment for this to complete, then redirect.

    const timer = setTimeout(() => {
      // Get redirect URL from localStorage or default to home
      const redirectTo = localStorage.getItem('auth_redirect') || '/';
      localStorage.removeItem('auth_redirect');

      console.log('[AUTH CALLBACK] Redirecting to:', redirectTo);
      setStatus('success');
      router.replace(redirectTo);
    }, 1500); // Give Supabase time to process the auth

    return () => clearTimeout(timer);
  }, [router]);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md mx-auto p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertIcon className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Sign In Problem
          </h1>
          <p className="text-muted-foreground mb-6">
            {errorMessage}
          </p>
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
          {status === 'success' ? 'Signed In!' : 'Completing Sign In...'}
        </h1>
        <p className="text-muted-foreground">
          {status === 'success' ? 'Redirecting you now.' : 'Just a moment while we set up your account.'}
        </p>
      </div>
    </div>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
