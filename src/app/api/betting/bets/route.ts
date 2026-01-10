/**
 * User Bets API
 *
 * GET /api/betting/bets
 *
 * Returns all bets for the authenticated user.
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

    // Verify authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user ID from session
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_provider_id', session.user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

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

    const { data: bets, error: betsError } = await query;

    if (betsError) {
      console.error('[BETTING] Fetch bets error:', betsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bets' },
        { status: 500 }
      );
    }

    // Transform to client format
    const transformedBets = bets.map(bet => ({
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
