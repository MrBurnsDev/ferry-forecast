/**
 * Corridor Board API Endpoint
 *
 * Phase 21: Service Corridor Architecture
 * Phase 22: Add weather context for risk scoring
 * Phase 32: Add Open-Meteo forecast support
 * Phase 46: Cache hardening - force-dynamic to ensure Supabase fallback works
 * Phase 53: Wind source priority - operator conditions over NWS station data
 * Phase 56: ZIP-based local weather observations as fallback
 * Phase 58: HARD SYNC - Redundant wind authority with stale fallback
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
 * PHASE 58 AUTHORITY LADDER (STRICT, ORDERED, LABELED):
 *
 * Tier 1 - operator_live (SOURCE OF TRUTH)
 *   - Fresh operator terminal wind (≤60 minutes old)
 *   - Label: "Measured at ferry terminal (SSA)"
 *
 * Tier 2 - operator_stale (GRACE WINDOW)
 *   - Operator data exists but is 60-180 minutes old
 *   - Label: "Last reported by ferry operator (updated X hours ago)"
 *   - CRITICAL: This prevents 1-hour ingestion gaps from blanking UI
 *
 * Tier 3 - local_zip_observation (SECONDARY, AUTOMATED)
 *   - ZIP-based town-level observation from Open-Meteo
 *   - Only used when NO operator data exists within 3 hours
 *   - Label: "Local weather observation (town-level)"
 *
 * Tier 4 - operator_text_fallback (LAST RESORT)
 *   - Parsed text conditions from SSA page (not implemented yet)
 *   - Label: "Reported by ferry operator (text-only conditions)"
 *
 * Tier 5 - unavailable (ONLY IF ALL FAIL)
 *   - This state should be rare
 *   - Label: "Terminal wind data temporarily unavailable"
 *   - Logs warning for observability
 *
 * HARD RULES (ENFORCED):
 * - NEVER use airport stations
 * - NEVER use offshore buoys
 * - NEVER use forecast data for "current conditions"
 * - NEVER blend multiple sources
 * - NEVER silently downgrade authority
 * - NEVER exaggerate wind
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
    // Phase 58: HARD SYNC - Redundant Wind Authority System
    //
    // CORE REQUIREMENT: It must be functionally impossible for Ferry Forecast
    // to lack a reliable, labeled wind reading unless ALL sources fail.
    //
    // AUTHORITY TIERS (STRICT, ORDERED):
    // 1. operator_live   - Fresh operator data (≤60 min) - SOURCE OF TRUTH
    // 2. operator_stale  - Stale operator data (60-180 min) - GRACE WINDOW
    // 3. local_zip_observation - ZIP-based town-level (when no operator data exists)
    // 4. operator_text_fallback - Parsed text from SSA (not yet implemented)
    // 5. unavailable     - ONLY if ALL sources fail (should be rare)
    //
    const corridor = getCorridorById(corridorId);
    let weather: WeatherContext | null = null;

    // Phase 58: Authority type with all 5 tiers
    type WindAuthority =
      | 'operator_live'
      | 'operator_stale'
      | 'local_zip_observation'
      | 'operator_text_fallback'
      | 'unavailable';

    let weatherSource: {
      type: WindAuthority;
      observation_time?: string;
      terminal_slug?: string;
      age_minutes?: number;
      zip_code?: string;
      town_name?: string;
      wind_speed_mph?: number;
      wind_speed_kts?: number;
      wind_direction_text?: string;
      wind_direction_degrees?: number;
      temperature_f?: number;
    } = { type: 'unavailable' }; // Default to unavailable

    // Phase 58 constants
    const FRESH_THRESHOLD_MINUTES = 60;   // ≤60 min = operator_live
    const STALE_THRESHOLD_MINUTES = 180;  // 60-180 min = operator_stale (3 hour grace)

    if (corridor) {
      try {
        // Phase 58: First, check for operator-reported conditions with extended 3-hour window
        // This is the ground truth at the terminal itself
        //
        // CRITICAL: Use 180-minute window to support the stale fallback tier.
        // We'll determine live vs stale based on the actual age.
        const operatorConditions = await getLatestOperatorConditions(
          'ssa',
          corridor.terminal_a,
          STALE_THRESHOLD_MINUTES  // 3 hours - covers both live AND stale tiers
        );

        if (operatorConditions && operatorConditions.wind_speed_mph !== null) {
          // Operator conditions exist - determine if live or stale
          const observedAt = new Date(operatorConditions.observed_at);
          const ageMinutes = Math.round((Date.now() - observedAt.getTime()) / 60000);

          weather = {
            windSpeed: operatorConditions.wind_speed_mph,
            windGusts: operatorConditions.wind_speed_mph, // SSA doesn't report gusts separately
            windDirection: operatorConditions.wind_direction_degrees ?? 0,
            advisoryLevel: 'none',
          };

          // Phase 58: Tier 1 vs Tier 2 decision
          const isLive = ageMinutes <= FRESH_THRESHOLD_MINUTES;
          const authorityType: WindAuthority = isLive ? 'operator_live' : 'operator_stale';

          weatherSource = {
            type: authorityType,
            terminal_slug: operatorConditions.terminal_slug,
            observation_time: operatorConditions.observed_at,
            age_minutes: ageMinutes,
            wind_speed_mph: operatorConditions.wind_speed_mph,
            wind_direction_text: operatorConditions.wind_direction_text ?? undefined,
            wind_direction_degrees: operatorConditions.wind_direction_degrees ?? undefined,
          };

          if (isLive) {
            console.log(
              `[CORRIDOR_API] TIER 1 operator_live for ${corridorId}: ` +
              `wind=${operatorConditions.wind_speed_mph} mph ${operatorConditions.wind_direction_text || ''} ` +
              `(${ageMinutes} min ago)`
            );
          } else {
            console.log(
              `[CORRIDOR_API] TIER 2 operator_stale for ${corridorId}: ` +
              `wind=${operatorConditions.wind_speed_mph} mph ${operatorConditions.wind_direction_text || ''} ` +
              `(${ageMinutes} min ago - within 3hr grace window)`
            );
          }
        } else {
          // Phase 58: No operator data within 3 hours - fall to Tier 3 (ZIP observation)
          //
          // CRITICAL: Only use ZIP observation when operator data is completely absent.
          // ZIP data should NOT override stale operator data.
          console.log(
            `[CORRIDOR_API] No operator conditions within 3hrs for ${corridorId}. ` +
            `Trying TIER 3 ZIP-based weather observation.`
          );

          const terminalSlug = corridor.terminal_a;
          const zipObservation = TERMINAL_ZIP_MAP[terminalSlug]
            ? await fetchZipWeather(terminalSlug)
            : null;

          if (zipObservation) {
            weather = {
              windSpeed: zipObservation.wind_speed_mph,
              windGusts: zipObservation.wind_speed_mph,
              windDirection: zipObservation.wind_direction_degrees,
              advisoryLevel: 'none',
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
              wind_direction_degrees: zipObservation.wind_direction_degrees,
            };

            console.log(
              `[CORRIDOR_API] TIER 3 local_zip_observation for ${corridorId}: ` +
              `${zipObservation.wind_direction_text} ${zipObservation.wind_speed_mph} mph ` +
              `(${zipObservation.wind_speed_kts} kt) @ ${zipObservation.observed_at} ` +
              `[${zipObservation.town_name}, ZIP ${zipObservation.zip_code}]`
            );
          } else {
            // Phase 58: Tier 5 - unavailable (all sources failed)
            // This state should be RARE. Log a warning for observability.
            console.warn(
              `[CORRIDOR_API] TIER 5 unavailable for ${corridorId}: ` +
              `All wind sources failed. This should be rare - check observer extension and SSA page.`
            );
            weather = null;
            weatherSource = {
              type: 'unavailable',
            };
          }
        }
      } catch (weatherError) {
        // Weather fetch failed - log and return unavailable state
        console.error(
          `[CORRIDOR_API] Weather fetch EXCEPTION for ${corridorId}:`,
          weatherError
        );
        weather = null;
        weatherSource = {
          type: 'unavailable',
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

    // Phase 58: Build weather_context - ALWAYS returns an object (never null)
    //
    // DATA CONTRACT (FINAL):
    // weather_context: {
    //   authority: 'operator_live' | 'operator_stale' | 'local_zip_observation' | 'operator_text_fallback' | 'unavailable'
    //   wind_speed_mph: number | null
    //   wind_speed_kts: number | null
    //   wind_direction_text: string | null
    //   wind_direction_degrees: number | null
    //   temperature_f: number | null
    //   observed_at: string | null
    //   age_minutes: number | null
    //   source_label: string  // human-readable, ALWAYS present
    // }
    //
    // SOURCE LABELS (MANDATORY - no ambiguity):
    // - operator_live: "Measured at ferry terminal (SSA)"
    // - operator_stale: "Last reported by ferry operator (X hours ago)"
    // - local_zip_observation: "Local weather observation (town-level)"
    // - operator_text_fallback: "Reported by ferry operator (text-only)"
    // - unavailable: "Terminal wind data temporarily unavailable"

    // Helper to convert mph to knots
    const mphToKts = (mph: number): number => Math.round(mph * 0.868976 * 10) / 10;

    // Helper to format stale time label
    const formatStaleLabel = (ageMinutes: number): string => {
      if (ageMinutes < 120) {
        return `Last reported by ferry operator (${Math.round(ageMinutes)} min ago)`;
      } else {
        const hours = Math.round(ageMinutes / 60 * 10) / 10;
        return `Last reported by ferry operator (${hours}h ago)`;
      }
    };

    const weatherContext = weather
      ? {
          // Phase 58: Full weather_context contract
          authority: weatherSource.type,

          // Wind data (primary fields)
          wind_speed_mph: weatherSource.wind_speed_mph ?? weather.windSpeed,
          wind_speed_kts: weatherSource.wind_speed_kts ?? mphToKts(weather.windSpeed),
          wind_direction_text: weatherSource.wind_direction_text ?? null,
          wind_direction_degrees: weatherSource.wind_direction_degrees ?? weather.windDirection,

          // Legacy fields (for backwards compatibility)
          wind_speed: weather.windSpeed,
          wind_gusts: weather.windGusts,
          wind_direction: weather.windDirection,
          advisory_level: weather.advisoryLevel,

          // Observation metadata
          observed_at: weatherSource.observation_time ?? null,
          observation_time: weatherSource.observation_time,
          age_minutes: weatherSource.age_minutes ?? null,

          // Terminal info
          terminal_slug: weatherSource.terminal_slug,

          // ZIP observation fields (only for local_zip_observation)
          zip_code: weatherSource.zip_code,
          town_name: weatherSource.town_name,

          // Temperature (when available)
          temperature_f: weatherSource.temperature_f ?? null,

          // Phase 58: Source label - MANDATORY, human-readable
          source_label:
            weatherSource.type === 'operator_live'
              ? 'Measured at ferry terminal (SSA)'
              : weatherSource.type === 'operator_stale'
              ? formatStaleLabel(weatherSource.age_minutes ?? 0)
              : weatherSource.type === 'local_zip_observation'
              ? `Local weather observation (${weatherSource.town_name || 'town-level'})`
              : weatherSource.type === 'operator_text_fallback'
              ? 'Reported by ferry operator (text-only conditions)'
              : 'Terminal wind data temporarily unavailable',

          // Legacy source field (deprecated, use authority)
          source: weatherSource.type,
        }
      : {
          // Phase 58: Unavailable state - weather card MUST still render
          // UI shows: "Terminal wind data temporarily unavailable. Conditions may change rapidly."
          authority: 'unavailable' as const,

          // All wind fields null
          wind_speed_mph: null,
          wind_speed_kts: null,
          wind_direction_text: null,
          wind_direction_degrees: null,
          wind_speed: null,
          wind_gusts: null,
          wind_direction: null,
          advisory_level: null,

          // No observation
          observed_at: null,
          observation_time: null,
          age_minutes: null,

          // No temperature
          temperature_f: null,

          // Source label for unavailable state
          source_label: 'Terminal wind data temporarily unavailable',
          source: 'unavailable',
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
