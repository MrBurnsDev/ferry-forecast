'use client';

/**
 * Leaderboard Page
 *
 * Shows community prediction rankings.
 * Only accessible when Social Predictions (Game Mode) is enabled.
 *
 * Phase 89: User Leaderboard + Conditional Navigation
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteFooter, MobileMenu } from '@/components/layout';
import { useBetting, useBettingAvailable } from '@/lib/betting';
import { useAuth } from '@/lib/auth';

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z" />
    </svg>
  );
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  dailyProfit?: number;
  allTimeProfit?: number;
  totalBets?: number;
  totalWins?: number;
  winRate?: number;
  betsToday?: number;
  winsToday?: number;
  winRateToday?: number;
}

export default function LeaderboardPage() {
  const bettingAvailable = useBettingAvailable();

  // If betting context isn't available yet, show loading
  if (!bettingAvailable) {
    return <LeaderboardLoading />;
  }

  return <LeaderboardContent />;
}

function LeaderboardLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50 fixed-nav-safe">
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

function LeaderboardContent() {
  const { bettingEnabled } = useBetting();
  const { isAuthenticated, session, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'daily' | 'allTime'>('daily');
  const [leaderboardData, setLeaderboardData] = useState<{
    daily: LeaderboardEntry[];
    allTime: LeaderboardEntry[];
  }>({ daily: [], allTime: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch leaderboard data
  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        setLoading(true);
        const response = await fetch('/api/betting/leaderboard?type=both&limit=50');
        const data = await response.json();

        if (data.success) {
          setLeaderboardData({
            daily: data.daily || [],
            allTime: data.allTime || [],
          });
        } else {
          setError(data.error || 'Failed to load leaderboard');
        }
      } catch {
        setError('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    }

    if (bettingEnabled) {
      fetchLeaderboard();
    } else {
      setLoading(false);
    }
  }, [bettingEnabled]);

  // Gate: Must have betting enabled
  if (!bettingEnabled) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50 fixed-nav-safe">
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
              <TrophyIcon className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-foreground mb-4">
                Community Rankings
              </h1>
              <p className="text-muted-foreground mb-6">
                Enable Social Predictions in your account settings to view the leaderboard and compete with other predictors.
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

  const entries = activeTab === 'daily' ? leaderboardData.daily : leaderboardData.allTime;
  // Use profile.id (app user ID) or session.user.id (auth uid) for matching
  const currentUserId = profile?.id || session?.user?.id;

  // Find current user's rank
  const userEntry = entries.find(e => e.userId === currentUserId);
  const userRank = userEntry?.rank;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50 fixed-nav-safe">
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
              <TrophyIcon className="w-8 h-8 text-accent" />
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                Top Predictors
              </h1>
            </div>
            <p className="text-muted-foreground mb-6">
              Community rankings for ferry prediction accuracy
            </p>

            {/* User's current rank (if available) */}
            {isAuthenticated && userRank && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6">
                <p className="text-sm text-accent">Your Current Rank</p>
                <p className="text-2xl font-bold text-foreground">
                  #{userRank}
                  {userEntry && (
                    <span className="text-base font-normal text-muted-foreground ml-2">
                      ({activeTab === 'daily' ? userEntry.dailyProfit : userEntry.allTimeProfit} pts)
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-border/50 mb-6">
              <button
                onClick={() => setActiveTab('daily')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'daily'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Daily Leaders
              </button>
              <button
                onClick={() => setActiveTab('allTime')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'allTime'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Time
              </button>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 bg-secondary/30 rounded-lg animate-pulse" />
                ))}
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="bg-destructive-muted border border-destructive/30 rounded-lg p-6 text-center">
                <p className="text-destructive">{error}</p>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && entries.length === 0 && (
              <div className="bg-secondary/50 border border-border/50 rounded-lg p-8 text-center">
                <TrophyIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No predictions yet
                </h3>
                <p className="text-muted-foreground mb-4">
                  Be the first to make a prediction and claim the top spot!
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  View Sailings
                </Link>
              </div>
            )}

            {/* Leaderboard list */}
            {!loading && !error && entries.length > 0 && (
              <div className="bg-secondary/50 border border-border/50 rounded-lg overflow-hidden">
                <div className="divide-y divide-border/30">
                  {entries.map((entry) => (
                    <LeaderboardRow
                      key={entry.userId}
                      entry={entry}
                      isCurrentUser={entry.userId === currentUserId}
                      showDailyProfit={activeTab === 'daily'}
                    />
                  ))}
                </div>

                {/* Footer */}
                <div className="p-3 bg-secondary/30 text-center border-t border-border/30">
                  <p className="text-xs text-muted-foreground">
                    {activeTab === 'daily'
                      ? 'Resets daily at midnight'
                      : 'Lifetime standings'}
                  </p>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-xs text-muted-foreground text-center mt-6">
              Just for fun! Points have no monetary value.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  showDailyProfit: boolean;
}

function LeaderboardRow({ entry, isCurrentUser, showDailyProfit }: LeaderboardRowProps) {
  const profit = showDailyProfit ? (entry.dailyProfit ?? 0) : (entry.allTimeProfit ?? 0);
  const isPositive = profit >= 0;
  const winRate = showDailyProfit ? entry.winRateToday : entry.winRate;
  const totalBets = showDailyProfit ? entry.betsToday : entry.totalBets;

  return (
    <div
      className={`flex items-center gap-3 p-4 transition-colors ${
        isCurrentUser
          ? 'bg-accent/10 hover:bg-accent/15'
          : 'hover:bg-secondary/30'
      }`}
    >
      {/* Rank */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          entry.rank === 1
            ? 'bg-yellow-500/20 text-yellow-500'
            : entry.rank === 2
              ? 'bg-gray-300/20 text-gray-400'
              : entry.rank === 3
                ? 'bg-amber-600/20 text-amber-600'
                : 'bg-secondary text-muted-foreground'
        }`}
      >
        {entry.rank === 1 ? (
          <CrownIcon className="w-5 h-5" />
        ) : (
          entry.rank
        )}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-medium truncate ${isCurrentUser ? 'text-accent' : 'text-foreground'}`}>
            {entry.username}
            {isCurrentUser && (
              <span className="text-xs text-accent ml-2">(You)</span>
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {winRate !== undefined && totalBets !== undefined
            ? `${Math.round(winRate)}% accuracy | ${totalBets} predictions`
            : totalBets !== undefined
              ? `${totalBets} predictions`
              : ''}
        </p>
      </div>

      {/* Points */}
      <div className="text-right flex-shrink-0">
        <p className={`font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>
          {isPositive ? '+' : ''}{profit}
        </p>
        <p className="text-xs text-muted-foreground">pts</p>
      </div>
    </div>
  );
}
