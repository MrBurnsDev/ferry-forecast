/**
 * Corridor Board API Endpoint
 *
 * Phase 21: Service Corridor Architecture
 * Phase 22: Add weather context for risk scoring
 * Phase 32: Add Open-Meteo forecast support
 * Phase 46: Cache hardening - force-dynamic to ensure Supabase fallback works
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
 */

import { NextRequest, NextResponse } from 'next/server';

// Phase 46: Force dynamic rendering - critical for serverless cold starts
// Without this, Next.js may serve stale responses that lack Supabase data
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { getDailyCorridorBoard } from '@/lib/corridor-board';
import { isValidCorridor, getCorridorById } from '@/lib/config/corridors';
// Phase 52 FIX: Removed fetchCurrentWeather import - we no longer fall back to NOAA forecast
// for current conditions, as that shows PREDICTED weather (not actual observations)
import { fetchNWSObservationForTerminal } from '@/lib/weather/nws-station-collector';
import { getCancellationGuardMetadata } from '@/lib/guards/cancellation-persistence';
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
    // with NOAA forecast as fallback
    const corridor = getCorridorById(corridorId);
    let weather: WeatherContext | null = null;
    let weatherSource: { type: 'nws_station' | 'noaa_forecast'; station_id?: string; station_name?: string; observation_time?: string } | null = null;

    if (corridor) {
      try {
        // First, try NWS station observations (real-time data, matches SSA's sources)
        const nwsResult = await fetchNWSObservationForTerminal(corridor.terminal_a);

        if (nwsResult.success && nwsResult.observation) {
          const obs = nwsResult.observation;
          weather = {
            windSpeed: obs.wind_speed_mph ?? 0,
            windGusts: obs.wind_gust_mph ?? obs.wind_speed_mph ?? 0,
            windDirection: obs.wind_direction_deg ?? 0,
            advisoryLevel: 'none', // NWS observations don't include advisory level directly
          };
          weatherSource = {
            type: 'nws_station',
            station_id: obs.station_id,
            station_name: obs.station_name,
            observation_time: obs.observation_time.toISOString(),
          };
          console.log(
            `[CORRIDOR_API] Using NWS station ${obs.station_id} for ${corridorId}: ` +
            `wind=${obs.wind_speed_mph} mph, dir=${obs.wind_direction_deg}°`
          );
        } else {
          // NWS station fetch failed
          // Phase 52 FIX: Do NOT fall back to NOAA forecast for current conditions
          // NOAA forecast shows PREDICTED weather, not CURRENT observations
          // This was causing misleading displays (e.g., 33 mph predicted vs 6 mph actual)
          console.warn(
            `[CORRIDOR_API] NWS station fetch failed for ${corridor.terminal_a}: ${nwsResult.error}. ` +
            `NOT falling back to NOAA forecast to avoid showing predicted weather as current conditions.`
          );
          // Leave weather as null - the UI will handle this gracefully
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
    const weatherContext = weather
      ? {
          wind_speed: weather.windSpeed,
          wind_gusts: weather.windGusts,
          wind_direction: weather.windDirection,
          advisory_level: weather.advisoryLevel,
          // Phase 52: Source info for transparency
          source: weatherSource?.type ?? 'unknown',
          station_id: weatherSource?.station_id,
          station_name: weatherSource?.station_name,
          observation_time: weatherSource?.observation_time,
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
