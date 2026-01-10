/**
 * Resolve Bets API
 *
 * POST /api/betting/resolve
 *
 * Resolves bets for a sailing when the outcome is known.
 * This is called by the outcome logging system.
 *
 * Requires service role or authenticated admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

interface ResolveBetsRequest {
  sailingId: string;
  outcome: 'sailed' | 'canceled';
  secretKey?: string; // Simple auth for internal calls
}

export async function POST(request: NextRequest) {
  try {
    // Create service role client (lazy initialization - not at module level)
    const supabaseAdmin = createServiceRoleClient({ allowNull: true });
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Service not configured' },
        { status: 500 }
      );
    }

    const body: ResolveBetsRequest = await request.json();
    const { sailingId, outcome, secretKey } = body;

    // Basic validation
    if (!sailingId || !outcome) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['sailed', 'canceled'].includes(outcome)) {
      return NextResponse.json(
        { success: false, error: 'Invalid outcome' },
        { status: 400 }
      );
    }

    // Verify authorization (simple secret key for internal use)
    const expectedKey = process.env.BET_RESOLUTION_SECRET_KEY;
    if (expectedKey && secretKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find all pending bets for this sailing
    const { data: pendingBets, error: fetchError } = await supabaseAdmin
      .from('bets')
      .select('id')
      .eq('sailing_id', sailingId)
      .eq('status', 'pending');

    if (fetchError) {
      console.error('[RESOLVE] Fetch pending bets error:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pending bets' },
        { status: 500 }
      );
    }

    if (!pendingBets || pendingBets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending bets to resolve',
        resolvedCount: 0,
      });
    }

    // Resolve each bet
    const resolvedBets = [];
    const errors = [];

    for (const bet of pendingBets) {
      const { data: resolvedBet, error: resolveError } = await supabaseAdmin.rpc(
        'resolve_bet',
        {
          p_bet_id: bet.id,
          p_outcome: outcome,
        }
      );

      if (resolveError) {
        console.error(`[RESOLVE] Error resolving bet ${bet.id}:`, resolveError);
        errors.push({ betId: bet.id, error: resolveError.message });
      } else {
        resolvedBets.push({
          id: resolvedBet.id,
          userId: resolvedBet.user_id,
          status: resolvedBet.status,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Resolved ${resolvedBets.length} bets`,
      resolvedCount: resolvedBets.length,
      errorCount: errors.length,
      resolved: resolvedBets,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[RESOLVE] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
