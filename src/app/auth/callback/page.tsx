'use client';

/**
 * OAuth Callback Page
 *
 * Handles the redirect from Facebook OAuth.
 * Supabase automatically processes the auth code and establishes the session.
 * This page shows a loading state and redirects to the original page.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-muted flex items-center justify-center animate-pulse">
          <LoadingIcon className="w-8 h-8 text-accent" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Completing Sign In...
        </h1>
        <p className="text-muted-foreground">
          Just a moment while we set up your account.
        </p>
      </div>
    </div>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      if (!isSupabaseConfigured() || !supabase) {
        setError('Authentication not configured');
        return;
      }

      // Check for error in URL (OAuth failure)
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (errorParam) {
        console.error('[AUTH CALLBACK] OAuth error:', errorParam, errorDescription);
        setError(errorDescription || 'Sign in was cancelled or failed');
        return;
      }

      try {
        // Supabase handles the code exchange automatically via the URL hash
        // We just need to verify the session was established
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[AUTH CALLBACK] Session error:', sessionError);
          setError('Failed to complete sign in');
          return;
        }

        if (!session) {
          // Give Supabase a moment to process the auth
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Check again
          const { data: { session: retrySession } } = await supabase.auth.getSession();

          if (!retrySession) {
            setError('Sign in failed. Please try again.');
            return;
          }
        }

        // Success - redirect to home or stored redirect URL
        const redirectTo = localStorage.getItem('auth_redirect') || '/';
        localStorage.removeItem('auth_redirect');

        router.replace(redirectTo);
      } catch (err) {
        console.error('[AUTH CALLBACK] Error:', err);
        setError('Something went wrong. Please try again.');
      }
    };

    handleCallback();
  }, [router, searchParams]);

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md mx-auto p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive-muted flex items-center justify-center">
            <AlertIcon className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Sign In Problem
          </h1>
          <p className="text-muted-foreground mb-6">
            {error}
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  return <LoadingState />;
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
