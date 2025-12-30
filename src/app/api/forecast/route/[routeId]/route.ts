import { NextRequest, NextResponse } from 'next/server';
import { getRouteById } from '@/lib/config/routes';
import { fetchRouteBySlug } from '@/lib/supabase/queries';
import { fetchHourlyForecast, WeatherFetchError } from '@/lib/weather/noaa';
import { getActiveAdvisoryLevel, AlertFetchError } from '@/lib/weather/nws';
import { getCurrentTideSwing, TideFetchError, hasTideStation } from '@/lib/tides/noaaCoops';
import { getOperatorStatus, type OperatorStatusResult } from '@/lib/operators';
import { calculateRiskScore, getRiskLevel, type ScoringInput } from '@/lib/scoring/score';
import { isUsingV2Algorithm, degreesToCompassBucket, calculateExposureModifier } from '@/lib/config/exposure';
import type {
  ForecastResponse,
  WeatherSnapshot,
  FerryRoute,
  AdvisoryLevel,
  TideSwing,
  HourlyForecast,
} from '@/types/forecast';

// Cache configuration
const CACHE_MAX_AGE = 300; // 5 minutes

// Prediction logging configuration
const ENABLE_PREDICTION_LOGGING = process.env.ENABLE_PREDICTION_LOGGING === 'true';

/**
 * Log prediction snapshot for future learning analysis
 * Fire-and-forget: errors don't affect the main response
 */
async function logPredictionSnapshot(
  routeId: string,
  weather: WeatherSnapshot,
  tide: TideSwing | undefined,
  riskScore: ReturnType<typeof calculateRiskScore>,
  riskLevel: ReturnType<typeof getRiskLevel>,
  modelVersion: string
): Promise<void> {
  if (!ENABLE_PREDICTION_LOGGING) return;

  try {
    const exposureVersion = isUsingV2Algorithm() ? '2' : '1';
    const windDirBucket = degreesToCompassBucket(weather.wind_direction);
    const exposureModifier = calculateExposureModifier(routeId, weather.wind_direction);

    await fetch(new URL('/api/predictions/snapshot', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route_id: routeId,
        forecast_for_time: weather.timestamp,
        predicted_score: riskScore.score,
        predicted_risk_level: riskLevel.level,
        predicted_confidence: riskScore.confidence,
        factors: riskScore.factors,
        weather_input: weather,
        tide_input: tide,
        exposure_version: exposureVersion,
        exposure_modifier: exposureModifier,
        wind_direction_bucket: windDirBucket,
        model_version: modelVersion,
      }),
    });
  } catch (error) {
    // Silently fail - logging should never affect main response
    console.warn('Failed to log prediction snapshot:', error);
  }
}

interface RouteParams {
  params: Promise<{
    routeId: string;
  }>;
}

interface DataFetchResult {
  weather: WeatherSnapshot[] | null;
  weatherError: string | null;
  advisoryLevel: AdvisoryLevel;
  advisoryError: string | null;
  tideSwing: TideSwing | null;
  tideError: string | null;
  operatorStatus: OperatorStatusResult | null;
  dataSources: string[];
}

/**
 * Fetch all required data from external sources
 * Returns structured result with data or errors for each source
 */
async function fetchAllData(
  originPortSlug: string,
  regionSlug: string,
  routeId: string
): Promise<DataFetchResult> {
  const result: DataFetchResult = {
    weather: null,
    weatherError: null,
    advisoryLevel: 'none',
    advisoryError: null,
    tideSwing: null,
    tideError: null,
    operatorStatus: null,
    dataSources: [],
  };

  // Fetch weather, alerts, tides, and operator status in parallel
  const [weatherResult, alertResult, tideResult, operatorResult] = await Promise.allSettled([
    fetchHourlyForecast(originPortSlug, regionSlug, 24),
    getActiveAdvisoryLevel(originPortSlug, regionSlug),
    hasTideStation(originPortSlug)
      ? getCurrentTideSwing(originPortSlug)
      : Promise.resolve(null),
    getOperatorStatus(routeId),
  ]);

  // Process weather result
  if (weatherResult.status === 'fulfilled') {
    result.weather = weatherResult.value;
    result.dataSources.push('NOAA Weather API');
  } else {
    const error = weatherResult.reason;
    if (error instanceof WeatherFetchError) {
      result.weatherError = `${error.code}: ${error.message}`;
    } else {
      result.weatherError = error?.message || 'Unknown weather fetch error';
    }
    console.error('Weather fetch failed:', result.weatherError);
  }

  // Process alert result
  if (alertResult.status === 'fulfilled') {
    result.advisoryLevel = alertResult.value.level;
    result.dataSources.push('NWS Alerts API');
  } else {
    const error = alertResult.reason;
    if (error instanceof AlertFetchError) {
      result.advisoryError = `${error.code}: ${error.message}`;
    } else {
      result.advisoryError = error?.message || 'Unknown alert fetch error';
    }
    console.error('Alert fetch failed:', result.advisoryError);
  }

  // Process tide result
  if (tideResult.status === 'fulfilled') {
    result.tideSwing = tideResult.value;
    if (tideResult.value) {
      result.dataSources.push('NOAA CO-OPS Tides');
    }
  } else {
    const error = tideResult.reason;
    if (error instanceof TideFetchError) {
      result.tideError = `${error.code}: ${error.message}`;
    } else {
      result.tideError = error?.message || 'Unknown tide fetch error';
    }
    console.error('Tide fetch failed:', result.tideError);
  }

  // Process operator status result (best effort - never fails the request)
  if (operatorResult.status === 'fulfilled') {
    result.operatorStatus = operatorResult.value;
    if (operatorResult.value.source) {
      result.dataSources.push(`${operatorResult.value.source} (status)`);
    }
  }

  return result;
}


