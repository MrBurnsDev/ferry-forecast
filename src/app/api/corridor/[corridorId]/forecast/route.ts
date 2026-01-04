/**
 * Corridor Forecast API Endpoint
 *
 * Phase 33: 7-Day and 14-Day Travel Forecast UX
 * Phase 35: Forecast API Auth Hardening + Regression Guard
 * Phase 52: Ensure forecasts NEVER render empty (heuristic baseline)
 *
 * GET /api/corridor/[corridorId]/forecast?type=7_day|14_day
 *
 * Returns predictions from ferry_forecast.prediction_snapshots_v2
 * grouped by service_date for UI display.
 *
 * PHASE 52 CRITICAL REQUIREMENT:
 * - 7-day and 14-day forecasts must NEVER be empty
 * - If DB unavailable or no predictions, use heuristic baseline from Open-Meteo
 * - Confidence labeling must be explicit and honest
 *
 * AUTHENTICATION:
 * Uses SUPABASE_SERVICE_ROLE_KEY (NOT anon key) because:
 * - prediction_snapshots_v2 has RLS policies blocking anon access
 * - Service role bypasses RLS for server-side API routes
 *
 * RUNTIME:
 * Must run in Node.js runtime (not Edge) to access environment variables
 * reliably and use full Supabase client functionality.
 *
 * This is READ-ONLY - no prediction computation happens here.
 * Uses hours_ahead to determine forecast window:
 * - 7_day: hours_ahead <= 168
 * - 14_day: hours_ahead <= 336
 */

// REQUIRED: Node.js runtime for service role key access
// Edge runtime has issues with env vars in some cases
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { isValidCorridor } from '@/lib/config/corridors';
import { getCorridorForecast, type CorridorForecast } from '@/lib/forecasts';
import { isServiceRoleConfigured } from '@/lib/supabase/serverServiceClient';
import { generateHeuristicForecast } from '@/lib/forecast/heuristic-baseline';

