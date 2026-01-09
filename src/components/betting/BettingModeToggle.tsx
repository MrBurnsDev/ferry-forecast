'use client';

/**
 * Betting Mode Toggle
 *
 * Account settings toggle for enabling/disabling betting mode.
 * When enabled, shows betting terminology and odds throughout the UI.
 * When disabled, shows neutral prediction language.
 */

import { useBetting, useBettingAvailable } from '@/lib/betting';

interface BettingModeToggleProps {
  className?: string;
}

export function BettingModeToggle({ className = '' }: BettingModeToggleProps) {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return <BettingModeToggleInner className={className} />;
}

function BettingModeToggleInner({ className }: BettingModeToggleProps) {
  const { state, toggleBettingMode } = useBetting();
  const enabled = state.settings.enabled;

  return (
    <div className={`bg-secondary/50 border border-border/50 rounded-lg p-4 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <label
            htmlFor="betting-mode-toggle"
            className="text-sm font-medium text-foreground cursor-pointer"
          >
            Enable Betting Mode (Just for Fun)
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            Turns predictions into a points-based betting game. No money. No prizes.
            Just bragging rights and a daily crown.
          </p>
        </div>

        <button
          id="betting-mode-toggle"
          role="switch"
          aria-checked={enabled}
          onClick={() => toggleBettingMode(!enabled)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
            enabled ? 'bg-accent' : 'bg-secondary'
          }`}
        >
          <span className="sr-only">Enable betting mode</span>
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-accent">Betting Mode Active</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">
              {state.bankroll.balance} pts available
            </span>
          </div>

          <div className="mt-3 bg-accent-muted/20 border border-accent/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Remember:</strong> This is just for fun. There&apos;s no real money,
              no prizes, and no gambling. You&apos;re just predicting ferry outcomes
              for points and glory.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact toggle for header/nav use
 */
export function BettingModeToggleCompact() {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return <BettingModeToggleCompactInner />;
}

function BettingModeToggleCompactInner() {
  const { state, toggleBettingMode } = useBetting();
  const enabled = state.settings.enabled;

  return (
    <button
      onClick={() => toggleBettingMode(!enabled)}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        enabled
          ? 'bg-accent text-accent-foreground'
          : 'bg-secondary text-muted-foreground hover:text-foreground'
      }`}
      title={enabled ? 'Disable betting mode' : 'Enable betting mode'}
    >
      <DiceIcon className="w-4 h-4" />
      <span>{enabled ? 'Betting Mode' : 'Prediction Mode'}</span>
    </button>
  );
}

function DiceIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="16" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="16" r="1" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
