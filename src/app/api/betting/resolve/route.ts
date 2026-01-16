/**
 * Resolve Predictions API
 *
 * POST /api/betting/resolve
 *
 * Resolves predictions for a sailing when the outcome is known.
 * This is called by the outcome logging system.
 *
 * Requires service role or authenticated admin.
 *
 * NOTE: API path retained for backward compatibility.
 * TERMINOLOGY: All log messages use "prediction" terminology.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

interface ResolvePredictionsRequest {
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

    const body: ResolvePredictionsRequest = await request.json();
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

    // Find all pending predictions for this sailing
    // Note: DB table retains old name 'bets' for compatibility
    const { data: pendingPredictions, error: fetchError } = await supabaseAdmin
      .from('bets')
      .select('id')
      .eq('sailing_id', sailingId)
      .eq('status', 'pending');

    if (fetchError) {
      console.error('[PREDICTION RESOLVE] Fetch pending predictions error:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pending predictions' },
        { status: 500 }
      );
    }

    if (!pendingPredictions || pendingPredictions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending predictions to resolve',
        resolvedCount: 0,
      });
    }

    // Resolve each prediction
    // Note: DB function retains old name 'resolve_bet' for compatibility
    const resolvedPredictions = [];
    const errors = [];

    for (const prediction of pendingPredictions) {
      const { data: resolvedPrediction, error: resolveError } = await supabaseAdmin.rpc(
        'resolve_bet',
        {
          p_bet_id: prediction.id,
          p_outcome: outcome,
        }
      );

      if (resolveError) {
        console.error(`[PREDICTION RESOLVE] Error resolving prediction ${prediction.id}:`, resolveError);
        errors.push({ predictionId: prediction.id, error: resolveError.message });
      } else {
        resolvedPredictions.push({
          id: resolvedPrediction.id,
          userId: resolvedPrediction.user_id,
          status: resolvedPrediction.status,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Resolved ${resolvedPredictions.length} predictions`,
      resolvedCount: resolvedPredictions.length,
      errorCount: errors.length,
      resolved: resolvedPredictions,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[PREDICTION RESOLVE] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
