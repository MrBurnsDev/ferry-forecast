/**
 * Wins API
 *
 * GET /api/wins
 *
 * Public endpoint to fetch win data for daily and all-time leaderboards.
 * Used by public win pages and OG image generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

// Minimum bet requirements for leaderboard qualification
const MIN_BETS_DAILY = 2;
const MIN_BETS_ALL_TIME = 10;

interface DailyWinData {
  username: string;
  date: string;
  dailyProfit: number;
  betsToday: number;
  winsToday: number;
  winRateToday: number;
  isQualified: boolean;
}

interface AllTimeWinData {
  username: string;
  allTimeProfit: number;
  totalBets: number;
  totalWins: number;
  winRate: number;
  roi: number;
  isQualified: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient({ allowNull: true });
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Service not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'daily' or 'all_time'
    const username = searchParams.get('username');
    const date = searchParams.get('date'); // YYYY-MM-DD format for daily

    if (!type || !username) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: type and username' },
        { status: 400 }
      );
    }

    if (type === 'daily') {
      if (!date) {
        return NextResponse.json(
          { success: false, error: 'Missing date parameter for daily wins' },
          { status: 400 }
        );
      }

      // Fetch daily win data for user
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          username,
          bets!inner(
            id,
            status,
            stake_points,
            payout_points,
            resolved_at
          )
        `)
        .eq('username', username)
        .eq('bets.resolved_at::date', date)
        .single();

      if (error || !data) {
        // User not found or no bets on that date
        return NextResponse.json(
          { success: false, error: 'Win data not found' },
          { status: 404 }
        );
      }

      const bets = data.bets || [];
      const resolvedBets = bets.filter((b: { status: string }) =>
        b.status === 'won' || b.status === 'lost'
      );
      const wonBets = bets.filter((b: { status: string }) => b.status === 'won');

      const dailyProfit = bets.reduce((sum: number, b: { status: string; payout_points: number; stake_points: number }) => {
        if (b.status === 'won') return sum + (b.payout_points - b.stake_points);
        if (b.status === 'lost') return sum - b.stake_points;
        return sum;
      }, 0);

      const winData: DailyWinData = {
        username: data.username,
        date,
        dailyProfit,
        betsToday: resolvedBets.length,
        winsToday: wonBets.length,
        winRateToday: resolvedBets.length > 0
          ? Math.round((100 * wonBets.length) / resolvedBets.length)
          : 0,
        isQualified: resolvedBets.length >= MIN_BETS_DAILY,
      };

      // Verify this user was actually the daily winner
      const { data: leaderboard } = await supabase
        .rpc('get_daily_leaderboard', { p_date: date, p_limit: 1 });

      const isWinner = leaderboard?.[0]?.username === username &&
                       leaderboard?.[0]?.bets_today >= MIN_BETS_DAILY;

      if (!isWinner) {
        return NextResponse.json(
          { success: false, error: 'User was not the daily winner on this date' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        type: 'daily',
        data: winData,
      });
    }

    if (type === 'all_time') {
      // Fetch all-time win data for user
      const { data, error } = await supabase
        .from('leaderboard_all_time')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: 'User not found on all-time leaderboard' },
          { status: 404 }
        );
      }

      // Verify this user is currently #1
      const { data: topUser } = await supabase
        .from('leaderboard_all_time')
        .select('username, total_bets')
        .order('all_time_profit', { ascending: false })
        .limit(1)
        .single();

      const isTopUser = topUser?.username === username &&
                        topUser?.total_bets >= MIN_BETS_ALL_TIME;

      if (!isTopUser) {
        return NextResponse.json(
          { success: false, error: 'User is not the all-time leader' },
          { status: 404 }
        );
      }

      const allTimeData: AllTimeWinData = {
        username: data.username,
        allTimeProfit: data.all_time_profit,
        totalBets: data.total_bets,
        totalWins: data.total_wins,
        winRate: data.win_rate,
        roi: data.roi,
        isQualified: data.total_bets >= MIN_BETS_ALL_TIME,
      };

      return NextResponse.json({
        success: true,
        type: 'all_time',
        data: allTimeData,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid type parameter' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[WINS] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
