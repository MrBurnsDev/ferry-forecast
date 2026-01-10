/**
 * Leaderboard API
 *
 * GET /api/betting/leaderboard
 *
 * Returns daily and all-time leaderboards.
 * Public endpoint - no authentication required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteClient } from '@/lib/supabase/serverRouteClient';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteClient({ allowNull: true });
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Service not configured' },
        { status: 500 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'both'; // 'daily', 'all_time', 'both'
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result: {
      daily?: Array<{
        rank: number;
        userId: string;
        username: string;
        dailyProfit: number;
        betsToday: number;
        winsToday: number;
        winRateToday: number;
      }>;
      allTime?: Array<{
        rank: number;
        userId: string;
        username: string;
        allTimeProfit: number;
        totalBets: number;
        totalWins: number;
        winRate: number;
        roi: number;
      }>;
    } = {};

    // Fetch daily leaderboard
    if (type === 'daily' || type === 'both') {
      const { data: daily, error: dailyError } = await supabase
        .from('leaderboard_daily')
        .select('*')
        .limit(limit);

      if (dailyError) {
        console.error('[LEADERBOARD] Daily fetch error:', dailyError);
      } else {
        result.daily = daily.map((entry, index) => ({
          rank: index + 1,
          userId: entry.user_id,
          username: entry.username,
          dailyProfit: entry.daily_profit,
          betsToday: entry.bets_today,
          winsToday: entry.wins_today,
          winRateToday: entry.win_rate_today,
        }));
      }
    }

    // Fetch all-time leaderboard
    if (type === 'all_time' || type === 'both') {
      const { data: allTime, error: allTimeError } = await supabase
        .from('leaderboard_all_time')
        .select('*')
        .limit(limit);

      if (allTimeError) {
        console.error('[LEADERBOARD] All-time fetch error:', allTimeError);
      } else {
        result.allTime = allTime.map((entry, index) => ({
          rank: index + 1,
          userId: entry.user_id,
          username: entry.username,
          allTimeProfit: entry.all_time_profit,
          totalBets: entry.total_bets,
          totalWins: entry.total_wins,
          winRate: entry.win_rate,
          roi: entry.roi,
        }));
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[LEADERBOARD] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
