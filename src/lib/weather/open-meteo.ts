/**
 * Open-Meteo Forecast Integration
 *
 * Phase 32: Forecast Modeling
 *
 * Fetches multi-day weather forecasts from Open-Meteo API:
 * - GFS model: 0-7 days (hourly, higher resolution)
 * - ECMWF model: 0-14 days (ensemble, better for extended forecasts)
 *
 * Open-Meteo is free, no API key required, and provides excellent coverage.
 * Documentation: https://open-meteo.com/en/docs
 */

import { createServerClient } from '@/lib/supabase/client';
import { getCorridorCoordinates, getRegisteredCorridorIds } from '@/lib/corridors/registry';

// Open-Meteo API endpoint
const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';

// Request timeout
const REQUEST_TIMEOUT = 15000;

// Types for Open-Meteo responses
interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly: {
    time: string[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wind_gusts_10m?: number[];
    temperature_2m?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
    visibility?: number[];
  };
}

interface OpenMeteoMarineResponse {
  latitude: number;
  longitude: number;
  hourly: {
    time: string[];
    wave_height?: number[];
    wave_period?: number[];
    wave_direction?: number[];
  };
}

// Types for our forecast data
export interface ForecastHour {
  forecastTime: string;           // ISO timestamp
  model: 'gfs' | 'ecmwf';
  windSpeed10mMph: number | null;
  windGustsMph: number | null;
  windDirectionDeg: number | null;
  waveHeightFt: number | null;
  wavePeriodSec: number | null;
  waveDirectionDeg: number | null;
  visibilityMiles: number | null;
  precipitationMm: number | null;
  precipitationProbability: number | null;
  temperatureF: number | null;
  advisoryLevel: string | null;
}

export interface CorridorForecast {
  corridorId: string;
  fetchedAt: string;
  modelRunTime: string | null;
  hours: ForecastHour[];
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, timeoutMs: number = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Convert m/s to mph
 */
function msToMph(ms: number | undefined | null): number | null {
  if (ms === undefined || ms === null) return null;
  return Math.round(ms * 2.237 * 10) / 10;
}

/**
 * Convert meters to feet
 */
function metersToFeet(m: number | undefined | null): number | null {
  if (m === undefined || m === null) return null;
  return Math.round(m * 3.281 * 10) / 10;
}

/**
 * Convert meters to miles (for visibility)
 */
function metersToMiles(m: number | undefined | null): number | null {
  if (m === undefined || m === null) return null;
  return Math.round(m * 0.000621371 * 10) / 10;
}

/**
 * Convert Celsius to Fahrenheit
 */
function celsiusToFahrenheit(c: number | undefined | null): number | null {
  if (c === undefined || c === null) return null;
  return Math.round((c * 9 / 5 + 32) * 10) / 10;
}

/**
 * Derive advisory level from wind conditions
 * Based on NWS marine advisory thresholds
 */
function deriveAdvisoryLevel(windSpeedMph: number | null, windGustsMph: number | null): string {
  const effectiveWind = Math.max(windSpeedMph || 0, (windGustsMph || 0) * 0.8);

  if (effectiveWind >= 64) return 'hurricane_warning';
  if (effectiveWind >= 48) return 'storm_warning';
  if (effectiveWind >= 34) return 'gale_warning';
  if (effectiveWind >= 20) return 'small_craft_advisory';
  return 'none';
}

/**
 * Fetch GFS forecast from Open-Meteo (0-7 days, hourly)
 */
async function fetchGFSForecast(lat: number, lon: number): Promise<ForecastHour[]> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation,precipitation_probability,visibility',
    wind_speed_unit: 'ms',
    timezone: 'UTC',
    forecast_days: '7',
    models: 'gfs_seamless',
  });

  const url = `${OPEN_METEO_API}?${params}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`GFS API error: ${response.status} ${response.statusText}`);
  }

  const data: OpenMeteoResponse = await response.json();
  const hours: ForecastHour[] = [];

  const times = data.hourly?.time || [];
  for (let i = 0; i < times.length; i++) {
    const windSpeedMph = msToMph(data.hourly.wind_speed_10m?.[i]);
    const windGustsMph = msToMph(data.hourly.wind_gusts_10m?.[i]);

    hours.push({
      forecastTime: times[i],
      model: 'gfs',
      windSpeed10mMph: windSpeedMph,
      windGustsMph: windGustsMph,
      windDirectionDeg: data.hourly.wind_direction_10m?.[i] ?? null,
      waveHeightFt: null,  // Will be filled from marine API
      wavePeriodSec: null,
      waveDirectionDeg: null,
      visibilityMiles: metersToMiles(data.hourly.visibility?.[i]),
      precipitationMm: data.hourly.precipitation?.[i] ?? null,
      precipitationProbability: data.hourly.precipitation_probability?.[i] ?? null,
      temperatureF: celsiusToFahrenheit(data.hourly.temperature_2m?.[i]),
      advisoryLevel: deriveAdvisoryLevel(windSpeedMph, windGustsMph),
    });
  }

  return hours;
}

/**
 * Fetch ECMWF forecast from Open-Meteo (0-14 days)
 */
async function fetchECMWFForecast(lat: number, lon: number): Promise<ForecastHour[]> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation',
    wind_speed_unit: 'ms',
    timezone: 'UTC',
    forecast_days: '14',
    models: 'ecmwf_ifs04',
  });

  const url = `${OPEN_METEO_API}?${params}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`ECMWF API error: ${response.status} ${response.statusText}`);
  }

  const data: OpenMeteoResponse = await response.json();
  const hours: ForecastHour[] = [];

  const times = data.hourly?.time || [];
  for (let i = 0; i < times.length; i++) {
    const windSpeedMph = msToMph(data.hourly.wind_speed_10m?.[i]);
    const windGustsMph = msToMph(data.hourly.wind_gusts_10m?.[i]);

    hours.push({
      forecastTime: times[i],
      model: 'ecmwf',
      windSpeed10mMph: windSpeedMph,
      windGustsMph: windGustsMph,
      windDirectionDeg: data.hourly.wind_direction_10m?.[i] ?? null,
      waveHeightFt: null,
      wavePeriodSec: null,
      waveDirectionDeg: null,
      visibilityMiles: null,  // ECMWF doesn't include visibility
      precipitationMm: data.hourly.precipitation?.[i] ?? null,
      precipitationProbability: null,  // ECMWF uses different probability model
      temperatureF: celsiusToFahrenheit(data.hourly.temperature_2m?.[i]),
      advisoryLevel: deriveAdvisoryLevel(windSpeedMph, windGustsMph),
    });
  }

  return hours;
}

