'use client';

/**
 * Sailing Bet Card
 *
 * Inline betting interface that integrates with sailing rows.
 * Shows odds preview with quick bet buttons when betting mode is enabled.
 */

import { useState } from 'react';
import {
  useBetting,
  useBettingAvailable,
  getOddsDisplay,
  formatOdds,
  type BetType,
} from '@/lib/betting';
// Auth imports available for future integration when betting persistence is added
// import { useAuth, useAuthAvailable } from '@/lib/auth';
// import { SignInWithFacebookButton } from '@/components/auth';

interface SailingBetCardProps {
  sailingId: string;
  likelihood: number;
  departureTimestampMs: number;
  className?: string;
  compact?: boolean;
}

export function SailingBetCard({
  sailingId,
  likelihood,
  departureTimestampMs,
  className = '',
  compact = false,
}: SailingBetCardProps) {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return (
    <SailingBetCardInner
      sailingId={sailingId}
      likelihood={likelihood}
      departureTimestampMs={departureTimestampMs}
      className={className}
      compact={compact}
    />
  );
}

function SailingBetCardInner({
  sailingId,
  likelihood,
  departureTimestampMs,
  className,
  compact,
}: SailingBetCardProps) {
  const { isBettingMode, lang, placeBet, getBetForSailing, getTimeUntilLock, canPlaceBet } = useBetting();

  const [isPlacing, setIsPlacing] = useState(false);
  const [showConfirm, setShowConfirm] = useState<BetType | null>(null);

  // Get existing bet
  const existingBet = getBetForSailing(sailingId);

  // Get lock status
  const { locked } = getTimeUntilLock(departureTimestampMs);

  // Get odds
  const odds = getOddsDisplay(likelihood);

  // Quick bet handler (25 pts default)
  const handleQuickBet = async (betType: BetType) => {
    // For now, betting works without auth (local storage only)
    // Auth integration for persistence will be added in future phase
    setIsPlacing(true);
    const result = placeBet(sailingId, betType, 25, likelihood, departureTimestampMs);
    setIsPlacing(false);
    setShowConfirm(null);

    if (!result.success) {
      // Could show error toast here
      console.error('Bet failed:', result.error);
    }
  };

  // If there's an existing bet, show it
  if (existingBet) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className={`text-xs px-2 py-0.5 rounded ${
          existingBet.status === 'won'
            ? 'bg-success-muted text-success'
            : existingBet.status === 'lost'
              ? 'bg-destructive-muted text-destructive'
              : 'bg-accent-muted text-accent'
        }`}>
          {isBettingMode ? (
            existingBet.betType === 'will_sail' ? 'Bet: Sail' : 'Bet: Cancel'
          ) : (
            existingBet.betType === 'will_sail' ? 'Predicted: Sail' : 'Predicted: Cancel'
          )}
        </span>
        {existingBet.status === 'won' && existingBet.profit !== null && (
          <span className="text-xs font-medium text-success">+{existingBet.profit}</span>
        )}
        {existingBet.status === 'lost' && (
          <span className="text-xs font-medium text-destructive">-{existingBet.stake}</span>
        )}
      </div>
    );
  }

  // If locked, show nothing or locked indicator
  if (locked) {
    return null;
  }

  // Betting mode: show odds and quick bet buttons
  if (isBettingMode) {
    if (compact) {
      return (
        <div className={`flex items-center gap-1 ${className}`}>
          <button
            onClick={() => setShowConfirm('will_sail')}
            disabled={isPlacing || !canPlaceBet(25)}
            className="text-xs px-2 py-0.5 rounded bg-success-muted/30 border border-success/30 text-success hover:bg-success-muted/50 disabled:opacity-50 transition-colors"
            title={`Bet Will Sail @ ${formatOdds(odds.sailOdds)}`}
          >
            {formatOdds(odds.sailOdds)}
          </button>
          <span className="text-xs text-muted-foreground">/</span>
          <button
            onClick={() => setShowConfirm('will_cancel')}
            disabled={isPlacing || !canPlaceBet(25)}
            className="text-xs px-2 py-0.5 rounded bg-destructive-muted/30 border border-destructive/30 text-destructive hover:bg-destructive-muted/50 disabled:opacity-50 transition-colors"
            title={`Bet Will Cancel @ ${formatOdds(odds.cancelOdds)}`}
          >
            {formatOdds(odds.cancelOdds)}
          </button>

          {/* Quick confirm tooltip */}
          {showConfirm && (
            <div className="absolute z-10 bg-popover border border-border rounded-lg shadow-lg p-2 mt-8 -ml-4">
              <p className="text-xs text-muted-foreground mb-2">
                Quick bet 25 pts on {showConfirm === 'will_sail' ? 'SAIL' : 'CANCEL'}?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleQuickBet(showConfirm)}
                  className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowConfirm(null)}
                  className="text-xs px-2 py-1 rounded bg-secondary text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Full betting card
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <button
          onClick={() => handleQuickBet('will_sail')}
          disabled={isPlacing || !canPlaceBet(25)}
          className="flex-1 py-2 rounded-lg bg-success-muted/30 border border-success/30 text-success font-medium hover:bg-success-muted/50 disabled:opacity-50 transition-colors"
        >
          <span className="text-lg font-bold">{formatOdds(odds.sailOdds)}</span>
          <span className="text-xs block">Will Sail</span>
        </button>
        <button
          onClick={() => handleQuickBet('will_cancel')}
          disabled={isPlacing || !canPlaceBet(25)}
          className="flex-1 py-2 rounded-lg bg-destructive-muted/30 border border-destructive/30 text-destructive font-medium hover:bg-destructive-muted/50 disabled:opacity-50 transition-colors"
        >
          <span className="text-lg font-bold">{formatOdds(odds.cancelOdds)}</span>
          <span className="text-xs block">Will Cancel</span>
        </button>
      </div>
    );
  }

  // Neutral mode: simple prediction buttons
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={() => handleQuickBet('will_sail')}
        disabled={isPlacing}
        className="text-xs px-3 py-1 rounded bg-success-muted/30 border border-success/30 text-success hover:bg-success-muted/50 disabled:opacity-50 transition-colors"
      >
        {lang.sailOption}
      </button>
      <button
        onClick={() => handleQuickBet('will_cancel')}
        disabled={isPlacing}
        className="text-xs px-3 py-1 rounded bg-destructive-muted/30 border border-destructive/30 text-destructive hover:bg-destructive-muted/50 disabled:opacity-50 transition-colors"
      >
        {lang.cancelOption}
      </button>
    </div>
  );
}

/**
 * Odds-only display (no betting, just shows the implied odds)
 */
export function OddsDisplay({
  likelihood,
  className = '',
}: {
  likelihood: number;
  className?: string;
}) {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return <OddsDisplayInner likelihood={likelihood} className={className} />;
}

function OddsDisplayInner({ likelihood, className }: { likelihood: number; className?: string }) {
  const { isBettingMode } = useBetting();

  // Only show in betting mode
  if (!isBettingMode) {
    return null;
  }

  const odds = getOddsDisplay(likelihood);

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <span className="text-success" title="Odds for Will Sail">
        {formatOdds(odds.sailOdds)}
      </span>
      <span className="text-muted-foreground">/</span>
      <span className="text-destructive" title="Odds for Will Cancel">
        {formatOdds(odds.cancelOdds)}
      </span>
    </div>
  );
}
