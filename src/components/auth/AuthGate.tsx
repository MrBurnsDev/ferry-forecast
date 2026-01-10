'use client';

/**
 * Auth Gate Component
 *
 * Wrapper that shows sign-in CTA if not authenticated,
 * or renders children if signed in.
 *
 * Phase 85: Updated for Google/Apple OAuth (Facebook removed).
 */

import { useAuth, useAuthAvailable } from '@/lib/auth';
import { SignInButtons } from './SignInButtons';

interface AuthGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  message?: string;
}

export function AuthGate({
  children,
  fallback,
  message = 'Sign in to play',
}: AuthGateProps) {
  const available = useAuthAvailable();

  if (!available) {
    // Provider not mounted - show fallback or nothing
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <AuthGateInner message={message} fallback={fallback}>
      {children}
    </AuthGateInner>
  );
}

function AuthGateInner({
  children,
  fallback,
  message,
}: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="animate-pulse text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  // Not authenticated - show sign-in CTA
  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="bg-secondary/50 border border-border/50 rounded-lg p-6 text-center">
        <div className="max-w-xs mx-auto">
          <LockIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium mb-4">
            {message}
          </p>
          <SignInButtons />
        </div>
      </div>
    );
  }

  // Authenticated - render children
  return <>{children}</>;
}

/**
 * Inline auth gate for smaller contexts
 */
export function AuthGateInline({
  children,
}: {
  children: React.ReactNode;
}) {
  const available = useAuthAvailable();

  if (!available) {
    return null;
  }

  return (
    <AuthGateInlineInner>
      {children}
    </AuthGateInlineInner>
  );
}

function AuthGateInlineInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <span className="text-muted-foreground">...</span>;
  }

  if (!isAuthenticated) {
    return (
      <SignInButtons variant="compact" />
    );
  }

  return <>{children}</>;
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
