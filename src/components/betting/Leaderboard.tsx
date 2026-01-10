'use client';

/**
 * Leaderboard Component
 *
 * Shows daily and all-time leaderboards for the betting game.
 * Includes daily crown display for top performer.
 */

import { useState } from 'react';
import { useBetting, useBettingAvailable } from '@/lib/betting';
import type { LeaderboardEntry, DailyCrown } from '@/lib/betting';

interface LeaderboardProps {
  className?: string;
}

export function Leaderboard({ className = '' }: LeaderboardProps) {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return <LeaderboardInner className={className} />;
}

function LeaderboardInner({ className }: LeaderboardProps) {
  const { state, isBettingMode } = useBetting();
  const [activeTab, setActiveTab] = useState<'daily' | 'allTime'>('daily');

  // Only show when betting mode is enabled
  if (!isBettingMode) {
    return null;
  }

  const { daily, allTime, crown } = state.leaderboard;

  // Mock data for demonstration (replace with real data from API)
  const mockDaily: LeaderboardEntry[] = daily.length > 0 ? daily : [
    { userId: '1', displayName: 'FerryFanatic42', avatarUrl: null, dailyProfit: 245, allTimeProfit: 1250, roi: 34.2, winRate: 72, totalBets: 18, biggestWin: 180, hasCrown: true },
    { userId: '2', displayName: 'IslandHopper', avatarUrl: null, dailyProfit: 180, allTimeProfit: 890, roi: 28.5, winRate: 68, totalBets: 24, biggestWin: 150, hasCrown: false },
    { userId: '3', displayName: 'VineyardVibes', avatarUrl: null, dailyProfit: 95, allTimeProfit: 420, roi: 19.8, winRate: 61, totalBets: 12, biggestWin: 90, hasCrown: false },
    { userId: '4', displayName: 'CapeCodder', avatarUrl: null, dailyProfit: 45, allTimeProfit: 310, roi: 15.2, winRate: 58, totalBets: 31, biggestWin: 75, hasCrown: false },
    { userId: '5', displayName: 'NantucketNate', avatarUrl: null, dailyProfit: -20, allTimeProfit: 180, roi: 8.4, winRate: 52, totalBets: 45, biggestWin: 120, hasCrown: false },
  ];

  const mockAllTime: LeaderboardEntry[] = allTime.length > 0 ? allTime : [
    { userId: '1', displayName: 'FerryFanatic42', avatarUrl: null, dailyProfit: 245, allTimeProfit: 1250, roi: 34.2, winRate: 72, totalBets: 18, biggestWin: 180, hasCrown: true },
    { userId: '6', displayName: 'WoodsHoleWiz', avatarUrl: null, dailyProfit: 30, allTimeProfit: 980, roi: 31.5, winRate: 70, totalBets: 52, biggestWin: 220, hasCrown: false },
    { userId: '2', displayName: 'IslandHopper', avatarUrl: null, dailyProfit: 180, allTimeProfit: 890, roi: 28.5, winRate: 68, totalBets: 24, biggestWin: 150, hasCrown: false },
    { userId: '7', displayName: 'BuzzardsBayBoss', avatarUrl: null, dailyProfit: -15, allTimeProfit: 720, roi: 22.1, winRate: 64, totalBets: 38, biggestWin: 200, hasCrown: false },
    { userId: '8', displayName: 'SeafoamSam', avatarUrl: null, dailyProfit: 55, allTimeProfit: 580, roi: 18.9, winRate: 60, totalBets: 29, biggestWin: 140, hasCrown: false },
  ];

  const mockCrown: DailyCrown | null = crown || {
    userId: '1',
    displayName: 'FerryFanatic42',
    date: new Date().toISOString().split('T')[0],
    profit: 245,
    awardedAt: new Date().toISOString(),
  };

  const entries = activeTab === 'daily' ? mockDaily : mockAllTime;

  return (
    <div className={`bg-secondary/50 border border-border/50 rounded-lg overflow-hidden ${className}`}>
      {/* Daily Crown Banner */}
      {mockCrown && (
        <div className="bg-gradient-to-r from-yellow-500/20 via-yellow-400/20 to-yellow-500/20 border-b border-yellow-500/30 p-4">
          <div className="flex items-center gap-3">
            <CrownIcon className="w-8 h-8 text-yellow-500" />
            <div className="flex-1">
              <p className="text-xs text-yellow-600 uppercase tracking-wide font-medium">
                Today&apos;s Champion
              </p>
              <p className="text-lg font-bold text-foreground flex items-center gap-2">
                {mockCrown.displayName}
                <span className="text-yellow-500">+{mockCrown.profit} pts</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border/50">
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'daily'
              ? 'text-accent border-b-2 border-accent'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Daily
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

      {/* Leaderboard List */}
      <div className="divide-y divide-border/30">
        {entries.map((entry, index) => (
          <LeaderboardRow
            key={entry.userId}
            entry={entry}
            rank={index + 1}
            showDailyProfit={activeTab === 'daily'}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 bg-secondary/30 text-center">
        <p className="text-xs text-muted-foreground">
          {activeTab === 'daily'
            ? 'Resets daily at midnight'
            : 'Lifetime standings'}
        </p>
      </div>
    </div>
  );
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  rank: number;
  showDailyProfit: boolean;
}

function LeaderboardRow({ entry, rank, showDailyProfit }: LeaderboardRowProps) {
  const profit = showDailyProfit ? entry.dailyProfit : entry.allTimeProfit;
  const isPositive = profit >= 0;

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors">
      {/* Rank */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
        rank === 1
          ? 'bg-yellow-500/20 text-yellow-500'
          : rank === 2
            ? 'bg-gray-300/20 text-gray-400'
            : rank === 3
              ? 'bg-amber-600/20 text-amber-600'
              : 'bg-secondary text-muted-foreground'
      }`}>
        {rank}
      </div>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground truncate">
            {entry.displayName}
          </p>
          {entry.hasCrown && (
            <CrownIcon className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {entry.winRate}% win rate • {entry.totalBets} bets
        </p>
      </div>

      {/* Profit */}
      <div className="text-right">
        <p className={`font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>
          {isPositive ? '+' : ''}{profit}
        </p>
        <p className="text-xs text-muted-foreground">pts</p>
      </div>
    </div>
  );
}

/**
 * Compact leaderboard for sidebar/widget use
 */
export function LeaderboardCompact({ className = '' }: { className?: string }) {
  const available = useBettingAvailable();

  if (!available) {
    return null;
  }

  return <LeaderboardCompactInner className={className} />;
}

function LeaderboardCompactInner({ className }: { className?: string }) {
  const { isBettingMode } = useBetting();

  if (!isBettingMode) {
    return null;
  }

  // Mock top 3
  const top3 = [
    { name: 'FerryFanatic42', profit: 245, hasCrown: true },
    { name: 'IslandHopper', profit: 180, hasCrown: false },
    { name: 'VineyardVibes', profit: 95, hasCrown: false },
  ];

  return (
    <div className={`bg-secondary/50 border border-border/50 rounded-lg p-3 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <TrophyIcon className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium text-foreground">Today&apos;s Leaders</span>
      </div>

      <div className="space-y-2">
        {top3.map((leader, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span className={`w-5 text-center font-medium ${
              index === 0 ? 'text-yellow-500' : 'text-muted-foreground'
            }`}>
              {index + 1}
            </span>
            <span className="flex-1 truncate text-foreground">
              {leader.name}
            </span>
            {leader.hasCrown && <CrownIcon className="w-3 h-3 text-yellow-500" />}
            <span className="text-success font-medium">+{leader.profit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
