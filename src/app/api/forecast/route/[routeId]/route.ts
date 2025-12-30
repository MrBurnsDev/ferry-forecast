import { NextRequest, NextResponse } from 'next/server';
import { getRouteById } from '@/lib/config/routes';
import { fetchRouteBySlug, fetchVesselsForRoute, type DbVessel, type DbVesselThreshold } from '@/lib/supabase/queries';
import { fetchHourlyForecast, WeatherFetchError } from '@/lib/weather/noaa';
import { getActiveAdvisoryLevel, AlertFetchError } from '@/lib/weather/nws';
import { getCurrentTideSwing, TideFetchError, hasTideStation } from '@/lib/tides/noaaCoops';
import { getOperatorStatus, type OperatorStatusResult } from '@/lib/operators';
import { calculateRiskScore, getRiskLevel, type ScoringInput } from '@/lib/scoring/score';
import type {
  ForecastResponse,
  WeatherSnapshot,
  FerryRoute,
  AdvisoryLevel,
  TideSwing,
  HourlyForecast,
  Vessel,
  VesselThreshold,
  VesselScoringMetadata,
  ThresholdSource,
  VesselClass,
} from '@/types/forecast';

// Cache configuration
const CACHE_MAX_AGE = 300; // 5 minutes

interface RouteParams {
  params: Promise<{
    routeId: string;
  }>;
}

// Result of vessel selection for scoring
interface VesselSelectionResult {
  vessel: Vessel | null;
  vesselThreshold: VesselThreshold | null;
  thresholdSource: ThresholdSource;
  vesselClass: VesselClass | null;
}

/**
 * Select the most conservative vessel for scoring
 * Strategy: Pick the vessel with the lowest wind_limit (most sensitive to conditions)
 * This ensures predictions err on the side of caution
 */
function selectMostConservativeVessel(
  vessels: (DbVessel & { is_primary: boolean; threshold?: DbVesselThreshold })[]
): VesselSelectionResult {
  if (!vessels || vessels.length === 0) {
    return {
      vessel: null,
      vesselThreshold: null,
      thresholdSource: 'operator',
      vesselClass: null,
    };
  }

  // Sort by conservativeness:
  // 1. Vessels with thresholds, sorted by lowest wind_limit
  // 2. Primary vessels preferred when thresholds are equal
  // 3. Fall back to vessel class defaults
  const sortedVessels = [...vessels].sort((a, b) => {
    // Both have thresholds - compare wind limits (lower = more conservative)
    if (a.threshold && b.threshold) {
      const windDiff = a.threshold.wind_limit_mph - b.threshold.wind_limit_mph;
      if (windDiff !== 0) return windDiff;
      // Same wind limit - prefer primary
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return 0;
    }
    // Only one has threshold - prefer the one with threshold
    if (a.threshold && !b.threshold) return -1;
    if (!a.threshold && b.threshold) return 1;
    // Neither has threshold - prefer primary
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return 0;
  });

  const selectedDbVessel = sortedVessels[0];
  const dbThreshold = selectedDbVessel.threshold;

  // Convert to API types
  const vessel: Vessel = {
    vessel_id: selectedDbVessel.vessel_id,
    name: selectedDbVessel.name,
    operator: selectedDbVessel.operator_id,
    vessel_class: selectedDbVessel.vessel_class,
    active: selectedDbVessel.active,
  };

  // Determine threshold source
  let thresholdSource: ThresholdSource = 'operator';
  let vesselThreshold: VesselThreshold | null = null;

  if (dbThreshold) {
    thresholdSource = 'vessel';
    vesselThreshold = {
      id: dbThreshold.threshold_id,
      vessel_id: dbThreshold.vessel_id,
      wind_limit: dbThreshold.wind_limit_mph,
      gust_limit: dbThreshold.gust_limit_mph,
      directional_sensitivity: dbThreshold.directional_sensitivity,
      advisory_sensitivity: dbThreshold.advisory_sensitivity,
    };
  } else {
    // No vessel-specific threshold, will use class defaults
    thresholdSource = 'class';
  }

  return {
    vessel,
    vesselThreshold,
    thresholdSource,
    vesselClass: selectedDbVessel.vessel_class,
  };
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

  // Load vessels for this route (if available from Supabase)
  // This is done separately from external data fetching as it's internal DB query
  let vesselSelection: VesselSelectionResult = {
    vessel: null,
    vesselThreshold: null,
    thresholdSource: 'operator',
    vesselClass: null,
  };

  if (supabaseResult.data) {
    // Route came from Supabase, try to load vessels
    const vesselsResult = await fetchVesselsForRoute(supabaseResult.data.route_id);
    if (vesselsResult.data && vesselsResult.data.length > 0) {
      vesselSelection = selectMostConservativeVessel(vesselsResult.data);
    }
  }

  // Fetch real data from external APIs
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

  // Calculate risk score with vessel-aware thresholds
  // dataPointCount is increased when we have vessel-specific data
  const baseDataPoints = data.dataSources.length;
  const vesselDataPoints = vesselSelection.thresholdSource === 'vessel' ? 2 :
                           vesselSelection.thresholdSource === 'class' ? 1 : 0;

  const scoringInput: ScoringInput = {
    route,
    vessel: vesselSelection.vessel || undefined,
    vesselThreshold: vesselSelection.vesselThreshold || undefined,
    weather: weatherWithAdvisory,
    tide: data.tideSwing || undefined,
    dataPointCount: baseDataPoints + vesselDataPoints,
  };

  const riskScore = calculateRiskScore(scoringInput);
  const riskLevel = getRiskLevel(riskScore.score);

  // Build hourly forecast with risk scores (using same vessel thresholds)
  const hourlyForecast: HourlyForecast[] = data.weather.slice(0, 24).map((hourWeather) => {
    // Apply advisory level to each hour
    const hourWithAdvisory: WeatherSnapshot = {
      ...hourWeather,
      advisory_level: data.advisoryLevel !== 'none' ? data.advisoryLevel : hourWeather.advisory_level,
    };

    const hourInput: ScoringInput = {
      route,
      vessel: vesselSelection.vessel || undefined,
      vesselThreshold: vesselSelection.vesselThreshold || undefined,
      weather: hourWithAdvisory,
      tide: data.tideSwing || undefined,
      dataPointCount: baseDataPoints + vesselDataPoints,
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

  // Build vessel scoring metadata
  const vesselScoringMetadata: VesselScoringMetadata = {
    vessel_used: vesselSelection.vessel?.name || null,
    vessel_class: vesselSelection.vesselClass,
    threshold_source: vesselSelection.thresholdSource,
  };

  // Build response
  const response: ForecastResponse = {
    route,
    vessel: vesselSelection.vessel || undefined,
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
    vessel_scoring: vesselScoringMetadata,
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

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=60`,
      'X-Ferry-Forecast-Risk': riskLevel.level,
      'X-Ferry-Forecast-Score': String(riskScore.score),
    },
  });
}
