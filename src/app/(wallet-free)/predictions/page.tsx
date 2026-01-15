'use client';

/**
 * My Predictions Page
 *
 * Shows the user's prediction history with:
 * - Today's predictions
 * - Past predictions (grouped by date)
 * - User metrics (win rate, total bets, profit)
 *
 * Phase 91: User-facing predictions dashboard
 */

import Link from 'next/link';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { SiteFooter, MobileMenu } from '@/components/layout';
import { useBetting, useBettingAvailable } from '@/lib/betting';
import { useAuth } from '@/lib/auth';
import type { Outcome } from '@/lib/share';

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

/**
 * Parse sailing ID to extract route and departure time info
 * Format: operatorId_originSlug_destSlug_timeNormalized
 * Example: steamship-authority_woods-hole_vineyard-haven_900am
 */
function parseSailingId(sailingId: string): { route: string; departureTime: string } | null {
  try {
    const parts = sailingId.split('_');
    if (parts.length < 4) return null;

    // Last part is the time (e.g., "900am", "1030pm")
    const timeRaw = parts[parts.length - 1];

    // Parse time: "900am" -> "9:00 AM", "1030pm" -> "10:30 PM"
    const timeMatch = timeRaw.match(/^(\d{1,2})(\d{2})(am|pm)$/i);
    let departureTime = timeRaw;
    if (timeMatch) {
      const hour = timeMatch[1];
      const minutes = timeMatch[2];
      const period = timeMatch[3].toUpperCase();
      departureTime = `${hour}:${minutes} ${period}`;
    }

    // Origin and dest are the 2nd and 3rd parts (with possible hyphens)
    // Need to handle multi-part slugs like "woods-hole" and "vineyard-haven"
    // The format is: operator_from_to_time, but from/to can have hyphens
    // So we need to reconstruct by finding known terminal names
    const origin = parts[1];
    const dest = parts[2];

    // Format terminal names nicely
    const formatTerminal = (slug: string): string => {
      return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    const route = `${formatTerminal(origin)} → ${formatTerminal(dest)}`;

    return { route, departureTime };
  } catch {
    return null;
  }
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

/**
 * Share request parameters for the mystery quote API
 */
interface ShareRequestParams {
  corridorId: string;
  sailingInfo: { route: string; departureTime: string } | null;
  betType: string;
  likelihood: number;
  outcome: Outcome;
  onToast: (message: string) => void;
}

/**
 * Share a prediction on Facebook with a mystery quote
 * The quote is only generated when this function is called (on share click)
 */
async function shareOnFacebook({
  corridorId,
  sailingInfo,
  betType,
  likelihood,
  outcome,
  onToast,
}: ShareRequestParams): Promise<void> {
  try {
    // Call the API to generate a mystery quote
    const response = await fetch('/api/share/facebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        corridorId,
        outcome,
        modelProbability: likelihood, // API handles 0-100 normalization
        betType: betType as 'will_sail' | 'will_cancel',
        departureTime: sailingInfo?.departureTime,
        route: sailingInfo?.route,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate share quote');
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to generate share');
    }

    // Try to copy quote to clipboard as fallback (Facebook often ignores prefilled text)
    if (navigator.clipboard && data.quoteText) {
      try {
        await navigator.clipboard.writeText(data.quoteText);
        onToast('Caption copied! Paste it into your post.');
      } catch {
        // Clipboard failed, continue anyway
      }
    }

    // Open Facebook share dialog
    window.open(data.shareUrl, 'facebook-share', 'width=580,height=400');
  } catch (error) {
    console.error('[SHARE] Error:', error);
    // Fallback to basic share without mystery quote
    const baseUrl = 'https://ferry-forecast.vercel.app';
    const corridorUrl = `${baseUrl}/corridor/${corridorId}`;
    const basicShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(corridorUrl)}`;
    window.open(basicShareUrl, 'facebook-share', 'width=580,height=400');
  }
}

/**
 * Get date string for grouping (e.g., "Today", "Yesterday", "Jan 5")
 */
function getDateGroup(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const betDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (betDate.getTime() === today.getTime()) return 'Today';
  if (betDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PredictionsPage() {
  const bettingAvailable = useBettingAvailable();

  if (!bettingAvailable) {
    return <PredictionsLoading />;
  }

  return <PredictionsContent />;
}

function PredictionsLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
            <MobileMenu />
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24 lg:pt-32 pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse">
              <div className="h-10 w-48 bg-secondary/50 rounded mb-4" />
              <div className="h-6 w-64 bg-secondary/30 rounded mb-8" />
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-secondary/30 rounded-lg" />
                ))}
              </div>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 bg-secondary/30 rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function PredictionsContent() {
  const { bettingEnabled, state, refreshBets } = useBetting();
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'resolved'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Toast handler with auto-dismiss
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Refresh bets on mount
  useEffect(() => {
    if (bettingEnabled && isAuthenticated) {
      refreshBets();
    }
  }, [bettingEnabled, isAuthenticated, refreshBets]);

  // Convert bets to array and compute metrics
  const { bets, metrics, groupedBets } = useMemo(() => {
    const allBets = Array.from(state.bets.values())
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());

    // Filter by tab
    const filteredBets = allBets.filter(bet => {
      if (activeTab === 'pending') return bet.status === 'pending' || bet.status === 'locked';
      if (activeTab === 'resolved') return bet.status === 'won' || bet.status === 'lost';
      return true;
    });

    // Compute metrics
    const resolved = allBets.filter(b => b.status === 'won' || b.status === 'lost');
    const wins = resolved.filter(b => b.status === 'won');
    const totalProfit = resolved.reduce((sum, b) => {
      if (b.status === 'won' && b.profit !== null) return sum + b.profit;
      if (b.status === 'lost') return sum - b.stake;
      return sum;
    }, 0);

    const winRate = resolved.length > 0 ? Math.round((wins.length / resolved.length) * 100) : 0;

    // Group by date
    const grouped = new Map<string, typeof filteredBets>();
    filteredBets.forEach(bet => {
      const group = getDateGroup(bet.placedAt);
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group)!.push(bet);
    });

    return {
      bets: filteredBets,
      metrics: {
        total: allBets.length,
        pending: allBets.filter(b => b.status === 'pending' || b.status === 'locked').length,
        resolved: resolved.length,
        wins: wins.length,
        losses: resolved.length - wins.length,
        winRate,
        totalProfit,
      },
      groupedBets: grouped,
    };
  }, [state.bets, activeTab]);

  // Loading state
  if (isLoading) {
    return <PredictionsLoading />;
  }

  // Gate: Must be authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex items-center justify-between h-16 lg:h-20">
              <Link href="/" className="flex items-center gap-2">
                <WavesIcon className="w-8 h-8 text-accent" />
                <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
              </Link>
              <MobileMenu />
            </div>
          </div>
        </nav>

        <main className="flex-1 pt-24 lg:pt-32 pb-12">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="max-w-md mx-auto text-center">
              <HistoryIcon className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-foreground mb-4">
                My Predictions
              </h1>
              <p className="text-muted-foreground mb-6">
                Sign in to view your prediction history and stats.
              </p>
              <Link
                href="/account"
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    );
  }

  // Gate: Must have betting enabled
  if (!bettingEnabled) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex items-center justify-between h-16 lg:h-20">
              <Link href="/" className="flex items-center gap-2">
                <WavesIcon className="w-8 h-8 text-accent" />
                <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
              </Link>
              <MobileMenu />
            </div>
          </div>
        </nav>

        <main className="flex-1 pt-24 lg:pt-32 pb-12">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="max-w-md mx-auto text-center">
              <HistoryIcon className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-foreground mb-4">
                My Predictions
              </h1>
              <p className="text-muted-foreground mb-6">
                Enable Social Predictions in your account settings to start making predictions and track your accuracy.
              </p>
              <Link
                href="/account"
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
              >
                Go to Settings
              </Link>
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
            <MobileMenu />
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24 lg:pt-32 pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
              <HistoryIcon className="w-8 h-8 text-accent" />
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                My Predictions
              </h1>
            </div>
            <p className="text-muted-foreground mb-6">
              Track your prediction accuracy and history
            </p>

            {/* Metrics Cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 text-center">
                <TargetIcon className="w-5 h-5 text-accent mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">{metrics.winRate}%</p>
                <p className="text-xs text-muted-foreground">Accuracy</p>
              </div>
              <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{metrics.resolved}</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.wins}W / {metrics.losses}L
                </p>
              </div>
              <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 text-center">
                <TrendingUpIcon className="w-5 h-5 text-accent mx-auto mb-1" />
                <p className={`text-2xl font-bold ${metrics.totalProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {metrics.totalProfit >= 0 ? '+' : ''}{metrics.totalProfit}
                </p>
                <p className="text-xs text-muted-foreground">Points</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/50 mb-4">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({metrics.total})
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'pending'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Pending ({metrics.pending})
              </button>
              <button
                onClick={() => setActiveTab('resolved')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'resolved'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Resolved ({metrics.resolved})
              </button>
            </div>

            {/* Empty state */}
            {bets.length === 0 && (
              <div className="bg-secondary/50 border border-border/50 rounded-lg p-8 text-center">
                <HistoryIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {activeTab === 'pending' ? 'No pending predictions' :
                   activeTab === 'resolved' ? 'No resolved predictions yet' :
                   'No predictions yet'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {activeTab === 'pending'
                    ? 'All your predictions have been resolved!'
                    : 'Make your first prediction on an upcoming sailing'}
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  View Sailings
                </Link>
              </div>
            )}

            {/* Grouped predictions */}
            {bets.length > 0 && (
              <div className="space-y-6">
                {Array.from(groupedBets.entries()).map(([dateGroup, groupBets]) => (
                  <div key={dateGroup}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">
                      {dateGroup}
                    </h3>
                    <div className="bg-secondary/50 border border-border/50 rounded-lg overflow-hidden">
                      <div className="divide-y divide-border/30">
                        {groupBets.map((bet) => {
                          const isWon = bet.status === 'won';
                          const isLost = bet.status === 'lost';
                          const isPending = bet.status === 'pending' || bet.status === 'locked';
                          const sailingInfo = parseSailingId(bet.sailingId);

                          return (
                            <div key={bet.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                              <div className="flex items-start justify-between gap-3">
                                {/* Left side: Bet details */}
                                <div className="flex-1 min-w-0">
                                  {/* Sailing info - departure time and route */}
                                  {sailingInfo && (
                                    <div className="mb-1">
                                      <span className="text-sm font-semibold text-foreground">
                                        {sailingInfo.departureTime}
                                      </span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        {sailingInfo.route}
                                      </span>
                                    </div>
                                  )}

                                  {/* Bet choice with emoji and likelihood */}
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">
                                      {bet.betType === 'will_sail' ? '👍' : '👎'}
                                    </span>
                                    <span className="text-sm text-foreground">
                                      {bet.betType === 'will_sail' ? 'Will Sail' : 'Will Cancel'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      @ {bet.likelihoodSnapshot}% likely
                                    </span>
                                  </div>

                                  {/* Stake and potential payout */}
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span>Stake: {bet.stake} pts</span>
                                    {isPending && (
                                      <span className="text-accent">
                                        Potential: +{bet.potentialPayout - bet.stake} pts
                                      </span>
                                    )}
                                    {isWon && bet.profit !== null && (
                                      <span className="text-success">
                                        Won: +{bet.profit} pts
                                      </span>
                                    )}
                                    {isLost && (
                                      <span className="text-destructive">
                                        Lost: -{bet.stake} pts
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Right side: Status and Share */}
                                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                  {/* Status badge */}
                                  {isPending && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent-muted text-accent">
                                      Pending
                                    </span>
                                  )}
                                  {isWon && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success-muted text-success">
                                      Correct
                                    </span>
                                  )}
                                  {isLost && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-destructive-muted text-destructive">
                                      Wrong
                                    </span>
                                  )}

                                  {/* Share button */}
                                  <button
                                    onClick={() => shareOnFacebook({
                                      corridorId: bet.corridorId,
                                      sailingInfo,
                                      betType: bet.betType,
                                      likelihood: bet.likelihoodSnapshot,
                                      outcome: isWon ? 'correct' : isLost ? 'incorrect' : 'correct',
                                      onToast: showToast,
                                    })}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-colors"
                                    title="Share on Facebook"
                                  >
                                    <ShareIcon className="w-3.5 h-3.5" />
                                    <span>Share</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer disclaimer */}
            <p className="text-xs text-muted-foreground text-center mt-6">
              Just for fun! Points have no monetary value.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />

      {/* Toast notification for clipboard */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-foreground text-background rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
