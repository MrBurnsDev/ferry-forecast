/**
 * Leaderboard API
 *
 * GET /api/betting/leaderboard
 *
 * Returns daily and all-time prediction game leaderboards.
 * Public endpoint - no authentication required.
 *
 * NOTE: API path retained for backward compatibility.
 * TERMINOLOGY: All log messages use "prediction" terminology.
 */

import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering - uses cookies
export const dynamic = 'force-dynamic';
import { createRouteClient } from '@/lib/supabase/serverRouteClient';
import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

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
        predictionsToday: number;
        winsToday: number;
        winRateToday: number;
      }>;
      allTime?: Array<{
        rank: number;
        userId: string;
        username: string;
        allTimeProfit: number;
        totalPredictions: number;
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
        console.error('[PREDICTION LEADERBOARD] Daily fetch error:', dailyError);
      } else {
        result.daily = daily.map((entry, index) => ({
          rank: index + 1,
          userId: entry.user_id,
          username: entry.username,
          dailyProfit: entry.daily_profit,
          predictionsToday: entry.bets_today, // Keep DB field name, rename for clarity
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
        console.error('[PREDICTION LEADERBOARD] All-time fetch error:', allTimeError);
      } else {
        result.allTime = allTime.map((entry, index) => ({
          rank: index + 1,
          userId: entry.user_id,
          username: entry.username,
          allTimeProfit: entry.all_time_profit,
          totalPredictions: entry.total_bets, // Keep DB field name, rename for clarity
          totalWins: entry.total_wins,
          winRate: entry.win_rate,
          roi: entry.roi,
        }));
      }
    }

    // Debug: Add raw bet counts if debug param is set
    const debug = searchParams.get('debug') === 'true';
    let debugInfo = null;

    if (debug) {
      // Use service role client to bypass RLS for debug queries
      const adminClient = createServiceRoleClient({ allowNull: true });
      if (!adminClient) {
        console.error('[PREDICTION LEADERBOARD] Service role client unavailable for debug');
      } else {
        // Get all users with betting enabled and their bet counts
        const { data: allUsers } = await adminClient
          .from('users')
          .select('id, username, betting_mode_enabled')
          .eq('betting_mode_enabled', true);

        // Get all bets with status breakdown (service role bypasses RLS)
        const { data: allBets, error: betsError } = await adminClient
          .from('bets')
          .select('user_id, status, placed_at, resolved_at, stake_points, payout_points');

        if (betsError) {
          console.error('[PREDICTION LEADERBOARD] Debug bets query error:', betsError);
        }

        // Calculate stats per user
        const userStats = (allUsers || []).map(user => {
          const userBets = (allBets || []).filter(b => b.user_id === user.id);
          const today = new Date().toISOString().split('T')[0];
          const placedToday = userBets.filter(b => b.placed_at?.startsWith(today));
          const resolvedToday = userBets.filter(b => b.resolved_at?.startsWith(today));
          const resolved = userBets.filter(b => b.status === 'won' || b.status === 'lost');
          const pending = userBets.filter(b => b.status === 'pending');
          const won = userBets.filter(b => b.status === 'won');
          const lost = userBets.filter(b => b.status === 'lost');

          return {
            username: user.username,
            totalBets: userBets.length,
            placedToday: placedToday.length,
            resolvedToday: resolvedToday.length,
            totalResolved: resolved.length,
            totalPending: pending.length,
            totalWon: won.length,
            totalLost: lost.length,
            bettingEnabled: user.betting_mode_enabled,
          };
        });

        // Get recent bets for detailed analysis
        const recentBets = (allBets || [])
          .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime())
          .slice(0, 20)
          .map(b => ({
            userId: b.user_id,
            status: b.status,
            placedAt: b.placed_at,
            resolvedAt: b.resolved_at,
          }));

        debugInfo = {
          serverDate: new Date().toISOString(),
          usersWithBettingEnabled: allUsers?.length || 0,
          totalBetsInDb: allBets?.length || 0,
          userStats,
          recentBets,
        };
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      ...(debug && { debug: debugInfo }),
    });
  } catch (error) {
    console.error('[PREDICTION LEADERBOARD] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