/**
 * Fetch marine forecast (wave data) from Open-Meteo
 */
async function fetchMarineForecast(lat: number, lon: number, days: number = 7): Promise<Map<string, Partial<ForecastHour>>> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wave_height,wave_period,wave_direction',
    length_unit: 'metric',
    timezone: 'UTC',
    forecast_days: days.toString(),
  });

  const url = `${OPEN_METEO_MARINE_API}?${params}`;

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      console.warn(`Marine API returned ${response.status}, skipping wave data`);
      return new Map();
    }

    const data: OpenMeteoMarineResponse = await response.json();
    const waveData = new Map<string, Partial<ForecastHour>>();

    const times = data.hourly?.time || [];
    for (let i = 0; i < times.length; i++) {
      waveData.set(times[i], {
        waveHeightFt: metersToFeet(data.hourly.wave_height?.[i]),
        wavePeriodSec: data.hourly.wave_period?.[i] ?? null,
        waveDirectionDeg: data.hourly.wave_direction?.[i] ?? null,
      });
    }

    return waveData;
  } catch (error) {
    console.warn('Marine forecast fetch failed:', error);
    return new Map();
  }
}

/**
 * Fetch complete forecast for a corridor
 *
 * Uses corridor coordinate registry for location lookup.
 * Logs explicitly when coordinates are resolved or missing.
 */
export async function fetchCorridorForecast(
  corridorId: string,
  model: 'gfs' | 'ecmwf' = 'gfs'
): Promise<CorridorForecast | null> {
  // Resolve coordinates from registry
  const coords = getCorridorCoordinates(corridorId);
  if (!coords) {
    console.warn(`[FORECAST] Skipping corridor ${corridorId} (no coordinates in registry)`);
    return null;
  }

  // Log successful coordinate resolution
  console.log(
    `[FORECAST] Using corridor ${corridorId} @ lat=${coords.lat.toFixed(4)}, lon=${coords.lon.toFixed(4)}`
  );

  const fetchedAt = new Date().toISOString();

  // Fetch weather forecast
  let hours: ForecastHour[];
  if (model === 'gfs') {
    hours = await fetchGFSForecast(coords.lat, coords.lon);
  } else {
    hours = await fetchECMWFForecast(coords.lat, coords.lon);
  }

  // Fetch marine forecast and merge wave data
  const days = model === 'gfs' ? 7 : 14;
  const waveData = await fetchMarineForecast(coords.lat, coords.lon, days);

  for (const hour of hours) {
    const wave = waveData.get(hour.forecastTime);
    if (wave) {
      hour.waveHeightFt = wave.waveHeightFt ?? null;
      hour.wavePeriodSec = wave.wavePeriodSec ?? null;
      hour.waveDirectionDeg = wave.waveDirectionDeg ?? null;
    }
  }

  return {
    corridorId,
    fetchedAt,
    modelRunTime: null,  // Open-Meteo doesn't expose model run time directly
    hours,
  };
}

