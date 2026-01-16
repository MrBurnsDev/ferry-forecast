/**
 * Prediction Settlement Cron Job
 *
 * POST /api/betting/settle
 *
 * Phase 90: Automated prediction settlement based on sailing outcomes.
 * Phase 91: Standardized on CRON_SECRET only, added X-Cron-Secret fallback.
 *
 * This endpoint is designed to be called by a cron job (Vercel Cron).
 * It finds pending predictions for sailings that have departed and resolves them
 * based on the observed outcome from sailing_events.
 *
 * SETTLEMENT RULES:
 * - Only process predictions where status = 'pending'
 * - A prediction can only be settled after the sailing has departed
 * - Outcome mapping:
 *   - sailing_events.status = 'on_time' or 'delayed' → outcome = 'sailed'
 *   - sailing_events.status = 'canceled' → outcome = 'canceled'
 * - If choice === outcome → status = 'won'
 * - Else → status = 'lost'
 *
 * IDEMPOTENCY:
 * - Uses resolved_at to track already-settled predictions
 * - The resolve_bet RPC function checks status != 'pending' and returns early
 * - Running twice will NOT double-award points
 *
 * SECURITY:
 * - Requires CRON_SECRET or CRON_PREDICTION_SECRET for authorization
 * - Accepts: Authorization: Bearer <SECRET>
 * - Accepts: X-Cron-Secret: <SECRET> (fallback for manual testing)
 * - Uses service role client to bypass RLS
 *
 * NOTE: API path and DB names retained for backward compatibility.
 * TERMINOLOGY: All log messages use "prediction" terminology.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

// Force dynamic rendering - this is a server action
export const dynamic = 'force-dynamic';

/**
 * Map prediction operator IDs to sailing_events operator IDs
 * Predictions use full names like "steamship-authority" but sailing_events uses short slugs like "ssa"
 */
const OPERATOR_ID_MAP: Record<string, string> = {
  'steamship-authority': 'ssa',
  'hy-line-cruises': 'hy-line',
  // Add more mappings as needed
};

function mapOperatorId(betOperatorId: string): string {
  return OPERATOR_ID_MAP[betOperatorId] || betOperatorId;
}

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

interface PendingPrediction {
  id: string;
  user_id: string;
  sailing_id: string;
  corridor_id: string;
  bet_type: 'sail' | 'cancel'; // DB field name retained
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
  predictionId: string;
  userId: string;
  sailingId: string;
  choice: string;
  outcome: 'sailed' | 'canceled';
  won: boolean;
  pointsAwarded: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[PREDICTION SETTLE] Starting prediction settlement cron job');

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
      console.log('[PREDICTION SETTLE] authorized: false');
      if (validSecrets.length === 0) {
        console.warn('[PREDICTION SETTLE] No CRON_SECRET or CRON_PREDICTION_SECRET configured');
      }
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[PREDICTION SETTLE] authorized: true');

    // ============================================================
    // 2. INITIALIZE SUPABASE CLIENT
    // ============================================================
    const supabase = createServiceRoleClient({ allowNull: true });
    if (!supabase) {
      console.error('[PREDICTION SETTLE] Supabase service client not configured');
      return NextResponse.json(
        { success: false, error: 'Service not configured' },
        { status: 500 }
      );
    }

    // ============================================================
    // 3. FIND PENDING PREDICTIONS
    // ============================================================
    // Get all predictions that are still pending and have passed their lock time
    // (lock time is 60 minutes before departure, so if locked_at < now, sailing has departed)
    // Note: DB table retains old name 'bets' for compatibility
    const now = new Date().toISOString();

    const { data: pendingPredictions, error: fetchError } = await supabase
      .from('bets')
      .select('id, user_id, sailing_id, corridor_id, bet_type, stake_points, payout_points, placed_at, locked_at')
      .eq('status', 'pending')
      .lt('locked_at', now) // Only predictions for sailings that have locked (departed)
      .order('locked_at', { ascending: true })
      .limit(100); // Process in batches to avoid timeouts

