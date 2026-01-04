/**
 * Corridor Board API Endpoint
 *
 * Phase 21: Service Corridor Architecture
 * Phase 22: Add weather context for risk scoring
 * Phase 32: Add Open-Meteo forecast support
 * Phase 46: Cache hardening - force-dynamic to ensure Supabase fallback works
 * Phase 53: Wind source priority - operator conditions over NWS station data
 *
 * GET /api/corridor/[corridorId]
 *
 * Query parameters:
 * - forecast=true: Use Open-Meteo forecast data for hour-specific risk
 *
 * Returns a DailyCorridorBoard with all sailings in both directions,
 * interleaved and ordered by time, with per-sailing risk scores.
 *
 * CRITICAL: This endpoint MUST be dynamic to ensure canceled sailings
 * from Supabase are read on every request after serverless cold starts.
 *
 * PHASE 53 WIND SOURCE PRIORITY:
 * 1. Operator conditions (SSA terminal wind) - ALWAYS preferred when available
 * 2. NWS station observations - Only used when operator conditions unavailable
 *
 * RATIONALE: NWS stations like KHYA (Hyannis Airport) are 20+ miles from
 * ferry terminals. Operator-reported wind is measured AT the terminal and
 * is what SSA uses for sailing decisions. Using distant NWS stations caused
 * confusing discrepancies (e.g., 33 mph at airport vs 6 mph at terminal).
 */

import { NextRequest, NextResponse } from 'next/server';

