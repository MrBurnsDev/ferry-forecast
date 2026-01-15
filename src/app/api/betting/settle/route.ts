/**
 * Betting Settlement Cron Job
 *
 * POST /api/betting/settle
 *
 * Phase 90: Automated bet settlement based on sailing outcomes.
 * Phase 91: Standardized on CRON_SECRET only, added X-Cron-Secret fallback.
 *
 * This endpoint is designed to be called by a cron job (Vercel Cron).
 * It finds pending bets for sailings that have departed and resolves them
 * based on the observed outcome from sailing_events.
 *
 * SETTLEMENT RULES:
 * - Only process bets where status = 'pending'
 * - A bet can only be settled after the sailing has departed
 * - Outcome mapping:
 *   - sailing_events.status = 'on_time' or 'delayed' → outcome = 'sailed'
 *   - sailing_events.status = 'canceled' → outcome = 'canceled'
 * - If bet_type === outcome → status = 'won'
 * - Else → status = 'lost'
 *
 * IDEMPOTENCY:
 * - Uses resolved_at to track already-settled bets
 * - The resolve_bet RPC function checks status != 'pending' and returns early
 * - Running twice will NOT double-award points
 *
 * SECURITY:
 * - Requires CRON_SECRET or CRON_PREDICTION_SECRET for authorization
 * - Accepts: Authorization: Bearer <SECRET>
 * - Accepts: X-Cron-Secret: <SECRET> (fallback for manual testing)
 * - Uses service role client to bypass RLS
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

// Force dynamic rendering - this is a server action
export const dynamic = 'force-dynamic';

/**
 * Convert compact time format to 24-hour format for DB lookup
 * Examples: "600am" -> "06:00:00", "1230pm" -> "12:30:00", "945am" -> "09:45:00"
 */
