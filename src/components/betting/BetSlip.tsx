'use client';

/**
 * Bet Slip Component
 *
 * The main betting interface for a sailing. Shows:
 * - Betting mode: Odds, stake selection, payout preview
 * - Neutral mode: Simple prediction buttons
 *
 * Adapts language based on betting mode setting.
 *
 * Phase 86E: Removed serverAuthReady gating - betting UI activates
 * as soon as client-side session exists.
 * Phase 86F: Simplified to thumbs up/down model - no stake selection,
 *            server computes all betting math.
 */

import { useState } from 'react';
import {
  useBetting,
  useBettingAvailable,
  type BetType,
} from '@/lib/betting';
// Phase 86F: Removed BET_SIZES, getTimeBonus, BetSize - server uses default stake
// Auth imports available for future integration when betting persistence is added
// import { useAuth, useAuthAvailable } from '@/lib/auth';
// import { AuthGate } from '@/components/auth';

interface BetSlipProps {
  sailingId: string;
  corridorId: string;           // Required - must come from board.corridor.id
  departureTimestampMs: number;
  departureTimeDisplay: string; // e.g., "9:30 AM"
  routeDisplay: string;         // e.g., "Woods Hole → Vineyard Haven"
  className?: string;
}

export function BetSlip({
  sailingId,
  corridorId,
  departureTimestampMs,
  departureTimeDisplay,
  routeDisplay,
  className = '',
}: BetSlipProps) {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return (
    <BetSlipInner
      sailingId={sailingId}
      corridorId={corridorId}
      departureTimestampMs={departureTimestampMs}
      departureTimeDisplay={departureTimeDisplay}
      routeDisplay={routeDisplay}
      className={className}
    />
  );
}

function BetSlipInner({
  sailingId,
  corridorId,
  departureTimestampMs,
  departureTimeDisplay,
  routeDisplay,
  className,
}: BetSlipProps) {
  const { bettingEnabled, isBettingMode, lang, placeBet, getBetForSailing, canPlaceBet, getTimeUntilLock } = useBetting();

  // Hooks must be called unconditionally
  // Phase 86F: Removed selectedBetType, selectedStake - server computes everything
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get existing bet for this sailing
  const existingBet = getBetForSailing(sailingId);

  // CRITICAL: Return null if betting is not enabled - component should be completely absent
  if (!bettingEnabled) {
    return null;
  }

  // Get lock status
  const { minutes: minutesUntilLock, locked } = getTimeUntilLock(departureTimestampMs);

  // Phase 86F: Simplified bet handler - sends intent only
  const handlePlaceBet = async (betType: BetType) => {
    if (!corridorId) {
      setError('corridorId required for betting');
      return;
    }

    setIsPlacing(true);
    setError(null);

    const result = await placeBet(sailingId, corridorId, betType);

    if (!result.success) {
      setError(result.error || 'Failed to place bet');
    }
    // Phase 86F: No need to track selectedBetType - just refresh happens via context

    setIsPlacing(false);
  };

  // If already bet on this sailing, show the existing bet
  if (existingBet) {
    return (
      <div className={`bg-accent-muted/20 border border-accent/30 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            {isBettingMode ? 'Your Bet' : 'Your Prediction'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            existingBet.status === 'won'
              ? 'bg-success-muted text-success'
              : existingBet.status === 'lost'
                ? 'bg-destructive-muted text-destructive'
                : 'bg-accent-muted text-accent'
          }`}>
            {existingBet.status === 'pending' && (locked ? 'Locked' : 'Active')}
            {existingBet.status === 'locked' && 'Locked'}
            {existingBet.status === 'won' && (isBettingMode ? 'Won!' : 'Correct!')}
            {existingBet.status === 'lost' && (isBettingMode ? 'Lost' : 'Incorrect')}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-lg font-bold text-foreground">
              {existingBet.betType === 'will_sail' ? lang.sailOption : lang.cancelOption}
            </p>
            {isBettingMode && (
              <p className="text-sm text-muted-foreground">
                {existingBet.stake} pts
              </p>
            )}
          </div>

          {existingBet.status === 'won' && existingBet.profit !== null && (
            <div className="text-right">
              <p className="text-lg font-bold text-success">
                +{existingBet.profit} pts
              </p>
            </div>
          )}

          {existingBet.status === 'lost' && (
            <div className="text-right">
              <p className="text-lg font-bold text-destructive">
                -{existingBet.stake} pts
              </p>
            </div>
          )}

          {existingBet.status === 'pending' && isBettingMode && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If locked, show locked state
  if (locked) {
    return (
      <div className={`bg-secondary/50 border border-border/50 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <LockIcon className="w-4 h-4" />
          <span className="text-sm">
            {isBettingMode ? 'Betting closed' : 'Predictions closed'} for this sailing
          </span>
        </div>
      </div>
    );
  }

  // Phase 86F: Simplified Betting Mode UI - thumbs up/down, no stake selection
  if (isBettingMode) {
    return (
      <div className={`bg-secondary/50 border border-border/50 rounded-lg p-4 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-foreground">{departureTimeDisplay}</p>
            <p className="text-xs text-muted-foreground">{routeDisplay}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Closes in</p>
            <p className="text-sm font-medium text-accent">
              {minutesUntilLock > 60
                ? `${Math.floor(minutesUntilLock / 60)}h ${minutesUntilLock % 60}m`
                : `${minutesUntilLock}m`}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive-muted border border-destructive/30 rounded-lg p-3 mb-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Simple Bet Buttons - Phase 88: thumbs up/down, no odds display */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handlePlaceBet('will_sail')}
            disabled={isPlacing || !canPlaceBet()}
            className="p-3 rounded-lg border-2 border-success/30 bg-success-muted/30 text-success font-medium hover:bg-success-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <p className="text-2xl">👍</p>
            <p className="text-xs">Will Sail</p>
          </button>

          <button
            onClick={() => handlePlaceBet('will_cancel')}
            disabled={isPlacing || !canPlaceBet()}
            className="p-3 rounded-lg border-2 border-destructive/30 bg-destructive-muted/30 text-destructive font-medium hover:bg-destructive-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <p className="text-2xl">👎</p>
            <p className="text-xs">Will Cancel</p>
          </button>
        </div>

        {isPlacing && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Placing prediction...
          </p>
        )}
      </div>
    );
  }

  // Neutral Mode UI (simple prediction buttons) - Phase 86F simplified
  return (
    <div className={`bg-secondary/50 border border-border/50 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-foreground">Make a Prediction</p>
        <p className="text-xs text-muted-foreground">
          {minutesUntilLock > 60
            ? `${Math.floor(minutesUntilLock / 60)}h ${minutesUntilLock % 60}m left`
            : `${minutesUntilLock}m left`}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive-muted border border-destructive/30 rounded-lg p-3 mb-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handlePlaceBet('will_sail')}
          disabled={isPlacing || !canPlaceBet()}
          className="py-3 rounded-lg bg-success-muted/30 border border-success/30 text-success font-medium hover:bg-success-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {lang.sailOption}
        </button>
        <button
          onClick={() => handlePlaceBet('will_cancel')}
          disabled={isPlacing || !canPlaceBet()}
          className="py-3 rounded-lg bg-destructive-muted/30 border border-destructive/30 text-destructive font-medium hover:bg-destructive-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {lang.cancelOption}
        </button>
      </div>

    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
