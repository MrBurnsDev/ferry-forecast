'use client';

/**
 * AddToHomeScreenPrompt Component
 *
 * A mobile-first bottom sheet prompt encouraging users to install
 * Ferry Forecast as a PWA on their home screen.
 *
 * Features:
 * - Platform-aware: Shows iOS instructions vs Android native prompt
 * - Non-intrusive: Delayed appearance, dismissible
 * - Branded: Uses Ferry Forecast maritime styling
 * - Accessible: Proper ARIA labels, keyboard navigation
 */

import { useEffect, useState } from 'react';
import { useAddToHomeScreen } from '@/hooks/useAddToHomeScreen';

// Share/export icon for iOS Safari
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16,6 12,2 8,6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// Plus icon for "Add to Home Screen"
function PlusSquareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// X icon for close button
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function AddToHomeScreenPrompt() {
  const {
    canShowPrompt,
    triggerInstall,
    dismissPrompt,
    showIOSInstructions,
  } = useAddToHomeScreen();

  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Animate in when prompt becomes available
  useEffect(() => {
    if (canShowPrompt) {
      // Small delay for smoother animation
      const timer = setTimeout(() => {
        setIsVisible(true);
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [canShowPrompt]);

  // Handle dismiss with animation
  const handleDismiss = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsVisible(false);
      dismissPrompt();
    }, 300);
  };

  // Handle install click
  const handleInstall = async () => {
    if (showIOSInstructions) {
      // For iOS, just dismiss - user follows manual instructions
      handleDismiss();
    } else {
      // For Android, trigger native prompt
      await triggerInstall();
      handleDismiss();
    }
  };

  // Don't render if not showing
  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-prompt-title"
        className={`fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${
          isAnimating ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white rounded-t-2xl shadow-2xl mx-auto max-w-lg">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="px-6 pb-8">
            {/* App Icon and Title */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg flex-shrink-0 bg-[#1a365d]">
                <img
                  src="/icons/icon-192x192.png"
                  alt="Ferry Forecast"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2
                  id="pwa-prompt-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Add Ferry Forecast to your Home Screen
                </h2>
              </div>
            </div>

            {/* Description */}
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              Get instant access to sailings, delays, and likelihood to run - even
              with spotty service at the terminal.
            </p>

            {/* iOS-specific instructions */}
            {showIOSInstructions && (
              <div className="bg-blue-50 rounded-xl p-4 mb-6">
                <p className="text-sm font-medium text-blue-900 mb-3">
                  To install on iOS:
                </p>
                <ol className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-blue-800">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex-shrink-0">
                      1
                    </span>
                    <span className="flex items-center gap-2">
                      Tap the
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-white rounded-lg shadow-sm border border-blue-200">
                        <ShareIcon className="w-4 h-4 text-blue-600" />
                      </span>
                      Share button
                    </span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-blue-800">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex-shrink-0">
                      2
                    </span>
                    <span className="flex items-center gap-2">
                      Select
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg shadow-sm border border-blue-200 text-blue-700 text-xs font-medium">
                        <PlusSquareIcon className="w-4 h-4" />
                        Add to Home Screen
                      </span>
                    </span>
                  </li>
                </ol>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleInstall}
                className="w-full py-3.5 px-4 bg-[#1a365d] text-white font-medium rounded-xl hover:bg-[#2a4a7d] active:bg-[#0f2340] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1a365d] focus:ring-offset-2"
              >
                {showIOSInstructions ? 'Got it' : 'Add to Home Screen'}
              </button>
              <button
                onClick={handleDismiss}
                className="w-full py-3 px-4 text-gray-600 font-medium rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>

          {/* Safe area padding for iOS */}
          <div className="h-safe-area-inset-bottom" />
        </div>
      </div>
    </>
  );
}

export default AddToHomeScreenPrompt;