function normalizeTimeFor24Hour(rawTime: string): string {
  // Parse the compact format: "600am", "1230pm", etc.
  const match = rawTime.match(/^(\d{1,4})(am|pm)$/i);
  if (!match) {
    return rawTime; // Return as-is if doesn't match expected format
  }

  const timeDigits = match[1];
  const period = match[2].toLowerCase();

  let hours: number;
  let minutes: number;

  if (timeDigits.length <= 2) {
    // "6am" -> 6:00, "12pm" -> 12:00
    hours = parseInt(timeDigits, 10);
    minutes = 0;
  } else if (timeDigits.length === 3) {
    // "600am" -> 6:00, "945am" -> 9:45
    hours = parseInt(timeDigits[0], 10);
    minutes = parseInt(timeDigits.slice(1), 10);
  } else {
    // "1230pm" -> 12:30
    hours = parseInt(timeDigits.slice(0, 2), 10);
    minutes = parseInt(timeDigits.slice(2), 10);
  }

  // Convert to 24-hour
  if (period === 'pm' && hours !== 12) {
    hours += 12;
  } else if (period === 'am' && hours === 12) {
    hours = 0;
  }

  // Format as HH:MM:SS
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

interface PendingBet {
  id: string;
  user_id: string;
  sailing_id: string;
  corridor_id: string;
  bet_type: 'sail' | 'cancel';
  stake_points: number;
  payout_points: number;
  placed_at: string;
  locked_at: string | null;
}

interface SailingOutcome {
  sailing_id: string;
  status: 'on_time' | 'delayed' | 'canceled';
  departure_timestamp: string;
}

interface SettlementResult {
  betId: string;
  userId: string;
  sailingId: string;
  betType: string;
  outcome: 'sailed' | 'canceled';
  won: boolean;
  pointsAwarded: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[BET SETTLE] Starting bet settlement cron job');

  try {
    // ============================================================
    // 1. AUTHORIZATION
    // ============================================================
    // Accepts CRON_SECRET or CRON_PREDICTION_SECRET
    const authHeader = request.headers.get('authorization');
    const xCronSecret = request.headers.get('x-cron-secret');

    // Accept either secret
    const validSecrets = [
      process.env.CRON_SECRET,
      process.env.CRON_PREDICTION_SECRET,
    ].filter(Boolean);

    let authorized = false;

    // Check Authorization header (Bearer token)
    if (authHeader && validSecrets.length > 0) {
      const token = authHeader.replace('Bearer ', '');
      if (validSecrets.includes(token)) {
        authorized = true;
      }
    }

    // Check X-Cron-Secret header (for manual testing via curl)
    if (!authorized && xCronSecret && validSecrets.length > 0) {
      if (validSecrets.includes(xCronSecret)) {
        authorized = true;
      }
    }

    // In development, allow without auth for testing
    if (!authorized && process.env.NODE_ENV !== 'development') {
      console.log('[BET SETTLE] authorized: false');
      if (validSecrets.length === 0) {
        console.warn('[BET SETTLE] No CRON_SECRET or CRON_PREDICTION_SECRET configured');
      }
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[BET SETTLE] authorized: true');

    // ============================================================
    // 2. INITIALIZE SUPABASE CLIENT
    // ============================================================
    const supabase = createServiceRoleClient({ allowNull: true });
    if (!supabase) {
      console.error('[BET SETTLE] Supabase service client not configured');
      return NextResponse.json(
        { success: false, error: 'Service not configured' },
        { status: 500 }
      );
    }

    // ============================================================
    // 3. FIND PENDING BETS
    // ============================================================
    // Get all bets that are still pending and have passed their lock time
    // (lock time is 60 minutes before departure, so if locked_at < now, sailing has departed)
    const now = new Date().toISOString();

    const { data: pendingBets, error: fetchError } = await supabase
      .from('bets')
      .select('id, user_id, sailing_id, corridor_id, bet_type, stake_points, payout_points, placed_at, locked_at')
      .eq('status', 'pending')
      .lt('locked_at', now) // Only bets for sailings that have locked (departed)
      .order('locked_at', { ascending: true })
      .limit(100); // Process in batches to avoid timeouts

    if (fetchError) {
      console.error('[BET SETTLE] Failed to fetch pending bets:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pending bets', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!pendingBets || pendingBets.length === 0) {
      console.log('[BET SETTLE] No pending bets to settle');
      return NextResponse.json({
        success: true,
        message: 'No pending bets to settle',
        stats: {
          processed: 0,
          won: 0,
          lost: 0,
          skipped: 0,
          errors: 0,
          durationMs: Date.now() - startTime,
        },
      });
    }

    console.log(`[BET SETTLE] Found ${pendingBets.length} pending bets to process`);

    // ============================================================
    // 4. GET SAILING OUTCOMES
    // ============================================================
    // For each pending bet, we need to find the sailing outcome from sailing_events.
    // The sailing_id format in bets needs to be parsed to match sailing_events.

    // Collect unique sailing identifiers
    const sailingIds = [...new Set(pendingBets.map(b => b.sailing_id))];
    console.log(`[BET SETTLE] Unique sailings to look up: ${sailingIds.length}`);

    // Sailing ID format: operatorId_fromPort_toPort_departureTime
    // Example: "steamship-authority_woods-hole_vineyard-haven_600am"
    // The date is NOT in the sailing_id - we derive it from locked_at (60 min before departure)

    // Build outcome map by querying sailing_events for each sailing
    const outcomeMap = new Map<string, SailingOutcome>();

    for (const bet of pendingBets as PendingBet[]) {
      // Skip if we already have this sailing's outcome
      if (outcomeMap.has(bet.sailing_id)) continue;

      // Parse sailing_id to extract components
      // Format: operatorId_fromPort_toPort_departureTime
      const parts = bet.sailing_id.split('_');
      if (parts.length < 4) {
        console.warn(`[BET SETTLE] Invalid sailing_id format: ${bet.sailing_id}`);
        continue;
      }

      // Extract components
      const operatorId = parts[0];
      const fromPort = parts[1];
      const toPort = parts[2];
      const rawDepartureTime = parts[3]; // e.g., "600am", "1230pm"

      // Derive service_date from locked_at (departure time - 60 min = locked_at)
      // So departure date = locked_at date (for most cases)
      // locked_at is stored in UTC, we need to get the local date
      let serviceDate: string;
      if (bet.locked_at) {
        // locked_at is 60 min before departure, so add 60 min to get departure time
        const departureTime = new Date(new Date(bet.locked_at).getTime() + 60 * 60 * 1000);
        // Use Eastern time for service date (ferries are on US East Coast)
        serviceDate = departureTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      } else {
        // Fallback: use placed_at date
        serviceDate = new Date(bet.placed_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      }

      // Convert time format: "600am" -> "06:00:00" or similar DB format
      // DB stores as 24-hour format like "06:00:00"
      const normalizedTime = normalizeTimeFor24Hour(rawDepartureTime);

      console.log(`[BET SETTLE] Looking up: operator=${operatorId} from=${fromPort} to=${toPort} date=${serviceDate} time=${normalizedTime} (raw: ${rawDepartureTime})`);

      // Query sailing_events for this sailing
      const { data: sailingEvent, error: eventError } = await supabase
        .from('sailing_events')
        .select('status, observed_at')
        .eq('operator_id', operatorId)
        .eq('from_port', fromPort)
        .eq('to_port', toPort)
        .eq('service_date', serviceDate)
        .or(`departure_time.eq.${normalizedTime},departure_time.ilike.%${rawDepartureTime}%`)
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (eventError) {
        console.warn(`[BET SETTLE] Error fetching sailing event for ${bet.sailing_id}:`, eventError.message);
        continue;
      }

      if (!sailingEvent) {
        console.warn(`[BET SETTLE] No sailing event found for ${bet.sailing_id} (date=${serviceDate}, time=${normalizedTime})`);
        continue;
      }

      console.log(`[BET SETTLE] Found outcome: ${bet.sailing_id} -> ${sailingEvent.status}`);
      outcomeMap.set(bet.sailing_id, {
        sailing_id: bet.sailing_id,
        status: sailingEvent.status as 'on_time' | 'delayed' | 'canceled',
        departure_timestamp: sailingEvent.observed_at,
      });
    }

    console.log(`[BET SETTLE] Found outcomes for ${outcomeMap.size}/${sailingIds.length} sailings`);

    // ============================================================
    // 5. SETTLE EACH BET
    // ============================================================
    const results: SettlementResult[] = [];
    let wonCount = 0;
    let lostCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const bet of pendingBets as PendingBet[]) {
      const outcome = outcomeMap.get(bet.sailing_id);

      if (!outcome) {
        // No outcome available yet - skip this bet
        skippedCount++;
        continue;
      }

      // Map sailing status to bet outcome
      // on_time/delayed = sailed, canceled = canceled
      const betOutcome = outcome.status === 'canceled' ? 'canceled' : 'sailed';

      // Determine if bet won
      // bet_type 'sail' wins if outcome is 'sailed'
      // bet_type 'cancel' wins if outcome is 'canceled'
      const won = (bet.bet_type === 'sail' && betOutcome === 'sailed') ||
                  (bet.bet_type === 'cancel' && betOutcome === 'canceled');

      // Calculate points awarded
      const pointsAwarded = won ? bet.payout_points : 0;

      // Use the existing resolve_bet RPC function
      // This handles all the logic including bankroll updates
      const { error: resolveError } = await supabase.rpc(
        'resolve_bet',
        {
          p_bet_id: bet.id,
          p_outcome: betOutcome,
        }
      );

      if (resolveError) {
        console.error(`[BET SETTLE] Error resolving bet ${bet.id}:`, resolveError.message);
        results.push({
          betId: bet.id,
          userId: bet.user_id,
          sailingId: bet.sailing_id,
          betType: bet.bet_type,
          outcome: betOutcome,
          won,
          pointsAwarded: 0,
          error: resolveError.message,
        });
        errorCount++;
        continue;
      }

      // Update points_awarded column (not handled by resolve_bet RPC)
      const { error: updateError } = await supabase
        .from('bets')
        .update({ points_awarded: pointsAwarded })
        .eq('id', bet.id);

      if (updateError) {
        console.warn(`[BET SETTLE] Failed to update points_awarded for bet ${bet.id}:`, updateError.message);
      }

      if (won) {
        wonCount++;
      } else {
        lostCount++;
      }

      results.push({
        betId: bet.id,
        userId: bet.user_id,
        sailingId: bet.sailing_id,
        betType: bet.bet_type,
        outcome: betOutcome,
        won,
        pointsAwarded,
      });
    }

    // ============================================================
    // 6. RETURN RESULTS
    // ============================================================
    const durationMs = Date.now() - startTime;

    console.log(
      `[BET SETTLE] Settlement complete: processed=${results.length} won=${wonCount} lost=${lostCount} ` +
      `skipped=${skippedCount} errors=${errorCount} duration=${durationMs}ms`
    );

    return NextResponse.json({
      success: true,
      message: `Settled ${results.length} bets`,
      stats: {
        processed: results.length,
        won: wonCount,
        lost: lostCount,
        skipped: skippedCount,
        errors: errorCount,
        durationMs,
      },
      results: results.slice(0, 20), // Only return first 20 for response size
    });
  } catch (error) {
    console.error('[BET SETTLE] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET endpoint for checking settlement status (no auth required)
export async function GET() {
  const supabase = createServiceRoleClient({ allowNull: true });

  if (!supabase) {
    return NextResponse.json({
      configured: false,
      message: 'Supabase not configured',
    });
  }

  // Get count of pending bets that are ready for settlement
  const now = new Date().toISOString();

  const { count, error } = await supabase
    .from('bets')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('locked_at', now);

  if (error) {
    return NextResponse.json({
      configured: true,
      error: error.message,
    });
  }

  return NextResponse.json({
    configured: true,
    pendingBetsReadyForSettlement: count ?? 0,
    timestamp: now,
  });
}
