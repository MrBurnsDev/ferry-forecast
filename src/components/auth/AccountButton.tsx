'use client';

/**
 * Account Button Component - SIMPLIFIED
 *
 * Shows "My Account" button in the navigation bar.
 * Opens a dropdown with sign-in options or user menu.
 *
 * Uses session-based auth (session exists = authenticated).
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth, useAuthAvailable } from '@/lib/auth';
import { SignInButtons } from './SignInButtons';

export function AccountButton() {
  const available = useAuthAvailable();

  if (!available) {
    return null;
  }

  return <AccountButtonInner />;
}

function AccountButtonInner() {
  const { session, profile, isAuthenticated, isLoading, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get display name from profile or session
  const displayName = profile?.displayName ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email?.split('@')[0] ||
    'User';

  const provider = profile?.provider ||
    session?.user?.app_metadata?.provider ||
    'google';

  // Loading state
  if (isLoading) {
    return (
      <div className="px-4 py-2 rounded-lg bg-secondary/50 text-muted-foreground text-sm">
        ...
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      {/* Main button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 hover:bg-secondary text-foreground text-sm font-medium transition-colors"
      >
        {isAuthenticated ? (
          <>
            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xs font-medium">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:inline">My Account</span>
            <span className="sm:hidden">Account</span>
          </>
        ) : (
          <>
            <UserIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Sign In</span>
            <span className="sm:hidden">Sign In</span>
          </>
        )}
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
          {isAuthenticated ? (
            <>
              {/* Signed in state */}
              <div className="px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-lg font-medium">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Signed in with {provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : provider}
                    </p>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button
                  onClick={() => {
                    signOut();
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-2"
                >
                  <LogOutIcon className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Not signed in state */}
              <div className="px-4 py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Sign in to save your predictions and compete on leaderboards.
                </p>
                <SignInButtons
                  onSignInStart={() => setIsOpen(false)}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
