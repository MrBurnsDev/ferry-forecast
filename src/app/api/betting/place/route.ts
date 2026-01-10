/**
 * Place Bet API
 *
 * POST /api/betting/place
 *
 * Places a bet for an authenticated user.
 * All validation is done server-side via the place_bet database function.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteClient } from '@/lib/supabase/serverRouteClient';

// Force dynamic rendering - uses cookies for auth
export const dynamic = 'force-dynamic';

interface PlaceBetRequest {
  sailingId: string;
  corridorId: string;
  betType: 'sail' | 'cancel';
  stakePoints: number;
  likelihood: number;
  odds: number;
  payoutPoints: number;
  departureTime: string; // ISO timestamp
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteClient({ allowNull: true });
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Service not configured' },
        { status: 500 }
      );
    }

    // Verify authentication using getUser() - more reliable than getSession()
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    console.log('[BETTING API] user:', user?.id ?? null);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: PlaceBetRequest = await request.json();
    const {
      sailingId,
      corridorId,
      betType,
      stakePoints,
      likelihood,
      odds,
      payoutPoints,
      departureTime,
    } = body;

    // Basic validation
    if (!sailingId || !corridorId || !betType || !stakePoints || !departureTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['sail', 'cancel'].includes(betType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid bet type' },
        { status: 400 }
      );
    }

    if (stakePoints < 1 || stakePoints > 500) {
      return NextResponse.json(
        { success: false, error: 'Invalid stake amount' },
        { status: 400 }
      );
    }

    // Get user ID from authenticated user
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_provider_id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Place bet via database function (handles all validation + transaction)
    const { data: bet, error: placeBetError } = await supabase.rpc('place_bet', {
      p_user_id: userData.id,
      p_sailing_id: sailingId,
      p_corridor_id: corridorId,
      p_bet_type: betType,
      p_stake_points: stakePoints,
      p_likelihood: likelihood,
      p_odds: odds,
      p_payout_points: payoutPoints,
      p_departure_time: departureTime,
    });

    if (placeBetError) {
      console.error('[BETTING] Place bet error:', placeBetError);

      // Return user-friendly error messages
      if (placeBetError.message.includes('Betting mode is not enabled')) {
        return NextResponse.json(
          { success: false, error: 'Betting mode must be enabled' },
          { status: 400 }
        );
      }
      if (placeBetError.message.includes('Insufficient balance')) {
        return NextResponse.json(
          { success: false, error: 'Insufficient balance' },
          { status: 400 }
        );
      }
      if (placeBetError.message.includes('Betting window has closed')) {
        return NextResponse.json(
          { success: false, error: 'Betting window has closed' },
          { status: 400 }
        );
      }
      if (placeBetError.message.includes('Already placed a bet')) {
        return NextResponse.json(
          { success: false, error: 'Already placed a bet on this sailing' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'Failed to place bet' },
        { status: 500 }
      );
    }

    // Fetch updated bankroll
    const { data: bankroll } = await supabase
      .from('bankrolls')
      .select('*')
      .eq('user_id', userData.id)
      .single();

    return NextResponse.json({
      success: true,
      bet: {
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
      },
      newBalance: bankroll?.balance_points ?? null,
    });
  } catch (error) {
    console.error('[BETTING] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
