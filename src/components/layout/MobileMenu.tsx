'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useBetting, useBettingAvailable } from '@/lib/betting';

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function ClipboardListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, signOut } = useAuth();
  const bettingAvailable = useBettingAvailable();

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
        aria-label="Open menu"
      >
        <MenuIcon className="w-6 h-6 text-foreground" />
      </button>

      {/* Overlay - uses navy theme color */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-[#1a365d]/85 z-[60]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-out Menu */}
      <div
        className={`fixed top-0 right-0 h-full w-72 z-[70] transform transition-transform duration-300 ease-in-out bg-white ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ backgroundColor: '#ffffff', isolation: 'isolate' }}
      >
        {/* Solid background layer to prevent bleed-through */}
        <div className="absolute inset-0 bg-white" style={{ backgroundColor: '#ffffff' }} />

        {/* Content wrapper - relative to sit above background */}
        <div className="relative h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200" style={{ backgroundColor: '#1a365d' }}>
          <span className="font-semibold text-white">Menu</span>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg hover:bg-white/20 transition-colors"
            aria-label="Close menu"
          >
            <CloseIcon className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-2">
          <Link
            href="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <HomeIcon className="w-5 h-5 text-[#1a365d]" />
            <span className="text-gray-900">Home</span>
          </Link>
          <Link
            href="/region/cci"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <GlobeIcon className="w-5 h-5 text-[#1a365d]" />
            <span className="text-gray-900">Cape Cod &amp; Islands</span>
          </Link>
          <Link
            href="/account"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <UserIcon className="w-5 h-5 text-[#1a365d]" />
            <span className="text-gray-900">Account</span>
          </Link>
          {/* Leaderboard - only shown when betting/predictions is enabled */}
          {bettingAvailable && (
            <LeaderboardLink onClose={() => setIsOpen(false)} />
          )}
          {/* My Predictions - only shown when betting/predictions is enabled */}
          {bettingAvailable && (
            <MyPredictionsLink onClose={() => setIsOpen(false)} />
          )}
        </nav>

        {/* Divider */}
        <div className="mx-4 border-t border-gray-200" />

        {/* Footer Links */}
        <div className="p-4 space-y-2">
          <Link
            href="/about"
            onClick={() => setIsOpen(false)}
            className="block p-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            About
          </Link>
          <Link
            href="/privacy"
            onClick={() => setIsOpen(false)}
            className="block p-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            onClick={() => setIsOpen(false)}
            className="block p-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Terms
          </Link>
        </div>

        {/* Sign Out Button - only shown when authenticated */}
        {isAuthenticated && (
          <>
            <div className="mx-4 border-t border-gray-200" />
            <div className="p-4">
              <button
                onClick={() => {
                  signOut();
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 w-full p-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOutIcon className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </>
        )}
        </div>{/* End content wrapper */}
      </div>
    </>
  );
}

/**
 * Leaderboard link - only renders when bettingEnabled is true
 */
function LeaderboardLink({ onClose }: { onClose: () => void }) {
  const { bettingEnabled } = useBetting();

  // Only show when game mode is actually enabled
  if (!bettingEnabled) {
    return null;
  }

  return (
    <Link
      href="/leaderboard"
      onClick={onClose}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <TrophyIcon className="w-5 h-5 text-[#1a365d]" />
      <span className="text-gray-900">Leaderboard</span>
    </Link>
  );
}

/**
 * My Predictions link - only renders when bettingEnabled is true
 */
function MyPredictionsLink({ onClose }: { onClose: () => void }) {
  const { bettingEnabled } = useBetting();

  // Only show when game mode is actually enabled
  if (!bettingEnabled) {
    return null;
  }

  return (
    <Link
      href="/predictions"
      onClick={onClose}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <ClipboardListIcon className="w-5 h-5 text-[#1a365d]" />
      <span className="text-gray-900">My Predictions</span>
    </Link>
  );
}