    if (fetchError) {
      console.error('[PREDICTION SETTLE] Failed to fetch pending predictions:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pending predictions', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!pendingPredictions || pendingPredictions.length === 0) {
      console.log('[PREDICTION SETTLE] No pending predictions to settle');
      return NextResponse.json({
        success: true,
        message: 'No pending predictions to settle',
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

    console.log(`[PREDICTION SETTLE] Found ${pendingPredictions.length} pending predictions to process`);

    // ============================================================
    // 4. GET SAILING OUTCOMES
    // ============================================================
    // For each pending prediction, we need to find the sailing outcome from sailing_events.
    // The sailing_id format in predictions needs to be parsed to match sailing_events.

    // Collect unique sailing identifiers
    const sailingIds = [...new Set(pendingPredictions.map(p => p.sailing_id))];
    console.log(`[PREDICTION SETTLE] Unique sailings to look up: ${sailingIds.length}`);

    // Sailing ID format: operatorId_fromPort_toPort_departureTime
    // Example: "steamship-authority_woods-hole_vineyard-haven_600am"
    // The date is NOT in the sailing_id - we derive it from locked_at (60 min before departure)

    // Build outcome map by querying sailing_events for each sailing
    const outcomeMap = new Map<string, SailingOutcome>();

    for (const prediction of pendingPredictions as PendingPrediction[]) {
      // Skip if we already have this sailing's outcome
      if (outcomeMap.has(prediction.sailing_id)) continue;

      // Parse sailing_id to extract components
      // Phase 93 format (5 parts): operatorId_fromPort_toPort_date_departureTime
      // Legacy format (4 parts): operatorId_fromPort_toPort_departureTime
      const parts = prediction.sailing_id.split('_');
      if (parts.length < 4) {
        console.warn(`[PREDICTION SETTLE] Invalid sailing_id format: ${prediction.sailing_id}`);
        continue;
      }

      // Extract components and map operator ID to DB format
      const predictionOperatorId = parts[0];
      const operatorId = mapOperatorId(predictionOperatorId); // Map "steamship-authority" -> "ssa"
      const fromPort = parts[1];
      const toPort = parts[2];

      // Detect format: 5-part (date-qualified) vs 4-part (legacy)
      let serviceDate: string;
      let rawDepartureTime: string;

      if (parts.length >= 5 && /^\d{4}-\d{2}-\d{2}$/.test(parts[3])) {
        // Phase 93 format: date is in parts[3], time is in parts[4]
        serviceDate = parts[3];
        rawDepartureTime = parts[4];
        console.log(`[PREDICTION SETTLE] Using date-qualified format: date=${serviceDate} time=${rawDepartureTime}`);
      } else {
        // Legacy format: time is in parts[3], derive date from locked_at
        rawDepartureTime = parts[3];
        if (prediction.locked_at) {
          // locked_at is 60 min before departure, so add 60 min to get departure time
          const departureTime = new Date(new Date(prediction.locked_at).getTime() + 60 * 60 * 1000);
          // Use Eastern time for service date (ferries are on US East Coast)
          serviceDate = departureTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        } else {
          // Fallback: use placed_at date
          serviceDate = new Date(prediction.placed_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        }
        console.log(`[PREDICTION SETTLE] Using legacy format: derived date=${serviceDate} time=${rawDepartureTime}`);
      }

      // Convert time format: "600am" -> "06:00:00" or similar DB format
      // DB stores as 24-hour format like "06:00:00"
      const normalizedTime = normalizeTimeFor24Hour(rawDepartureTime);

      console.log(`[PREDICTION SETTLE] Looking up: operator=${operatorId} (was ${predictionOperatorId}) from=${fromPort} to=${toPort} date=${serviceDate} time=${normalizedTime} (raw: ${rawDepartureTime})`);

      // Query sailing_events for this sailing - first try exact time match
      const { data: initialSailingEvent, error: eventError } = await supabase
        .from('sailing_events')
        .select('status, observed_at, departure_time')
        .eq('operator_id', operatorId)
        .eq('from_port', fromPort)
        .eq('to_port', toPort)
        .eq('service_date', serviceDate)
        .eq('departure_time', normalizedTime)
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let sailingEvent = initialSailingEvent;

      // If no exact match, try to find closest sailing within 30 min
      if (!sailingEvent && !eventError) {
        console.log(`[PREDICTION SETTLE] No exact time match for ${normalizedTime}. Looking for closest...`);

        // Get all sailings for this route/date and find closest time
        const { data: allSailings } = await supabase
          .from('sailing_events')
          .select('status, observed_at, departure_time')
          .eq('operator_id', operatorId)
          .eq('from_port', fromPort)
          .eq('to_port', toPort)
          .eq('service_date', serviceDate)
          .order('departure_time', { ascending: true });

        if (allSailings && allSailings.length > 0) {
          console.log(`[PREDICTION SETTLE] Found ${allSailings.length} sailings. Available times:`, allSailings.map(s => s.departure_time));

          // Parse target time to minutes since midnight
          const [targetHours, targetMins] = normalizedTime.split(':').map(Number);
          const targetMinutes = targetHours * 60 + targetMins;

          // Find closest sailing within 30 minute window
          let closestSailing = null;
          let closestDiff = Infinity;

          for (const s of allSailings) {
            const [h, m] = s.departure_time.split(':').map(Number);
            const sailingMinutes = h * 60 + m;
            const diff = Math.abs(sailingMinutes - targetMinutes);

            if (diff < closestDiff && diff <= 30) {
              closestDiff = diff;
              closestSailing = s;
            }
          }

          if (closestSailing) {
            console.log(`[PREDICTION SETTLE] Using closest match: ${closestSailing.departure_time} (${closestDiff} min from ${normalizedTime})`);
            sailingEvent = closestSailing;
          }
        }
      }

      if (eventError) {
        console.warn(`[PREDICTION SETTLE] Error fetching sailing event for ${prediction.sailing_id}:`, eventError.message);
        continue;
      }

      if (!sailingEvent) {
        console.warn(`[PREDICTION SETTLE] No sailing event found for ${prediction.sailing_id} (date=${serviceDate}, time=${normalizedTime})`);
        continue;
      }

      console.log(`[PREDICTION SETTLE] Found outcome: ${prediction.sailing_id} -> ${sailingEvent.status}`);
      outcomeMap.set(prediction.sailing_id, {
        sailing_id: prediction.sailing_id,
        status: sailingEvent.status as 'on_time' | 'delayed' | 'canceled',
        departure_timestamp: sailingEvent.observed_at,
      });
    }

    console.log(`[PREDICTION SETTLE] Found outcomes for ${outcomeMap.size}/${sailingIds.length} sailings`);

    // ============================================================
    // 5. SETTLE EACH PREDICTION
    // ============================================================
    const results: SettlementResult[] = [];
    let wonCount = 0;
    let lostCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const prediction of pendingPredictions as PendingPrediction[]) {
      const outcome = outcomeMap.get(prediction.sailing_id);

      if (!outcome) {
        // No outcome available yet - skip this prediction
        skippedCount++;
        continue;
      }

      // Map sailing status to prediction outcome
      // on_time/delayed = sailed, canceled = canceled
      const predictionOutcome = outcome.status === 'canceled' ? 'canceled' : 'sailed';

      // Determine if prediction won
      // choice 'sail' wins if outcome is 'sailed'
      // choice 'cancel' wins if outcome is 'canceled'
      const won = (prediction.bet_type === 'sail' && predictionOutcome === 'sailed') ||
                  (prediction.bet_type === 'cancel' && predictionOutcome === 'canceled');

      // Calculate points awarded
      const pointsAwarded = won ? prediction.payout_points : 0;

      // Use the existing resolve_bet RPC function
      // Note: DB function retains old name for compatibility
      // This handles all the logic including bankroll updates
      const { error: resolveError } = await supabase.rpc(
        'resolve_bet',
        {
          p_bet_id: prediction.id,
          p_outcome: predictionOutcome,
        }
      );

      if (resolveError) {
        console.error(`[PREDICTION SETTLE] Error resolving prediction ${prediction.id}:`, resolveError.message);
        results.push({
          predictionId: prediction.id,
          userId: prediction.user_id,
          sailingId: prediction.sailing_id,
          choice: prediction.bet_type,
          outcome: predictionOutcome,
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
        .eq('id', prediction.id);

      if (updateError) {
        console.warn(`[PREDICTION SETTLE] Failed to update points_awarded for prediction ${prediction.id}:`, updateError.message);
      }

      if (won) {
        wonCount++;
      } else {
        lostCount++;
      }

      results.push({
        predictionId: prediction.id,
        userId: prediction.user_id,
        sailingId: prediction.sailing_id,
        choice: prediction.bet_type,
        outcome: predictionOutcome,
        won,
        pointsAwarded,
      });
    }

    // ============================================================
    // 6. RETURN RESULTS
    // ============================================================
    const durationMs = Date.now() - startTime;

    console.log(
      `[PREDICTION SETTLE] Settlement complete: processed=${results.length} won=${wonCount} lost=${lostCount} ` +
      `skipped=${skippedCount} errors=${errorCount} duration=${durationMs}ms`
    );

    // Debug: show what sailings we tried to look up
    const debugLookups = pendingPredictions.slice(0, 5).map((prediction) => {
      const parts = prediction.sailing_id.split('_');
      if (parts.length < 4) return { sailing_id: prediction.sailing_id, error: 'invalid format' };
      const predictionOperatorId = parts[0];
      const operatorId = mapOperatorId(predictionOperatorId);
      const fromPort = parts[1];
      const toPort = parts[2];

      // Detect format: 5-part (date-qualified) vs 4-part (legacy)
      let serviceDate: string;
      let rawTime: string;
      if (parts.length >= 5 && /^\d{4}-\d{2}-\d{2}$/.test(parts[3])) {
        serviceDate = parts[3];
        rawTime = parts[4];
      } else {
        rawTime = parts[3];
        if (prediction.locked_at) {
          const departureTime = new Date(new Date(prediction.locked_at).getTime() + 60 * 60 * 1000);
          serviceDate = departureTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        } else {
          serviceDate = 'unknown';
        }
      }

      const normalizedTime = normalizeTimeFor24Hour(rawTime);
      return {
        sailing_id: prediction.sailing_id,
        query: { operator_id: operatorId, from_port: fromPort, to_port: toPort, service_date: serviceDate, time: normalizedTime },
        found: outcomeMap.has(prediction.sailing_id),
      };
    });

    return NextResponse.json({
      success: true,
      message: `Settled ${results.length} predictions`,
      stats: {
        processed: results.length,
        won: wonCount,
        lost: lostCount,
        skipped: skippedCount,
        errors: errorCount,
        durationMs,
      },
      results: results.slice(0, 20), // Only return first 20 for response size
      debug: { lookups: debugLookups },
    });
  } catch (error) {
    console.error('[PREDICTION SETTLE] Unexpected error:', error);
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

  // Get count of pending predictions that are ready for settlement
  // Note: DB table retains old name 'bets' for compatibility
  const now = new Date().toISOString();

  // First get raw data to debug
  const { data: pendingPredictions, error: listError } = await supabase
    .from('bets')
    .select('id, sailing_id, status, locked_at')
    .eq('status', 'pending')
    .lt('locked_at', now)
    .limit(10);

  if (listError) {
    return NextResponse.json({
      configured: true,
      error: listError.message,
      debug: 'list query failed',
    });
  }

  // Debug: query sailing_events to see what's actually there for woods-hole route
  // Query for 8:45 AM sailing specifically
  const { data: sampleEvents, error: eventsError } = await supabase
    .from('sailing_events')
    .select('operator_id, from_port, to_port, service_date, departure_time, status')
    .eq('operator_id', 'ssa')
    .eq('service_date', '2026-01-14')
    .eq('from_port', 'woods-hole')
    .eq('to_port', 'vineyard-haven')
    .limit(20);  // Get more to see all times

  return NextResponse.json({
    configured: true,
    pendingPredictionsReadyForSettlement: pendingPredictions?.length ?? 0,
    timestamp: now,
    debug: {
      predictionsFound: pendingPredictions?.length ?? 0,
      samplePredictions: pendingPredictions?.slice(0, 3).map(p => ({
        id: p.id.substring(0, 8),
        sailing_id: p.sailing_id,
        locked_at: p.locked_at,
      })),
      sailingEventsQuery: eventsError ? eventsError.message : 'success',
      sampleSailingEvents: sampleEvents?.slice(0, 3),
    },
  });
}
