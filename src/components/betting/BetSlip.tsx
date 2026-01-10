'use client';

/**
 * Bet Slip Component
 *
 * The main betting interface for a sailing. Shows:
 * - Betting mode: Odds, stake selection, payout preview
 * - Neutral mode: Simple prediction buttons
 *
 * Adapts language based on betting mode setting.
 */

import { useState } from 'react';
import {
  useBetting,
  useBettingAvailable,
  BET_SIZES,
  getOddsDisplay,
  formatOdds,
  calculateProfit,
  getTimeBonus,
  type BetType,
  type BetSize,
} from '@/lib/betting';
// Auth imports available for future integration when betting persistence is added
// import { useAuth, useAuthAvailable } from '@/lib/auth';
// import { AuthGate } from '@/components/auth';

interface BetSlipProps {
  sailingId: string;
  corridorId: string;           // Required - must come from board.corridor.id
  likelihood: number;           // Likelihood to sail (0-100)
  departureTimestampMs: number;
  departureTimeDisplay: string; // e.g., "9:30 AM"
  routeDisplay: string;         // e.g., "Woods Hole → Vineyard Haven"
  className?: string;
}

export function BetSlip({
  sailingId,
  corridorId,
  likelihood,
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
      likelihood={likelihood}
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
  likelihood,
  departureTimestampMs,
  departureTimeDisplay,
  routeDisplay,
  className,
}: BetSlipProps) {
  const { state, bettingEnabled, isBettingMode, lang, placeBet, getBetForSailing, canPlaceBet, getTimeUntilLock } = useBetting();

  // Hooks must be called unconditionally
  const [selectedBetType, setSelectedBetType] = useState<BetType | null>(null);
  const [selectedStake, setSelectedStake] = useState<BetSize>(25);
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

  // Get odds
  const odds = getOddsDisplay(likelihood);
  const timeBonus = getTimeBonus(departureTimestampMs);
  const hasTimeBonus = timeBonus > 1;

  // Calculate potential payout for selected bet
  const selectedOdds = selectedBetType === 'will_sail' ? odds.sailOdds : odds.cancelOdds;
  const potentialProfit = selectedBetType ? calculateProfit(selectedStake, selectedOdds) : 0;

  const handlePlaceBet = async () => {
    if (!selectedBetType) return;
    if (!corridorId) {
      setError('corridorId required for betting');
      return;
    }

    setIsPlacing(true);
    setError(null);

    const result = await placeBet(sailingId, corridorId, selectedBetType, selectedStake, likelihood, departureTimestampMs);

    if (!result.success) {
      setError(result.error || 'Failed to place bet');
    } else {
      setSelectedBetType(null);
    }

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
                {existingBet.stake} pts @ {formatOdds(existingBet.americanOdds)}
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
              <p className="text-sm text-muted-foreground">Potential</p>
              <p className="text-lg font-bold text-accent">
                +{calculateProfit(existingBet.stake, existingBet.americanOdds)} pts
              </p>
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

  // Betting Mode UI
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

        {/* Odds Display */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Will Sail */}
          <button
            onClick={() => setSelectedBetType('will_sail')}
            className={`p-3 rounded-lg border-2 transition-all ${
              selectedBetType === 'will_sail'
                ? 'border-success bg-success-muted/30'
                : 'border-border/50 hover:border-success/50'
            }`}
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Will Sail</p>
            <p className={`text-2xl font-bold ${selectedBetType === 'will_sail' ? 'text-success' : 'text-foreground'}`}>
              {formatOdds(odds.sailOdds)}
            </p>
            <p className="text-xs text-muted-foreground">{odds.sailImplied}% implied</p>
          </button>

          {/* Will Cancel */}
          <button
            onClick={() => setSelectedBetType('will_cancel')}
            className={`p-3 rounded-lg border-2 transition-all ${
              selectedBetType === 'will_cancel'
                ? 'border-destructive bg-destructive-muted/30'
                : 'border-border/50 hover:border-destructive/50'
            }`}
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Will Cancel</p>
            <p className={`text-2xl font-bold ${selectedBetType === 'will_cancel' ? 'text-destructive' : 'text-foreground'}`}>
              {formatOdds(odds.cancelOdds)}
            </p>
            <p className="text-xs text-muted-foreground">{odds.cancelImplied}% implied</p>
          </button>
        </div>

        {/* Stake Selection (only when bet type selected) */}
        {selectedBetType && (
          <>
            <div className="mb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Stake</p>
              <div className="flex gap-2">
                {BET_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedStake(size)}
                    disabled={!canPlaceBet(size)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedStake === size
                        ? 'bg-accent text-accent-foreground'
                        : canPlaceBet(size)
                          ? 'bg-secondary hover:bg-secondary/80 text-foreground'
                          : 'bg-secondary/50 text-muted-foreground cursor-not-allowed'
                    }`}
                  >
                    {size} pts
                  </button>
                ))}
              </div>
            </div>

            {/* Payout Preview */}
            <div className="bg-secondary/80 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Potential Win</p>
                  <p className="text-xl font-bold text-accent">
                    +{Math.round(potentialProfit * timeBonus)} pts
                  </p>
                </div>
                {hasTimeBonus && (
                  <div className="text-right">
                    <p className="text-xs text-success">Time Bonus</p>
                    <p className="text-sm font-medium text-success">+{Math.round((timeBonus - 1) * 100)}%</p>
                  </div>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-destructive-muted border border-destructive/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Place Bet Button */}
            <button
              onClick={handlePlaceBet}
              disabled={isPlacing || !canPlaceBet(selectedStake)}
              className="w-full py-3 rounded-lg bg-accent text-accent-foreground font-bold text-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPlacing ? 'Placing...' : `Place ${selectedStake} pt Bet`}
            </button>

            <p className="text-xs text-muted-foreground text-center mt-2">
              Balance: {state.bankroll.balance} pts
            </p>
          </>
        )}
      </div>
    );
  }

  // Neutral Mode UI (simple prediction buttons)
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

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            if (!corridorId) return;
            setSelectedBetType('will_sail');
            placeBet(sailingId, corridorId, 'will_sail', 25, likelihood, departureTimestampMs);
          }}
          className="py-3 rounded-lg bg-success-muted/30 border border-success/30 text-success font-medium hover:bg-success-muted/50 transition-colors"
        >
          {lang.sailOption}
        </button>
        <button
          onClick={() => {
            if (!corridorId) return;
            setSelectedBetType('will_cancel');
            placeBet(sailingId, corridorId, 'will_cancel', 25, likelihood, departureTimestampMs);
          }}
          className="py-3 rounded-lg bg-destructive-muted/30 border border-destructive/30 text-destructive font-medium hover:bg-destructive-muted/50 transition-colors"
        >
          {lang.cancelOption}
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        {likelihood}% likelihood to sail
      </p>
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
