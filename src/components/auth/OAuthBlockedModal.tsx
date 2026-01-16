'use client';

/**
 * OAuth Blocked Modal
 *
 * Displayed when Google OAuth cannot be used due to browser restrictions.
 * This prevents users from ever seeing Google's 403 disallowed_useragent error.
 *
 * Common scenarios:
 * - iOS/iPadOS standalone PWA (Add to Home Screen)
 * - In-app browsers (Facebook, Instagram, Gmail, etc.)
 * - Embedded WebViews
 *
 * The modal provides clear instructions on how to proceed.
 */

import { useState, useCallback } from 'react';
import { getCanonicalUrl } from '@/lib/auth/oauth-safety';

interface OAuthBlockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockReason: string;
  isStandalone: boolean;
  isInAppBrowser: boolean;
  inAppBrowserName: string | null;
}

export function OAuthBlockedModal({
  isOpen,
  onClose,
  blockReason,
  isStandalone,
  isInAppBrowser,
  inAppBrowserName,
}: OAuthBlockedModalProps) {
  const [copied, setCopied] = useState(false);
  const canonicalUrl = getCanonicalUrl();

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = canonicalUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [canonicalUrl]);

  const handleOpenInSafari = useCallback(() => {
    // On iOS, this may prompt to open in Safari
    // Not guaranteed to work in all in-app browsers
    window.location.href = canonicalUrl;
  }, [canonicalUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oauth-blocked-title"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
              <SafariIcon className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2
                id="oauth-blocked-title"
                className="text-lg font-semibold text-foreground"
              >
                Open in Safari
              </h2>
              <p className="text-sm text-muted-foreground">
                to sign in with Google
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {blockReason}
          </p>

          {/* Explanation based on context */}
          <div className="bg-secondary/50 rounded-lg p-4 mb-4">
            {isStandalone && (
              <div className="flex gap-3">
                <InfoIcon className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    <strong>Why?</strong> Google requires a full browser for secure sign-in.
                    Home screen apps use a limited browser that Google blocks.
                  </p>
                  <p>
                    <strong>Solution:</strong> Open Safari and visit this site directly.
                    You can still use the home screen app after signing in.
                  </p>
                </div>
              </div>
            )}

            {isInAppBrowser && (
              <div className="flex gap-3">
                <InfoIcon className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    <strong>Why?</strong> {inAppBrowserName || 'This app'} uses a built-in
                    browser that Google blocks for security reasons.
                  </p>
                  <p>
                    <strong>Solution:</strong> Copy the link below and paste it into Safari
                    or Chrome.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* URL Copy Section */}
        <div className="px-6 pb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Copy this link:
          </label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 bg-secondary rounded-lg text-sm text-foreground font-mono truncate">
              {canonicalUrl}
            </div>
            <button
              onClick={handleCopyUrl}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                copied
                  ? 'bg-green-500 text-white'
                  : 'bg-accent text-accent-foreground hover:bg-accent/90'
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-2">
          <button
            onClick={handleOpenInSafari}
            className="w-full px-4 py-3 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
          >
            <ExternalLinkIcon className="w-4 h-4" />
            Try Opening in Safari
          </button>

          <button
            onClick={onClose}
            className="w-full px-4 py-3 text-muted-foreground rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Footer note */}
        <div className="px-6 pb-4 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground text-center">
            This is a Google security requirement, not a limitation of this site.
          </p>
        </div>
      </div>
    </div>
  );
}

function SafariIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default OAuthBlockedModal;
