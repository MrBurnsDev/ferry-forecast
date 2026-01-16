/**
 * Submit Prediction API
 *
 * POST /api/betting/place
 *
 * Submits a prediction for an authenticated user.
 * Phase 86E: Uses Bearer token auth instead of cookies.
 * Phase 86F: Server-computed prediction payload - frontend sends intent only.
 *
 * The prediction system is a simple thumbs up/down model:
 * - Frontend sends: sailingId, corridorId, betType (sail/cancel)
 * - Server computes: stake, odds, likelihood, departure time, payout
 *
 * All prediction math is handled server-side for trust and consistency.
 *
 * NOTE: API path and field names retained for backward compatibility.
 * TERMINOLOGY: All log messages use "prediction" terminology.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBearerClient } from '@/lib/supabase/serverBearerClient';
import { getDailyCorridorBoard } from '@/lib/corridor-board';
import { isValidApiChoice, type PlaceBetRequest } from '@/types/betting-api';
import { PREDICTION_LOCKOUT_MINUTES, DEFAULT_STAKE_POINTS } from '@/lib/betting/constants';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Type for user data from users table
interface UserData {
  id: string;
}

// Type for bet data returned from place_bet RPC
interface PlaceBetResult {
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
}

// Type for bankroll data
interface BankrollData {
  balance_points: number;
}

/**
 * Convert likelihood percentage to American odds
 */
function likelihoodToAmericanOdds(likelihood: number): number {
  const pct = Math.max(1, Math.min(99, likelihood));

  if (pct >= 50) {
    return -Math.round((pct / (100 - pct)) * 100);
  } else {
    return Math.round(((100 - pct) / pct) * 100);
  }
}

/**
 * Calculate payout from stake and American odds
 */