/**
 * Fetch forecasts for all corridors
 *
 * Uses getRegisteredCorridorIds() from the coordinate registry as the
 * single source of truth for which corridors to fetch.
 *
 * IMPORTANT: This function only fetches corridors that have coordinates
 * registered. If a corridor is not in the registry, it will not be fetched.
 */
export async function fetchAllCorridorForecasts(
  model: 'gfs' | 'ecmwf' = 'gfs'
): Promise<CorridorForecast[]> {
  // Use registry as the ONLY source of corridor IDs
  const corridorIds = getRegisteredCorridorIds();

  // Log registered corridors for debugging
  console.log(`[FORECAST] Registered corridors: [${corridorIds.join(', ')}]`);

  const forecasts: CorridorForecast[] = [];

  for (const corridorId of corridorIds) {
    try {
      console.log(`[FORECAST] Fetching corridor ${corridorId}...`);
      const forecast = await fetchCorridorForecast(corridorId, model);
      // Skip corridors without coordinates (null returned)
      if (forecast) {
        forecasts.push(forecast);
      }
    } catch (error) {
      console.error(`[FORECAST] Failed to fetch forecast for ${corridorId}:`, error);
    }
  }

  return forecasts;
}

/**
 * Persist forecast data to Supabase
 */
export async function persistForecastSnapshots(forecast: CorridorForecast): Promise<number> {
  const supabase = createServerClient();
  if (!supabase) {
    console.error('[FORECAST] Supabase client is null');
    return 0;
  }

  const fetchedAt = forecast.fetchedAt;
  let insertedCount = 0;

  // Insert in batches of 100 to avoid hitting limits
  const batchSize = 100;
  for (let i = 0; i < forecast.hours.length; i += batchSize) {
    const batch = forecast.hours.slice(i, i + batchSize);

    const records = batch.map((hour) => ({
      corridor_id: forecast.corridorId,
      forecast_time: hour.forecastTime,
      fetched_at: fetchedAt,
      model: hour.model,
      model_run_time: forecast.modelRunTime,
      wind_speed_10m_mph: hour.windSpeed10mMph,
      wind_gusts_mph: hour.windGustsMph,
      wind_direction_deg: hour.windDirectionDeg,
      wave_height_ft: hour.waveHeightFt,
      wave_period_sec: hour.wavePeriodSec,
      wave_direction_deg: hour.waveDirectionDeg,
      visibility_miles: hour.visibilityMiles,
      precipitation_mm: hour.precipitationMm,
      precipitation_probability: hour.precipitationProbability,
      temperature_f: hour.temperatureF,
      advisory_level: hour.advisoryLevel,
    }));

    const { error } = await supabase
      .from('forecast_weather_snapshots')
      .insert(records);

    if (error) {
      console.error('[FORECAST] Insert error:', error);
    } else {
      insertedCount += records.length;
    }
  }

  return insertedCount;
}

/**
 * Ingest forecasts for all corridors and persist to database
 *
 * FAIL LOUDLY: Throws if zero corridors are registered.
 * This is a configuration error that must be fixed.
 */
