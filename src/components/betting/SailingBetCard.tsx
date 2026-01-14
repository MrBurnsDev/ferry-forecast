'use client';

/**
 * Sailing Bet Card
 *
 * Inline betting interface that integrates with sailing rows.
 * Shows odds preview with quick bet buttons when betting mode is enabled.
 *
 * Phase 86E: Removed serverAuthReady gating - betting UI activates
 * as soon as client-side session exists.
 * Phase 86F: Simplified to thumbs up/down model - no betting math in UI.
 * Phase 91: Added lockout window explanation for disabled controls.
 */

import { useState } from 'react';
import {
  useBetting,
  useBettingAvailable,
  BETTING_LOCKOUT_MINUTES,
  type BetType,
} from '@/lib/betting';

// Phase 88: Simplified props - no odds display needed
interface SailingBetCardProps {
  sailingId: string;
  corridorId: string; // Required - must come from board.corridor.id
  departureTimestampMs: number; // Still needed for lock status
  className?: string;
  compact?: boolean;
}

export function SailingBetCard({
  sailingId,
  corridorId,
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
      corridorId={corridorId}
      departureTimestampMs={departureTimestampMs}
      className={className}
      compact={compact}
    />
  );
}

function SailingBetCardInner({
  sailingId,
  corridorId,
  departureTimestampMs,
  className,
  compact,
}: SailingBetCardProps) {
  const { bettingEnabled, isBettingMode, lang, placeBet, getBetForSailing, getTimeUntilLock, canPlaceBet, refreshBets } = useBetting();

  // Hooks must be called unconditionally
  const [isPlacing, setIsPlacing] = useState(false);
  const [showConfirm, setShowConfirm] = useState<BetType | null>(null);
  const [justPlaced, setJustPlaced] = useState<BetType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get existing bet
  const existingBet = getBetForSailing(sailingId);

  // Get lock status
  const { locked } = getTimeUntilLock(departureTimestampMs);

  // CRITICAL: Return null if betting is not enabled - component should be completely absent
  if (!bettingEnabled) {
    return null;
  }

  // Phase 86F: Quick bet handler - sends intent only, server computes all math
  // Phase 91: Added immediate feedback with toast and refreshBets reconciliation
  const handleQuickBet = async (betType: BetType) => {
    // Defensive runtime check
    if (!corridorId) {
      console.error('[BETTING] Missing corridorId for bet', { sailingId });
      return;
    }
    setIsPlacing(true);
    setError(null);
    const result = await placeBet(sailingId, corridorId, betType);
    setIsPlacing(false);
    setShowConfirm(null);

    if (result.success) {
      // Show success confirmation briefly
      setJustPlaced(betType);
      setTimeout(() => setJustPlaced(null), 2000);
      // Trigger background sync to reconcile
      refreshBets();
    } else {
      // Show user-friendly error
      setError(result.error || 'Failed to place prediction');
      setTimeout(() => setError(null), 3000);
    }
  };

  // Show success confirmation toast (briefly after placing bet)
  if (justPlaced) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-xs px-2 py-0.5 rounded bg-success-muted text-success animate-pulse">
          {justPlaced === 'will_sail' ? '👍' : '👎'} Prediction placed!
        </span>
      </div>
    );
  }

  // Show error message (briefly after failed bet)
  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-xs px-2 py-0.5 rounded bg-destructive-muted text-destructive">
          {error}
        </span>
      </div>
    );
  }

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
          {existingBet.betType === 'will_sail' ? 'Predicted: Sail' : 'Predicted: Cancel'}
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

  // If locked, show disabled indicator with explanation
  if (locked) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-1 opacity-50">
          <button
            disabled
            className="text-xs px-2 py-0.5 rounded bg-secondary/30 border border-border/30 text-muted-foreground cursor-not-allowed"
            title={`Predictions close ${BETTING_LOCKOUT_MINUTES} minutes before departure`}
          >
            👍
          </button>
          <span className="text-xs text-muted-foreground">/</span>
          <button
            disabled
            className="text-xs px-2 py-0.5 rounded bg-secondary/30 border border-border/30 text-muted-foreground cursor-not-allowed"
            title={`Predictions close ${BETTING_LOCKOUT_MINUTES} minutes before departure`}
          >
            👎
          </button>
        </div>
        <span className="text-xs text-muted-foreground italic">
          Closed
        </span>
      </div>
    );
  }

  // Betting mode: show thumbs up/down buttons (Phase 88: no odds display)
  if (isBettingMode) {
    if (compact) {
      return (
        <div className={`flex items-center gap-1 ${className}`}>
          <button
            onClick={() => setShowConfirm('will_sail')}
            disabled={isPlacing || !canPlaceBet()}
            className="text-xs px-2 py-0.5 rounded bg-success-muted/30 border border-success/30 text-success hover:bg-success-muted/50 disabled:opacity-50 transition-colors"
            title="Predict: Will Sail"
          >
            👍
          </button>
          <span className="text-xs text-muted-foreground">/</span>
          <button
            onClick={() => setShowConfirm('will_cancel')}
            disabled={isPlacing || !canPlaceBet()}
            className="text-xs px-2 py-0.5 rounded bg-destructive-muted/30 border border-destructive/30 text-destructive hover:bg-destructive-muted/50 disabled:opacity-50 transition-colors"
            title="Predict: Will Cancel"
          >
            👎
          </button>

          {/* Quick confirm tooltip */}
          {showConfirm && (
            <div className="absolute z-10 bg-popover border border-border rounded-lg shadow-lg p-2 mt-8 -ml-4">
              <p className="text-xs text-muted-foreground mb-2">
                Predict {showConfirm === 'will_sail' ? 'SAIL' : 'CANCEL'}?
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
          disabled={isPlacing || !canPlaceBet()}
          className="flex-1 py-2 rounded-lg bg-success-muted/30 border border-success/30 text-success font-medium hover:bg-success-muted/50 disabled:opacity-50 transition-colors"
        >
          <span className="text-lg">👍</span>
          <span className="text-xs block">Will Sail</span>
        </button>
        <button
          onClick={() => handleQuickBet('will_cancel')}
          disabled={isPlacing || !canPlaceBet()}
          className="flex-1 py-2 rounded-lg bg-destructive-muted/30 border border-destructive/30 text-destructive font-medium hover:bg-destructive-muted/50 disabled:opacity-50 transition-colors"
        >
          <span className="text-lg">👎</span>
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
        disabled={isPlacing || !canPlaceBet()}
        className="text-xs px-3 py-1 rounded bg-success-muted/30 border border-success/30 text-success hover:bg-success-muted/50 disabled:opacity-50 transition-colors"
      >
        {lang.sailOption}
      </button>
      <button
        onClick={() => handleQuickBet('will_cancel')}
        disabled={isPlacing || !canPlaceBet()}
        className="text-xs px-3 py-1 rounded bg-destructive-muted/30 border border-destructive/30 text-destructive hover:bg-destructive-muted/50 disabled:opacity-50 transition-colors"
      >
        {lang.cancelOption}
      </button>
    </div>
  );
}
