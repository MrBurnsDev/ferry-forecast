'use client';

/**
 * User Menu Component
 *
 * Shows user avatar + dropdown menu when signed in.
 * Shows sign-in button when not authenticated.
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth, useAuthAvailable } from '@/lib/auth';
import { SignInWithFacebookButton } from './SignInWithFacebookButton';

interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className = '' }: UserMenuProps) {
  const available = useAuthAvailable();

  if (!available) {
    return null;
  }

  return <UserMenuInner className={className} />;
}

function UserMenuInner({ className }: UserMenuProps) {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
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

  // Loading state
  if (isLoading) {
    return (
      <div className={`w-8 h-8 rounded-full bg-secondary animate-pulse ${className}`} />
    );
  }

  // Not authenticated - show sign-in button
  if (!isAuthenticated || !user) {
    return (
      <SignInWithFacebookButton variant="compact" className={className} />
    );
  }

  // Authenticated - show user menu
  return (
    <div ref={menuRef} className={`relative ${className}`}>
      {/* Avatar button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full hover:ring-2 hover:ring-accent/30 transition-all"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-medium">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
          {/* User info */}
          <div className="px-4 py-3 border-b border-border/50">
            <p className="font-medium text-foreground truncate">
              {user.displayName}
            </p>
            <p className="text-xs text-muted-foreground">
              Signed in with Facebook
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => {
                signOut();
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-secondary/50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact user indicator (avatar only, no dropdown)
 */
export function UserAvatar({ className = '' }: { className?: string }) {
  const available = useAuthAvailable();

  if (!available) {
    return null;
  }

  return <UserAvatarInner className={className} />;
}

function UserAvatarInner({ className }: { className?: string }) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.displayName}
          className="w-6 h-6 rounded-full object-cover"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xs font-medium">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm font-medium text-foreground truncate max-w-[100px]">
        {user.displayName}
      </span>
    </div>
  );
}
