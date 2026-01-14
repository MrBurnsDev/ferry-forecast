'use client';

/**
 * Bet History Component
 *
 * Displays the user's betting history with:
 * - Route/corridor name
 * - Sailing time
 * - Bet choice (Sail / Cancel)
 * - Status (pending, won, lost)
 * - Time placed (relative)
 *
 * Phase 88: Simple bet history UI using existing /api/betting/bets data
 */

import { useBetting, useBettingAvailable } from '@/lib/betting';

interface BetHistoryProps {
  className?: string;
  limit?: number;
}

/**
 * Format relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function BetHistory({ className = '', limit = 10 }: BetHistoryProps) {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return <BetHistoryInner className={className} limit={limit} />;
}

function BetHistoryInner({ className, limit }: BetHistoryProps) {
  const { state, bettingEnabled } = useBetting();

  // Don't render if betting is not enabled
  if (!bettingEnabled) {
    return null;
  }

  // Convert Map to sorted array (most recent first)
  const bets = Array.from(state.bets.values())
    .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
    .slice(0, limit);

  // Empty state
  if (bets.length === 0) {
    return (
      <div className={`bg-secondary/50 border border-border/50 rounded-lg p-6 ${className}`}>
        <div className="text-center">
          <HistoryIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-medium text-foreground mb-1">
            No predictions yet
          </h3>
          <p className="text-xs text-muted-foreground">
            Make your first prediction on an upcoming sailing
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-secondary/50 border border-border/50 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50">
        <h3 className="text-sm font-medium text-foreground">
          Prediction History
        </h3>
      </div>

      {/* Bet list */}
      <div className="divide-y divide-border/30">
        {bets.map((bet) => {
          const isWon = bet.status === 'won';
          const isLost = bet.status === 'lost';
          const isPending = bet.status === 'pending' || bet.status === 'locked';

          return (
            <div key={bet.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                {/* Left side: Bet details */}
                <div className="flex-1 min-w-0">
                  {/* Bet choice with emoji */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">
                      {bet.betType === 'will_sail' ? '👍' : '👎'}
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">
                      {bet.betType === 'will_sail' ? 'Will Sail' : 'Will Cancel'}
                    </span>
                  </div>

                  {/* Time placed */}
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(bet.placedAt)}
                  </p>
                </div>

                {/* Right side: Status */}
                <div className="text-right flex-shrink-0">
                  {isPending && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent-muted text-accent">
                      Pending
                    </span>
                  )}
                  {isWon && (
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success-muted text-success">
                        Correct
                      </span>
                    </div>
                  )}
                  {isLost && (
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-destructive-muted text-destructive">
                        Wrong
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with count */}
      {state.bets.size > (limit ?? 10) && (
        <div className="px-4 py-2 border-t border-border/50 bg-secondary/30">
          <p className="text-xs text-muted-foreground text-center">
            Showing {limit} of {state.bets.size} predictions
          </p>
        </div>
      )}
    </div>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
