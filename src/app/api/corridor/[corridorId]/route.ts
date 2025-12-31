/**
 * Corridor Board API Endpoint
 *
 * Phase 21: Service Corridor Architecture
 * Phase 22: Add weather context for risk scoring
 * Phase 32: Add Open-Meteo forecast support
 *
 * GET /api/corridor/[corridorId]
 *
 * Query parameters:
 * - forecast=true: Use Open-Meteo forecast data for hour-specific risk
 *
 * Returns a DailyCorridorBoard with all sailings in both directions,
 * interleaved and ordered by time, with per-sailing risk scores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyCorridorBoard } from '@/lib/corridor-board';
import { isValidCorridor, getCorridorById } from '@/lib/config/corridors';
import { fetchCurrentWeather } from '@/lib/weather/noaa';
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
    // Phase 22: Fetch weather for risk scoring (fallback when forecast unavailable)
    const corridor = getCorridorById(corridorId);
    let weather: WeatherContext | null = null;

    if (corridor) {
      try {
        // Use the first terminal for weather (close enough for same corridor)
        const weatherSnapshot = await fetchCurrentWeather(corridor.terminal_a);
        weather = {
          windSpeed: weatherSnapshot.wind_speed,
          windGusts: weatherSnapshot.wind_gusts,
          windDirection: weatherSnapshot.wind_direction,
          advisoryLevel: weatherSnapshot.advisory_level,
        };
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
    const weatherContext = weather
      ? {
          wind_speed: weather.windSpeed,
          wind_gusts: weather.windGusts,
          wind_direction: weather.windDirection,
          advisory_level: weather.advisoryLevel,
        }
      : null;

    return NextResponse.json({
      success: true,
      board,
      weather_context: weatherContext,
    });
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