function calculatePayout(stake: number, americanOdds: number): number {
  let multiplier: number;
  if (americanOdds < 0) {
    multiplier = 1 + (100 / Math.abs(americanOdds));
  } else {
    multiplier = 1 + (americanOdds / 100);
  }
  return Math.round(stake * multiplier);
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate via Bearer token
    const { supabase, user, error: authError } = await createBearerClient(request);

    if (authError || !supabase || !user) {
      return NextResponse.json(
        { success: false, error: authError || 'Not authenticated' },
        { status: 401 }
      );
    }

    console.log('[PREDICTION API] auth user:', user.id);

    // Parse request body - Phase 86F minimal payload
    const body: PlaceBetRequest = await request.json();
    console.log('[PREDICTION API] received body:', body);

    const { sailingId, corridorId, betType } = body;

    // Basic validation with detailed error
    if (!sailingId || !corridorId || !betType) {
      console.log('[PREDICTION API] Validation failed:', { sailingId, corridorId, betType });
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: sailingId, corridorId, betType',
          received: { sailingId: sailingId ?? null, corridorId: corridorId ?? null, betType: betType ?? null }
        },
        { status: 400 }
      );
    }

    if (!isValidApiChoice(betType)) {
      console.log('[PREDICTION API] Invalid choice:', betType);
      return NextResponse.json(
        { success: false, error: 'Invalid choice - must be "sail" or "cancel"', received: betType },
        { status: 400 }
      );
    }

    // Get user ID from authenticated user
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_provider_id', user.id)
      .single<UserData>();

    if (userError || !userData) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // ================================================================
    // PHASE 86F: SERVER-SIDE SAILING LOOKUP AND ODDS COMPUTATION
    // ================================================================

    // Fetch the corridor board to find the sailing
    console.log('[PREDICTION API] Fetching corridor board:', corridorId);
    const board = await getDailyCorridorBoard(corridorId);

    if (!board || !board.sailings || board.sailings.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Unable to fetch sailing data for this corridor' },
        { status: 400 }
      );
    }

    // Find the specific sailing
    const sailing = board.sailings.find(s => s.sailing_id === sailingId);

    if (!sailing) {
      console.log('[PREDICTION API] Sailing not found:', sailingId, 'Available:', board.sailings.map(s => s.sailing_id).slice(0, 5));
      return NextResponse.json(
        { success: false, error: 'Sailing not found - it may have departed or been removed' },
        { status: 404 }
      );
    }

    // Extract sailing data
    const departureTimeIso = sailing.scheduled_departure_utc;
    const departureTimestampMs = new Date(departureTimeIso).getTime();
    const likelihood = sailing.likelihood_to_run_pct ?? 90; // Default to 90% if not computed

    // Validate prediction window (must be PREDICTION_LOCKOUT_MINUTES+ before departure)
    const minutesUntilDeparture = (departureTimestampMs - Date.now()) / (1000 * 60);
    if (minutesUntilDeparture < PREDICTION_LOCKOUT_MINUTES) {
      return NextResponse.json(
        { success: false, error: `Prediction window has closed - predictions must be made at least ${PREDICTION_LOCKOUT_MINUTES} minutes before departure` },
        { status: 400 }
      );
    }

    // Compute prediction math server-side
    const stakePoints = DEFAULT_STAKE_POINTS;

    // Get odds for the specific choice
    const sailLikelihood = likelihood;
    const cancelLikelihood = 100 - likelihood;
    const odds = betType === 'sail'
      ? likelihoodToAmericanOdds(sailLikelihood)
      : likelihoodToAmericanOdds(cancelLikelihood);

    const payoutPoints = calculatePayout(stakePoints, odds);

    console.log('[PREDICTION API] Computed prediction:', {
      sailingId,
      corridorId,
      betType,
      stakePoints,
      likelihood,
      odds,
      payoutPoints,
      departureTimeIso,
    });

    // ================================================================
    // SUBMIT PREDICTION VIA DATABASE FUNCTION
    // Note: DB function retains old name 'place_bet' for compatibility
    // ================================================================

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bet, error: placeBetError } = await (supabase.rpc as any)('place_bet', {
      p_user_id: userData.id,
      p_sailing_id: sailingId,
      p_corridor_id: corridorId,
      p_bet_type: betType,
      p_stake_points: stakePoints,
      p_likelihood: likelihood,
      p_odds: odds,
      p_payout_points: payoutPoints,
      p_departure_time: departureTimeIso,
    }) as { data: PlaceBetResult | null; error: Error | null };

    if (placeBetError) {
      console.error('[PREDICTION API] Submit prediction error:', placeBetError);

      // Return user-friendly error messages
      // Note: DB error messages may still use old terminology
      if (placeBetError.message.includes('Betting mode is not enabled') ||
          placeBetError.message.includes('Game mode is not enabled')) {
        return NextResponse.json(
          { success: false, error: 'Game mode must be enabled in settings' },
          { status: 400 }
        );
      }
      if (placeBetError.message.includes('Insufficient balance')) {
        return NextResponse.json(
          { success: false, error: 'Insufficient points balance' },
          { status: 400 }
        );
      }
      if (placeBetError.message.includes('Betting window has closed') ||
          placeBetError.message.includes('Prediction window has closed')) {
        return NextResponse.json(
          { success: false, error: 'Prediction window has closed' },
          { status: 400 }
        );
      }
      if (placeBetError.message.includes('Already placed a bet') ||
          placeBetError.message.includes('Already made a prediction')) {
        return NextResponse.json(
          { success: false, error: 'You already made a prediction on this sailing' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'Failed to submit prediction' },
        { status: 500 }
      );
    }

    // Fetch updated bankroll
    const { data: bankroll } = await supabase
      .from('bankrolls')
      .select('balance_points')
      .eq('user_id', userData.id)
      .single<BankrollData>();

    return NextResponse.json({
      success: true,
      bet: bet ? {
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
      } : null,
      newBalance: bankroll?.balance_points ?? null,
    });
  } catch (error) {
    console.error('[PREDICTION API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
