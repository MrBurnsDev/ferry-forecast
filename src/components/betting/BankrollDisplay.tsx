'use client';

/**
 * Bankroll Display
 *
 * Shows the user's current point balance and daily stats.
 * Only visible when betting mode is enabled.
 */

import { useBetting, useBettingAvailable, DEFAULT_BANKROLL } from '@/lib/betting';

interface BankrollDisplayProps {
  className?: string;
  compact?: boolean;
}

export function BankrollDisplay({ className = '', compact = false }: BankrollDisplayProps) {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return <BankrollDisplayInner className={className} compact={compact} />;
}

function BankrollDisplayInner({ className, compact }: BankrollDisplayProps) {
  const { state, isBettingMode } = useBetting();

  // Only show when betting mode is enabled
  if (!isBettingMode) {
    return null;
  }

  const { balance, dailyLimit, spentToday } = state.bankroll;
  const remainingToday = dailyLimit - spentToday;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <CoinsIcon className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium text-foreground">{balance} pts</span>
      </div>
    );
  }

  return (
    <div className={`bg-secondary/50 border border-border/50 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <CoinsIcon className="w-5 h-5 text-accent" />
        <h3 className="font-semibold text-foreground">Your Bankroll</h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Balance */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Balance</p>
          <p className="text-xl font-bold text-foreground">{balance}</p>
          <p className="text-xs text-muted-foreground">points</p>
        </div>

        {/* Today's Activity */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Wagered Today</p>
          <p className="text-xl font-bold text-foreground">{spentToday}</p>
          <p className="text-xs text-muted-foreground">of {dailyLimit} limit</p>
        </div>

        {/* Remaining */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Remaining</p>
          <p className={`text-xl font-bold ${remainingToday > 0 ? 'text-success' : 'text-muted-foreground'}`}>
            {remainingToday}
          </p>
          <p className="text-xs text-muted-foreground">pts today</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${(spentToday / dailyLimit) * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Daily limit resets at midnight
        </p>
      </div>

      {/* Low balance warning */}
      {balance < DEFAULT_BANKROLL.balance * 0.2 && (
        <div className="mt-4 bg-warning-muted/50 border border-warning/30 rounded-lg p-3">
          <p className="text-xs text-warning">
            Low balance! Your bankroll replenishes to {DEFAULT_BANKROLL.balance} pts daily.
          </p>
        </div>
      )}
    </div>
  );
}

function CoinsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="M16.71 13.88l.7.71-2.82 2.82" />
    </svg>
  );
}