// Phase 46: Force dynamic rendering - critical for serverless cold starts
// Without this, Next.js may serve stale responses that lack Supabase data
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { getDailyCorridorBoard } from '@/lib/corridor-board';
import { isValidCorridor, getCorridorById } from '@/lib/config/corridors';
// Phase 52 FIX: Removed fetchCurrentWeather import - we no longer fall back to NOAA forecast
// Phase 54 FIX: Removed fetchNWSObservationForTerminal import - NWS stations like KHYA are
// 20+ miles from terminals and showing their data as "current conditions" is misleading
import { getCancellationGuardMetadata } from '@/lib/guards/cancellation-persistence';
// Phase 53: Wind source priority - operator conditions take precedence
import { getLatestOperatorConditions } from '@/lib/events/operator-conditions';
import type { CorridorBoardResponse } from '@/types/corridor';
import type { WeatherContext } from '@/lib/scoring/sailing-risk';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ corridorId: string }> }
): Promise<NextResponse<CorridorBoardResponse>> {
  const { corridorId } = await params;

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const useForecast = searchParams.get('forecast') === 'true';

  // Validate corridor ID
  if (!corridorId || !isValidCorridor(corridorId)) {
    return NextResponse.json(
      {
        success: false,
        board: null,
        error: `Invalid corridor ID: ${corridorId}`,
      },
      { status: 400 }
    );
  }

  try {
    // Phase 22: Fetch weather for risk scoring
    // Phase 52: Use NWS station observations for current conditions (more accurate)
    // Phase 53: OPERATOR CONDITIONS TAKE PRIORITY over NWS station data
    //
    // Priority order for current conditions display:
    // 1. Operator conditions (SSA terminal wind) - most accurate for terminal
    // 2. NWS station observations - only used for risk scoring, NOT for user display
    //    REASON: NWS stations like KHYA are 20+ miles from terminals
    //
    // CRITICAL: Never show NWS station wind as "current conditions" to users
    // when operator conditions exist. This prevents confusing discrepancies
    // like showing 33 mph (airport) when SSA terminal shows 6 mph.
    const corridor = getCorridorById(corridorId);
    let weather: WeatherContext | null = null;
    let weatherSource: {
      type: 'operator' | 'nws_station' | 'noaa_forecast';
      station_id?: string;
      station_name?: string;
      observation_time?: string;
      terminal_slug?: string;
      age_minutes?: number;
    } | null = null;

    if (corridor) {
      try {
        // Phase 53: First, check for operator-reported conditions (SSA terminal wind)
        // This is the ground truth at the terminal itself
        const operatorConditions = await getLatestOperatorConditions('ssa', corridor.terminal_a, 30);

        if (operatorConditions && operatorConditions.wind_speed_mph !== null) {
          // Use operator conditions for weather context
          weather = {
            windSpeed: operatorConditions.wind_speed_mph,
            windGusts: operatorConditions.wind_speed_mph, // SSA doesn't report gusts separately
            windDirection: operatorConditions.wind_direction_degrees ?? 0,
            advisoryLevel: 'none', // Operator conditions don't include advisory level
          };

          const observedAt = new Date(operatorConditions.observed_at);
          const ageMinutes = Math.round((Date.now() - observedAt.getTime()) / 60000);

          weatherSource = {
            type: 'operator',
            terminal_slug: operatorConditions.terminal_slug,
            observation_time: operatorConditions.observed_at,
            age_minutes: ageMinutes,
          };
          console.log(
            `[CORRIDOR_API] Using OPERATOR conditions for ${corridorId}: ` +
            `wind=${operatorConditions.wind_speed_mph} mph ${operatorConditions.wind_direction_text || ''} ` +
            `(${ageMinutes} min ago)`
          );
        } else {
          // Phase 54: NO LONGER FALL BACK TO NWS STATION DATA
          //
          // RATIONALE: NWS stations like KHYA (Hyannis Airport) are 20+ miles from
          // Woods Hole terminal. Showing "41.4 mph" from the airport when SSA terminal
          // shows "6 mph" is actively misleading and confusing to users.
          //
          // DECISION: If we don't have operator conditions, show NOTHING rather than
          // showing inaccurate distant weather data. This is the "common sense" fix.
          //
          // The NWS data can still be used internally for risk scoring in the forecast
          // pipeline, but it should NOT be displayed to users as "current conditions".
          console.log(
            `[CORRIDOR_API] No operator conditions for ${corridorId}. ` +
            `NOT falling back to distant NWS station data for user display. ` +
            `Weather context will be null.`
          );
          weather = null;
          weatherSource = null;
        }
      } catch (weatherError) {
        // Weather fetch failed - continue without risk scores
        console.warn(`Weather fetch failed for corridor ${corridorId}:`, weatherError);
      }
    }

    // Generate corridor board with weather context
    // Phase 32: Optionally use Open-Meteo forecast data
    const board = await getDailyCorridorBoard(corridorId, weather, {
      useForecast,
    });

    if (!board) {
      return NextResponse.json(
        {
          success: false,
          board: null,
          error: `Corridor not found: ${corridorId}`,
        },
        { status: 404 }
      );
    }

    // Build response with optional weather context debug info (Phase 22)
    // Phase 52: Include source info so UI can show where data comes from
    // Phase 53: Include operator-specific fields when using operator conditions
    const weatherContext = weather
      ? {
          wind_speed: weather.windSpeed,
          wind_gusts: weather.windGusts,
          wind_direction: weather.windDirection,
          advisory_level: weather.advisoryLevel,
          // Phase 52/53: Source info for transparency
          source: weatherSource?.type ?? 'unknown',
          // NWS station fields (only present when source is 'nws_station')
          station_id: weatherSource?.station_id,
          station_name: weatherSource?.station_name,
          observation_time: weatherSource?.observation_time,
          // Operator condition fields (only present when source is 'operator')
          terminal_slug: weatherSource?.terminal_slug,
          age_minutes: weatherSource?.age_minutes,
        }
      : null;

    // Phase 46: Run cancellation regression guard (non-blocking)
    // This logs CRITICAL if DB has more cancellations than the response
    const guardMetadata = await getCancellationGuardMetadata(
      board.sailings,
      board.service_date_local,
      corridorId
    );

    // Log guard result for monitoring (without blocking)
    if (!guardMetadata.guard_valid) {
      console.error(
        `[CORRIDOR_API] Cancellation guard FAILED for ${corridorId}: ` +
        `response=${guardMetadata.response_canceled_count}, db=${guardMetadata.db_canceled_count}`
      );
    }

    // Phase 46: Add no-store header to prevent CDN caching
    return NextResponse.json(
      {
        success: true,
        board,
        weather_context: weatherContext,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error(`Error generating corridor board for ${corridorId}:`, error);

    return NextResponse.json(
      {
        success: false,
        board: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
