/**
 * Corridor Board API Endpoint
 *
 * Phase 21: Service Corridor Architecture
 * Phase 22: Add weather context for risk scoring
 * Phase 32: Add Open-Meteo forecast support
 * Phase 46: Cache hardening - force-dynamic to ensure Supabase fallback works
 * Phase 53: Wind source priority - operator conditions over NWS station data
 * Phase 56: ZIP-based local weather observations as fallback
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
 * PHASE 56 AUTHORITY LADDER:
 * 1. operator (highest) - SSA terminal-measured wind
 * 2. local_zip_observation - ZIP code-resolved current conditions (Open-Meteo)
 * 3. unavailable - No data available
 *
 * RATIONALE: NWS stations like KHYA (Hyannis Airport) are 20+ miles from
 * ferry terminals. ZIP-based observations from Open-Meteo provide local
 * current conditions when operator data is unavailable.
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
// Phase 56: ZIP-based local weather observations as fallback
import { fetchZipWeather, TERMINAL_ZIP_MAP } from '@/lib/weather/zip-weather';
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
    // Phase 56: weatherSource is ALWAYS set (never null) per PATCH PROMPT
    // authority field determines UI state: operator, local_zip_observation, or unavailable
    let weatherSource: {
      type: 'operator' | 'local_zip_observation' | 'unavailable';
      station_id?: string;
      station_name?: string;
      observation_time?: string;
      terminal_slug?: string;
      age_minutes?: number;
      zip_code?: string;
      town_name?: string;
      wind_speed_mph?: number;
      wind_speed_kts?: number;
      wind_direction_text?: string;
    } = { type: 'unavailable' }; // Default to unavailable

    if (corridor) {
      try {
        // Phase 53: First, check for operator-reported conditions (SSA terminal wind)
        // This is the ground truth at the terminal itself
        const operatorConditions = await getLatestOperatorConditions('ssa', corridor.terminal_a, 30);

        if (operatorConditions && operatorConditions.wind_speed_mph !== null) {
          // State A: Operator conditions available - highest authority
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
          // Phase 56: State B - Try ZIP-based local weather observation
          //
          // Authority ladder: operator > local_zip_observation > unavailable
          //
          // When operator conditions aren't available, try to get local weather
          // from Open-Meteo's current_weather endpoint using ZIP code coordinates.
          // This provides observation-like data for the terminal's locality.
          console.log(
            `[CORRIDOR_API] No operator conditions for ${corridorId}. ` +
            `Trying ZIP-based weather observation (Phase 56).`
          );

          // Try terminal_a first (the primary terminal for the corridor)
          const terminalSlug = corridor.terminal_a;
          const zipObservation = TERMINAL_ZIP_MAP[terminalSlug]
            ? await fetchZipWeather(terminalSlug)
            : null;

          if (zipObservation) {
            // State B: ZIP observation available
            weather = {
              windSpeed: zipObservation.wind_speed_mph,
              windGusts: zipObservation.wind_speed_mph, // Open-Meteo current_weather doesn't provide gusts
              windDirection: zipObservation.wind_direction_degrees,
              advisoryLevel: 'none', // ZIP observations don't include advisory level
            };

            weatherSource = {
              type: 'local_zip_observation',
              terminal_slug: terminalSlug,
              observation_time: zipObservation.observed_at,
              zip_code: zipObservation.zip_code,
              town_name: zipObservation.town_name,
              wind_speed_mph: zipObservation.wind_speed_mph,
              wind_speed_kts: zipObservation.wind_speed_kts,
              wind_direction_text: zipObservation.wind_direction_text,
            };

            console.log(
              `[CORRIDOR_API] Using ZIP observation for ${corridorId}: ` +
              `${zipObservation.wind_direction_text} ${zipObservation.wind_speed_mph} mph ` +
              `(${zipObservation.wind_speed_kts} kt) @ ${zipObservation.observed_at} ` +
              `[${zipObservation.town_name}, ZIP ${zipObservation.zip_code}]`
            );
          } else {
            // State C: No observation available at all
            // PATCH PROMPT RULE: Weather card must ALWAYS render.
            // Missing data ≠ hide UI. Authority affects messaging, not visibility.
            console.log(
              `[CORRIDOR_API] No ZIP observation for ${corridorId}. ` +
              `Returning authority=unavailable for proper UI empty state.`
            );
            weather = null;
            weatherSource = {
              type: 'unavailable' as const,
            };
          }
        }
      } catch (weatherError) {
        // Weather fetch failed - still return unavailable state
        console.warn(`Weather fetch failed for corridor ${corridorId}:`, weatherError);
        weather = null;
        weatherSource = {
          type: 'unavailable' as const,
        };
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

    // Phase 56: Build weather_context - ALWAYS returns an object (never null)
    // Per PATCH PROMPT: "Weather card must ALWAYS render"
    // authority field determines UI messaging:
    // - 'operator': "Measured at ferry terminal"
    // - 'local_zip_observation': "Current conditions near [town_name]"
    // - 'unavailable': Show empty state with "Terminal wind data is temporarily unavailable"
    const weatherContext = weather
      ? {
          // Wind data available
          wind_speed: weather.windSpeed,
          wind_gusts: weather.windGusts,
          wind_direction: weather.windDirection,
          advisory_level: weather.advisoryLevel,
          // Authority field for UI messaging
          authority: weatherSource.type,
          // Source info for transparency (deprecated, use authority)
          source: weatherSource.type,
          // Observation time (works for both operator and ZIP)
          observation_time: weatherSource.observation_time,
          // Operator condition fields (only present when authority is 'operator')
          terminal_slug: weatherSource.terminal_slug,
          age_minutes: weatherSource.age_minutes,
          // Phase 56: ZIP observation fields (only present when authority is 'local_zip_observation')
          zip_code: weatherSource.zip_code,
          town_name: weatherSource.town_name,
          wind_speed_mph: weatherSource.wind_speed_mph,
          wind_speed_kts: weatherSource.wind_speed_kts,
          wind_direction_text: weatherSource.wind_direction_text,
          // Source label for UI display
          source_label:
            weatherSource.type === 'operator'
              ? 'Measured at ferry terminal'
              : weatherSource.type === 'local_zip_observation'
              ? `Current conditions near ${weatherSource.town_name || 'terminal'}`
              : 'Data unavailable',
        }
      : {
          // No wind data available - return empty object with authority='unavailable'
          // UI should show: "Terminal wind data is temporarily unavailable. Conditions may change rapidly."
          wind_speed: null,
          wind_gusts: null,
          wind_direction: null,
          advisory_level: null,
          authority: 'unavailable' as const,
          source: 'unavailable',
          source_label: 'Data unavailable',
        };

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