export async function ingestAllForecasts(): Promise<{
  gfs: { corridors: number; hours: number };
  ecmwf: { corridors: number; hours: number };
}> {
  // FAIL LOUDLY: Check registry has corridors BEFORE any fetching
  const registeredCorridors = getRegisteredCorridorIds();
  if (registeredCorridors.length === 0) {
    const errorMsg =
      '[FORECAST] FATAL: Zero corridors registered in coordinate registry. ' +
      'Check src/lib/corridors/registry.ts - CORRIDOR_REGISTRY is empty or not exporting correctly.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log(
    `[FORECAST] Starting ingestion for ${registeredCorridors.length} corridors: [${registeredCorridors.join(', ')}]`
  );

  const results = {
    gfs: { corridors: 0, hours: 0 },
    ecmwf: { corridors: 0, hours: 0 },
  };

  // Fetch and persist GFS forecasts
  console.log('[FORECAST] Ingesting GFS forecasts...');
  const gfsForecasts = await fetchAllCorridorForecasts('gfs');

  // FAIL LOUDLY: If we had registered corridors but got zero forecasts, something is wrong
  if (gfsForecasts.length === 0) {
    const errorMsg =
      `[FORECAST] FATAL: Zero GFS forecasts returned despite ${registeredCorridors.length} registered corridors. ` +
      'All coordinate lookups failed or API calls failed.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  for (const forecast of gfsForecasts) {
    const count = await persistForecastSnapshots(forecast);
    if (count > 0) {
      results.gfs.corridors++;
      results.gfs.hours += count;
    }
  }

  // Fetch and persist ECMWF forecasts
  console.log('[FORECAST] Ingesting ECMWF forecasts...');
  const ecmwfForecasts = await fetchAllCorridorForecasts('ecmwf');

  // FAIL LOUDLY: If we had registered corridors but got zero forecasts, something is wrong
  if (ecmwfForecasts.length === 0) {
    const errorMsg =
      `[FORECAST] FATAL: Zero ECMWF forecasts returned despite ${registeredCorridors.length} registered corridors. ` +
      'All coordinate lookups failed or API calls failed.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  for (const forecast of ecmwfForecasts) {
    const count = await persistForecastSnapshots(forecast);
    if (count > 0) {
      results.ecmwf.corridors++;
      results.ecmwf.hours += count;
    }
  }

  console.log(`[FORECAST] Ingestion complete: GFS ${results.gfs.corridors} corridors/${results.gfs.hours} hours, ECMWF ${results.ecmwf.corridors} corridors/${results.ecmwf.hours} hours`);
  return results;
}

/**
 * Get latest forecast for a corridor at a specific time
 */
export async function getLatestForecast(
  corridorId: string,
  forecastTime: Date,
  model?: 'gfs' | 'ecmwf'
): Promise<ForecastHour | null> {
  const supabase = createServerClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from('forecast_weather_snapshots')
    .select('*')
    .eq('corridor_id', corridorId)
    .eq('forecast_time', forecastTime.toISOString())
    .order('fetched_at', { ascending: false })
    .limit(1);

  if (model) {
    query = query.eq('model', model);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return null;
  }

  const row = data[0];
  return {
    forecastTime: row.forecast_time,
    model: row.model as 'gfs' | 'ecmwf',
    windSpeed10mMph: row.wind_speed_10m_mph,
    windGustsMph: row.wind_gusts_mph,
    windDirectionDeg: row.wind_direction_deg,
    waveHeightFt: row.wave_height_ft,
    wavePeriodSec: row.wave_period_sec,
    waveDirectionDeg: row.wave_direction_deg,
    visibilityMiles: row.visibility_miles,
    precipitationMm: row.precipitation_mm,
    precipitationProbability: row.precipitation_probability,
    temperatureF: row.temperature_f,
    advisoryLevel: row.advisory_level,
  };
}

/**
 * Get forecast range for a corridor
 */
export async function getForecastRange(
  corridorId: string,
  startTime: Date,
  endTime: Date,
  model?: 'gfs' | 'ecmwf'
): Promise<ForecastHour[]> {
  const supabase = createServerClient();
  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('latest_forecasts')  // Use the view for latest data
    .select('*')
    .eq('corridor_id', corridorId)
    .gte('forecast_time', startTime.toISOString())
    .lte('forecast_time', endTime.toISOString())
    .order('forecast_time', { ascending: true });

  if (model) {
    query = query.eq('model', model);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    forecastTime: row.forecast_time,
    model: row.model as 'gfs' | 'ecmwf',
    windSpeed10mMph: row.wind_speed_10m_mph,
    windGustsMph: row.wind_gusts_mph,
    windDirectionDeg: row.wind_direction_deg,
    waveHeightFt: row.wave_height_ft,
    wavePeriodSec: row.wave_period_sec,
    waveDirectionDeg: row.wave_direction_deg,
    visibilityMiles: row.visibility_miles,
    precipitationMm: row.precipitation_mm,
    precipitationProbability: row.precipitation_probability,
    temperatureF: row.temperature_f,
    advisoryLevel: row.advisory_level,
  }));
}
