'use client';

/**
 * Sign In With Facebook Button
 *
 * One-click Facebook OAuth sign-in button.
 * Uses neutral language (no gambling/betting references).
 */

import { useAuth, useAuthAvailable } from '@/lib/auth';

interface SignInWithFacebookButtonProps {
  className?: string;
  variant?: 'default' | 'compact' | 'text';
  redirectTo?: string;
}

export function SignInWithFacebookButton({
  className = '',
  variant = 'default',
  redirectTo,
}: SignInWithFacebookButtonProps) {
  const available = useAuthAvailable();

  if (!available) {
    return null;
  }

  return (
    <SignInWithFacebookButtonInner
      className={className}
      variant={variant}
      redirectTo={redirectTo}
    />
  );
}

function SignInWithFacebookButtonInner({
  className,
  variant,
  redirectTo,
}: SignInWithFacebookButtonProps) {
  const { signInWithFacebook, isLoading, error } = useAuth();

  const handleClick = () => {
    // Store redirect URL for after OAuth
    if (redirectTo) {
      localStorage.setItem('auth_redirect', redirectTo);
    } else if (typeof window !== 'undefined') {
      localStorage.setItem('auth_redirect', window.location.pathname);
    }

    signInWithFacebook();
  };

  // Compact variant (for inline use)
  if (variant === 'compact') {
    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#1877F2] text-white hover:bg-[#166FE5] disabled:opacity-50 transition-colors ${className}`}
      >
        <FacebookIcon className="w-4 h-4" />
        <span>Sign in</span>
      </button>
    );
  }

  // Text variant (minimal, for links)
  if (variant === 'text') {
    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`text-accent hover:underline disabled:opacity-50 ${className}`}
      >
        Sign in with Facebook
      </button>
    );
  }

  // Default variant (full button)
  return (
    <div className={className}>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg bg-[#1877F2] text-white font-medium hover:bg-[#166FE5] disabled:opacity-50 transition-colors"
      >
        <FacebookIcon className="w-5 h-5" />
        <span>{isLoading ? 'Connecting...' : 'Continue with Facebook'}</span>
      </button>

      {error && (
        <p className="mt-2 text-sm text-destructive text-center">
          {error}
        </p>
      )}

      <p className="mt-3 text-xs text-muted-foreground text-center">
        We only access your name and profile picture.
      </p>
    </div>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}