export interface ForecastResponse {
  success: boolean;
  forecast: CorridorForecast | null;
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ corridorId: string }> }
): Promise<NextResponse<ForecastResponse>> {
  const { corridorId } = await params;

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const forecastType = searchParams.get('type') === '14_day' ? '14_day' : '7_day';

  // Validate corridor ID
  if (!corridorId || !isValidCorridor(corridorId)) {
    return NextResponse.json(
      {
        success: false,
        forecast: null,
        error: `Invalid corridor ID: ${corridorId}`,
      },
      { status: 400 }
    );
  }

  // Phase 52: If service role is not configured, fall back to heuristic baseline
  // This ensures forecasts NEVER render empty
  if (!isServiceRoleConfigured()) {
    console.warn(
      `[FORECAST_API] Service role key not configured for ${corridorId}. ` +
        `Falling back to heuristic baseline (Phase 52).`
    );

    // Generate heuristic forecast from Open-Meteo weather data
    const heuristicForecast = await generateHeuristicForecast(corridorId, forecastType);

    if (heuristicForecast) {
      // Convert heuristic format to CorridorForecast format
      const forecast: CorridorForecast = {
        corridor_id: corridorId,
        forecast_type: forecastType,
        days: heuristicForecast.days.map((day) => ({
          service_date: day.service_date,
          predictions: day.predictions.map((p) => ({
            service_date: p.service_date,
            departure_time_local: p.departure_time_local,
            risk_level: p.risk_level,
            risk_score: p.risk_score,
            confidence: p.confidence,
            explanation: p.explanation,
            model_version: p.model_version,
            hours_ahead: p.hours_ahead,
            sailing_time: p.sailing_time,
            wind_speed_mph: p.wind_speed_mph,
            wind_gust_mph: p.wind_gust_mph,
            wind_direction_deg: p.wind_direction_deg,
            advisory_level: null,
          })),
          highest_risk_level: day.highest_risk_level,
          prediction_count: day.prediction_count,
          daily_risk: day.daily_risk,
        })),
        total_predictions: heuristicForecast.total_predictions,
        generated_at: heuristicForecast.generated_at,
        source: 'heuristic_baseline',
        confidence_disclaimer: heuristicForecast.confidence_disclaimer,
      };

      return NextResponse.json({
        success: true,
        forecast,
      });
    }

    // If heuristic also fails, return empty (should rarely happen)
    console.error(`[FORECAST_API] Heuristic baseline also failed for ${corridorId}`);
    return NextResponse.json({
      success: true,
      forecast: {
        corridor_id: corridorId,
        forecast_type: forecastType,
        days: [],
        total_predictions: 0,
        generated_at: new Date().toISOString(),
      },
    });
  }

  try {
    // Fetch forecast data from prediction_snapshots_v2
    // Uses service role client (bypasses RLS)
    const forecast = await getCorridorForecast(corridorId, forecastType);

    // Phase 52: If we got a valid forecast with data, return it
    if (forecast && forecast.days.length > 0) {
      return NextResponse.json({
        success: true,
        forecast,
      });
    }

    // Phase 52: DB returned empty - ALWAYS fall back to heuristic baseline
    // This ensures forecasts NEVER render empty
    console.warn(
      `[FORECAST_API] DB returned empty for ${corridorId}, falling back to heuristic baseline`
    );

    const heuristicForecast = await generateHeuristicForecast(corridorId, forecastType);

    if (heuristicForecast) {
      const forecast: CorridorForecast = {
        corridor_id: corridorId,
        forecast_type: forecastType,
        days: heuristicForecast.days.map((day) => ({
          service_date: day.service_date,
          predictions: day.predictions.map((p) => ({
            service_date: p.service_date,
            departure_time_local: p.departure_time_local,
            risk_level: p.risk_level,
            risk_score: p.risk_score,
            confidence: p.confidence,
            explanation: p.explanation,
            model_version: p.model_version,
            hours_ahead: p.hours_ahead,
            sailing_time: p.sailing_time,
            wind_speed_mph: p.wind_speed_mph,
            wind_gust_mph: p.wind_gust_mph,
            wind_direction_deg: p.wind_direction_deg,
            advisory_level: null,
          })),
          highest_risk_level: day.highest_risk_level,
          prediction_count: day.prediction_count,
          daily_risk: day.daily_risk,
        })),
        total_predictions: heuristicForecast.total_predictions,
        generated_at: heuristicForecast.generated_at,
        source: 'heuristic_baseline',
        confidence_disclaimer: heuristicForecast.confidence_disclaimer,
      };

      return NextResponse.json({
        success: true,
        forecast,
      });
    }

    // If even heuristic fails, return empty (should rarely happen)
    console.error(`[FORECAST_API] Heuristic baseline also failed for ${corridorId}`);
    return NextResponse.json({
      success: true,
      forecast: {
        corridor_id: corridorId,
        forecast_type: forecastType,
        days: [],
        total_predictions: 0,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`[FORECAST_API] Error fetching forecast for ${corridorId}:`, error);

    // Phase 52: Even on error, try heuristic baseline
    console.warn(`[FORECAST_API] Attempting heuristic fallback after error for ${corridorId}`);

    try {
      const heuristicForecast = await generateHeuristicForecast(corridorId, forecastType);

      if (heuristicForecast) {
        const forecast: CorridorForecast = {
          corridor_id: corridorId,
          forecast_type: forecastType,
          days: heuristicForecast.days.map((day) => ({
            service_date: day.service_date,
            predictions: day.predictions.map((p) => ({
              service_date: p.service_date,
              departure_time_local: p.departure_time_local,
              risk_level: p.risk_level,
              risk_score: p.risk_score,
              confidence: p.confidence,
              explanation: p.explanation,
              model_version: p.model_version,
              hours_ahead: p.hours_ahead,
              sailing_time: p.sailing_time,
              wind_speed_mph: p.wind_speed_mph,
              wind_gust_mph: p.wind_gust_mph,
              wind_direction_deg: p.wind_direction_deg,
              advisory_level: null,
            })),
            highest_risk_level: day.highest_risk_level,
            prediction_count: day.prediction_count,
            daily_risk: day.daily_risk,
          })),
          total_predictions: heuristicForecast.total_predictions,
          generated_at: heuristicForecast.generated_at,
          source: 'heuristic_baseline',
          confidence_disclaimer: heuristicForecast.confidence_disclaimer,
        };

        return NextResponse.json({
          success: true,
          forecast,
        });
      }
    } catch (heuristicError) {
      console.error(`[FORECAST_API] Heuristic fallback also failed:`, heuristicError);
    }

    // Return empty forecast as last resort
    return NextResponse.json({
      success: true,
      forecast: {
        corridor_id: corridorId,
        forecast_type: forecastType,
        days: [],
        total_predictions: 0,
        generated_at: new Date().toISOString(),
      },
    });
  }
}
