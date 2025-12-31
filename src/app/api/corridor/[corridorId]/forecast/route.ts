/**
 * Corridor Forecast API Endpoint
 *
 * Phase 33: 7-Day and 14-Day Travel Forecast UX
 * Phase 35: Forecast API Auth Hardening + Regression Guard
 *
 * GET /api/corridor/[corridorId]/forecast?type=7_day|14_day
 *
 * Returns predictions from ferry_forecast.prediction_snapshots_v2
 * grouped by service_date for UI display.
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

  // REGRESSION GUARD: Check service role configuration before attempting query
  // If this fails, it means SUPABASE_SERVICE_ROLE_KEY is missing from Vercel env vars
  if (!isServiceRoleConfigured()) {
    console.error(
      `[FORECAST_API] REGRESSION: Service role key not configured. ` +
        `Corridor ${corridorId} forecast request will fail. ` +
        `Check Vercel environment variables for SUPABASE_SERVICE_ROLE_KEY.`
    );
    // Return empty forecast rather than exposing internal error
    // This matches the "graceful degradation" behavior specified in the requirements
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

    if (!forecast) {
      // This means the query failed but gracefully - return empty forecast
      // Don't expose internal error to client
      console.warn(`[FORECAST_API] No forecast data returned for ${corridorId}`);
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

    return NextResponse.json({
      success: true,
      forecast,
    });
  } catch (error) {
    console.error(`[FORECAST_API] Error fetching forecast for ${corridorId}:`, error);

    // Return empty forecast rather than exposing internal error
    // Client will show "Forecast data is updating" message
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
