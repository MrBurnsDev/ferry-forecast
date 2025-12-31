/**
 * Corridor Forecast API Endpoint
 *
 * Phase 33: 7-Day and 14-Day Travel Forecast UX
 *
 * GET /api/corridor/[corridorId]/forecast?type=7_day|14_day
 *
 * Returns predictions from ferry_forecast.prediction_snapshots_v2
 * grouped by service_date for UI display.
 *
 * This is READ-ONLY - no prediction computation happens here.
 * Uses hours_ahead to determine forecast window:
 * - 7_day: hours_ahead <= 168
 * - 14_day: hours_ahead <= 336
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidCorridor } from '@/lib/config/corridors';
import { getCorridorForecast, type CorridorForecast } from '@/lib/forecasts';

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

  try {
    // Fetch forecast data from prediction_snapshots_v2
    const forecast = await getCorridorForecast(corridorId, forecastType);

    if (!forecast) {
      return NextResponse.json(
        {
          success: false,
          forecast: null,
          error: 'Failed to fetch forecast data',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      forecast,
    });
  } catch (error) {
    console.error(`[FORECAST_API] Error fetching forecast for ${corridorId}:`, error);

    return NextResponse.json(
      {
        success: false,
        forecast: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
