/**
 * User Bets API
 *
 * GET /api/betting/bets
 *
 * Returns all bets for the authenticated user.
 * Phase 86E: Uses Bearer token auth instead of cookies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBearerClient } from '@/lib/supabase/serverBearerClient';

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Type for user data from users table
interface UserData {
  id: string;
}

// Type for bet data from bets table
interface BetData {
  id: string;
  sailing_id: string;
  corridor_id: string;
  bet_type: string;
  stake_points: number;
  likelihood_snapshot: number;
  odds_snapshot: number;
  payout_points: number;
  status: string;
  placed_at: string;
  locked_at: string | null;
  resolved_at: string | null;
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate via Bearer token
    const { supabase, user, error: authError } = await createBearerClient(request);

    if (authError || !supabase || !user) {
      return NextResponse.json(
        { success: false, error: authError || 'Not authenticated' },
        { status: 401 }
      );
    }

    console.log('[BETTING API] auth user id:', user.id);

    // Get user ID from authenticated user
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_provider_id', user.id)
      .single<UserData>();

    if (userError || !userData) {
      console.log('[BETTING API] User not found for auth_provider_id:', user.id);
      return NextResponse.json(
        { success: false, error: 'User not found', authId: user.id },
        { status: 404 }
      );
    }

    console.log('[BETTING API] Found ferry_forecast.users.id:', userData.id);

    // Get query params for filtering
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'pending', 'won', 'lost', 'push'
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Build query
    let query = supabase
      .from('bets')
      .select('*')
      .eq('user_id', userData.id)
      .order('placed_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: bets, error: betsError } = await query.returns<BetData[]>();

    if (betsError) {
      console.error('[BETTING] Fetch bets error:', betsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bets' },
        { status: 500 }
      );
    }

    console.log('[BETTING API] Found', bets?.length || 0, 'bets for user_id:', userData.id);

    // Transform to client format
    const transformedBets = (bets || []).map(bet => ({
      id: bet.id,
      sailingId: bet.sailing_id,
      corridorId: bet.corridor_id,
      betType: bet.bet_type,
      stakePoints: bet.stake_points,
      likelihoodSnapshot: bet.likelihood_snapshot,
      oddsSnapshot: bet.odds_snapshot,
      payoutPoints: bet.payout_points,
      status: bet.status,
      placedAt: bet.placed_at,
      lockedAt: bet.locked_at,
      resolvedAt: bet.resolved_at,
    }));

    return NextResponse.json({
      success: true,
      bets: transformedBets,
    });
  } catch (error) {
    console.error('[BETTING] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