/**
 * GET /api/forecast/route/:routeId
 *
 * Returns forecast data for a specific route.
 * Fetches real data from NOAA, NWS, and NOAA CO-OPS.
 * Returns error state if critical data is unavailable.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { routeId } = await params;

  // Try to get route from Supabase first, fall back to static config
  let route: FerryRoute | null = null;
  let originPortSlug: string | undefined;
  let regionSlug = 'cape-cod-islands'; // Default region

  const supabaseResult = await fetchRouteBySlug(routeId);
  if (supabaseResult.data) {
    route = {
      route_id: supabaseResult.data.route_slug,
      region: supabaseResult.data.region_slug,
      origin_port: supabaseResult.data.origin_port_slug,
      destination_port: supabaseResult.data.destination_port_slug,
      operator: supabaseResult.data.operator_slug,
      crossing_type: supabaseResult.data.crossing_type as 'open_water' | 'protected' | 'mixed',
      bearing_degrees: supabaseResult.data.bearing_degrees,
      active: supabaseResult.data.route_active,
    };
    originPortSlug = supabaseResult.data.origin_port_slug;
    regionSlug = supabaseResult.data.region_slug;
  } else {
    // Fall back to static config
    const staticRoute = getRouteById(routeId);
    route = staticRoute || null;
    originPortSlug = staticRoute?.origin_port;
  }

  if (!route) {
    return NextResponse.json(
      {
        error: 'Route not found',
        message: `No route exists with ID: ${routeId}`,
        timestamp: new Date().toISOString(),
      },
      { status: 404 }
    );
  }

  // Fetch real data from external APIs (weather-only MVP - no vessel data)
  const data = await fetchAllData(originPortSlug || route.origin_port, regionSlug, route.route_id);

  // If weather data is unavailable, we cannot calculate a forecast
  if (!data.weather || data.weather.length === 0) {
    return NextResponse.json(
      {
        error: 'WEATHER_DATA_UNAVAILABLE',
        message: 'Unable to fetch weather data from NOAA. Cannot calculate forecast.',
        details: data.weatherError,
        route,
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache',
          'Retry-After': '60',
        },
      }
    );
  }

  // Get current weather (first hour)
  const currentWeather = data.weather[0];

  // Apply advisory level from NWS alerts (overrides weather-parsed level)
  const weatherWithAdvisory: WeatherSnapshot = {
    ...currentWeather,
    advisory_level: data.advisoryLevel !== 'none' ? data.advisoryLevel : currentWeather.advisory_level,
  };

  // Calculate risk score using WEATHER-ONLY model
  // Inputs: wind speed, gusts, wind direction, advisory level, tide swing, route exposure
  // NO vessel thresholds - MVP uses fixed thresholds based on route type
  const scoringInput: ScoringInput = {
    route,
    weather: weatherWithAdvisory,
    tide: data.tideSwing || undefined,
    dataPointCount: data.dataSources.length,
  };

  const riskScore = calculateRiskScore(scoringInput);
  const riskLevel = getRiskLevel(riskScore.score);

  // Build hourly forecast with risk scores (weather-only)
  const hourlyForecast: HourlyForecast[] = data.weather.slice(0, 24).map((hourWeather) => {
    // Apply advisory level to each hour
    const hourWithAdvisory: WeatherSnapshot = {
      ...hourWeather,
      advisory_level: data.advisoryLevel !== 'none' ? data.advisoryLevel : hourWeather.advisory_level,
    };

    const hourInput: ScoringInput = {
      route,
      weather: hourWithAdvisory,
      tide: data.tideSwing || undefined,
      dataPointCount: data.dataSources.length,
    };

    const hourRisk = calculateRiskScore(hourInput);

    return {
      hour: hourWeather.timestamp,
      score: hourRisk.score,
      confidence: hourRisk.confidence,
      weather: hourWithAdvisory,
      factors: hourRisk.factors,
    };
  });

  // Build response (weather-only MVP - no vessel data)
  const response: ForecastResponse = {
    route,
    current_conditions: {
      weather: weatherWithAdvisory,
      tide: data.tideSwing || undefined,
    },
    current_risk: riskScore,
    hourly_forecast: hourlyForecast,
    official_status: {
      status: data.operatorStatus?.status || 'unknown',
      source: data.operatorStatus?.source || null,
      updated_at: data.operatorStatus?.updated_at || null,
      message: data.operatorStatus?.message || data.operatorStatus?.fetchError || undefined,
    },
    metadata: {
      generated_at: new Date().toISOString(),
      cache_expires_at: new Date(Date.now() + CACHE_MAX_AGE * 1000).toISOString(),
      data_sources: data.dataSources,
      warnings: [
        ...(data.advisoryError ? [`Advisory fetch: ${data.advisoryError}`] : []),
        ...(data.tideError ? [`Tide data: ${data.tideError}`] : []),
      ],
    },
  };

  // Log prediction snapshot for future learning analysis (fire-and-forget)
  logPredictionSnapshot(
    route.route_id,
    weatherWithAdvisory,
    data.tideSwing || undefined,
    riskScore,
    riskLevel,
    riskScore.model_version
  );

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=60`,
      'X-Ferry-Forecast-Risk': riskLevel.level,
      'X-Ferry-Forecast-Score': String(riskScore.score),
    },
  });
}
