// NOAA Marine Forecast Integration
// Fetches real marine weather data from NOAA Weather API
// Documentation: https://www.weather.gov/documentation/services-web-api

import type { WeatherSnapshot, AdvisoryLevel } from '@/types/forecast';

const NOAA_API_BASE = 'https://api.weather.gov';
const USER_AGENT = 'FerryForecast/1.0 (github.com/ferryforecast)';

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 10000;

// In-memory cache for weather data
interface CacheEntry {
  data: WeatherSnapshot[];
  timestamp: number;
  expiresAt: number;
}

const weatherCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for weather data

// Port coordinates for Cape Cod & Islands
// These are used to fetch localized forecasts
const PORT_COORDINATES: Record<string, { lat: number; lon: number }> = {
  'woods-hole': { lat: 41.5234, lon: -70.6693 },
  'hyannis': { lat: 41.6362, lon: -70.2826 },
  'vineyard-haven': { lat: 41.4535, lon: -70.6036 },
  'oak-bluffs': { lat: 41.4571, lon: -70.5566 },
  'nantucket': { lat: 41.2835, lon: -70.0995 },
};

// Region center point (used when port not specified)
const REGION_COORDINATES: Record<string, { lat: number; lon: number }> = {
  'cape-cod-islands': { lat: 41.5234, lon: -70.6693 }, // Woods Hole as default
};

// NOAA API Response Types
interface NOAAPointProperties {
  forecast: string;
  forecastHourly: string;
  forecastGridData: string;
  gridId: string;
  gridX: number;
  gridY: number;
}

interface NOAAPointResponse {
  properties: NOAAPointProperties;
}

interface NOAAForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
}

interface NOAAForecastResponse {
  properties: {
    updated: string;
    units: string;
    periods: NOAAForecastPeriod[];
  };
}

// Custom error class for weather fetching
export class WeatherFetchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'WeatherFetchError';
  }
}

/**
 * Parse wind speed from NOAA format
 * Examples: "15 mph", "10 to 20 mph", "15 mph with gusts up to 25 mph"
 */
function parseWindSpeed(windStr: string): { speed: number; gusts: number } {
  if (!windStr) {
    return { speed: 0, gusts: 0 };
  }

  // Check for gusts first
  const gustMatch = windStr.match(/gusts?\s+(?:up\s+to\s+)?(\d+)/i);
  const gusts = gustMatch ? parseInt(gustMatch[1], 10) : 0;

  // Check for range (e.g., "10 to 20 mph")
  const rangeMatch = windStr.match(/(\d+)\s*to\s*(\d+)/);
  if (rangeMatch) {
    // Use the high end of the range as the sustained wind (index 2)
    const high = parseInt(rangeMatch[2], 10);
    return {
      speed: high,
      gusts: gusts > 0 ? gusts : Math.round(high * 1.25) // Estimate gusts at 25% over sustained if not provided
    };
  }

  // Single value (e.g., "15 mph")
  const singleMatch = windStr.match(/(\d+)\s*mph/i);
  if (singleMatch) {
    const speed = parseInt(singleMatch[1], 10);
    return {
      speed,
      gusts: gusts > 0 ? gusts : speed // If no gusts mentioned, assume gusts = sustained
    };
  }

  return { speed: 0, gusts: 0 };
}

/**
 * Parse wind direction from cardinal/intercardinal format to degrees
 */
function parseWindDirection(dirStr: string): number {
  if (!dirStr) {
    return 0;
  }

  const directions: Record<string, number> = {
    'N': 0,
    'NNE': 22.5,
    'NE': 45,
    'ENE': 67.5,
    'E': 90,
    'ESE': 112.5,
    'SE': 135,
    'SSE': 157.5,
    'S': 180,
    'SSW': 202.5,
    'SW': 225,
    'WSW': 247.5,
    'W': 270,
    'WNW': 292.5,
    'NW': 315,
    'NNW': 337.5,
  };

  const dir = dirStr.toUpperCase().trim();
  return directions[dir] ?? 0;
}

/**
 * Parse advisory level from forecast text
 * Note: This is supplemented by NWS alerts API for official advisories
 */
function parseAdvisoryFromForecast(forecast: string): AdvisoryLevel {
  if (!forecast) {
    return 'none';
  }

  const lower = forecast.toLowerCase();

  if (lower.includes('hurricane warning') || lower.includes('hurricane force')) {
    return 'hurricane_warning';
  }
  if (lower.includes('storm warning') || lower.includes('tropical storm')) {
    return 'storm_warning';
  }
  if (lower.includes('gale warning') || lower.includes('gale force')) {
    return 'gale_warning';
  }
  if (
    lower.includes('small craft advisory') ||
    lower.includes('small craft') ||
    lower.includes('hazardous seas')
  ) {
    return 'small_craft_advisory';
  }

  return 'none';
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new WeatherFetchError(
        `Request timeout after ${timeoutMs}ms`,
        'TIMEOUT',
        true
      );
    }
    throw error;
  }
}

/**
 * Get the NOAA point metadata for coordinates
 */
async function getPointMetadata(
  lat: number,
  lon: number
): Promise<NOAAPointProperties> {
  const url = `${NOAA_API_BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/geo+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new WeatherFetchError(
        `Location not covered by NOAA: ${lat}, ${lon}`,
        'LOCATION_NOT_COVERED',
        false
      );
    }
    if (response.status >= 500) {
      throw new WeatherFetchError(
        `NOAA API server error: ${response.status}`,
        'SERVER_ERROR',
        true
      );
    }
    throw new WeatherFetchError(
      `NOAA API error: ${response.status} ${response.statusText}`,
      'API_ERROR',
      response.status >= 500
    );
  }

  const data: NOAAPointResponse = await response.json();
  return data.properties;
}

/**
 * Fetch hourly forecast from NOAA
 */
async function fetchNOAAHourlyForecast(
  forecastUrl: string
): Promise<NOAAForecastPeriod[]> {
  const response = await fetchWithTimeout(forecastUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/geo+json',
    },
  });

  if (!response.ok) {
    if (response.status >= 500) {
      throw new WeatherFetchError(
        `NOAA forecast API server error: ${response.status}`,
        'SERVER_ERROR',
        true
      );
    }
    throw new WeatherFetchError(
      `NOAA forecast API error: ${response.status} ${response.statusText}`,
      'FORECAST_ERROR',
      response.status >= 500
    );
  }

  const data: NOAAForecastResponse = await response.json();

  if (!data.properties?.periods || data.properties.periods.length === 0) {
    throw new WeatherFetchError(
      'NOAA returned empty forecast periods',
      'EMPTY_FORECAST',
      true
    );
  }

  return data.properties.periods;
}

/**
 * Convert NOAA period to WeatherSnapshot
 */
function periodToSnapshot(period: NOAAForecastPeriod): WeatherSnapshot {
  const wind = parseWindSpeed(period.windSpeed);

  return {
    wind_speed: wind.speed,
    wind_gusts: wind.gusts,
    wind_direction: parseWindDirection(period.windDirection),
    advisory_level: parseAdvisoryFromForecast(period.detailedForecast),
    timestamp: period.startTime,
  };
}

/**
 * Get coordinates for a port or region
 */
function getCoordinates(portSlug?: string, regionSlug?: string): { lat: number; lon: number } {
  if (portSlug && PORT_COORDINATES[portSlug]) {
    return PORT_COORDINATES[portSlug];
  }
  if (regionSlug && REGION_COORDINATES[regionSlug]) {
    return REGION_COORDINATES[regionSlug];
  }
  // Default to Woods Hole
  return PORT_COORDINATES['woods-hole'];
}

/**
 * Get cache key for a location
 */
function getCacheKey(portSlug?: string, regionSlug?: string): string {
  return `weather:${portSlug || regionSlug || 'default'}`;
}

/**
 * Fetch current weather conditions
 * Throws WeatherFetchError if data cannot be fetched
 */
export async function fetchCurrentWeather(
  portSlug?: string,
  regionSlug?: string
): Promise<WeatherSnapshot> {
  const forecasts = await fetchHourlyForecast(portSlug, regionSlug, 1);

  if (forecasts.length === 0) {
    throw new WeatherFetchError(
      'No current weather data available',
      'NO_DATA',
      true
    );
  }

  return forecasts[0];
}

/**
 * Fetch hourly forecast from NOAA
 * Uses caching to reduce API calls
 * Throws WeatherFetchError if data cannot be fetched
 */
export async function fetchHourlyForecast(
  portSlug?: string,
  regionSlug?: string,
  hours: number = 24
): Promise<WeatherSnapshot[]> {
  const cacheKey = getCacheKey(portSlug, regionSlug);
  const now = Date.now();

  // Check cache first
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data.slice(0, hours);
  }

  // Fetch fresh data
  const coords = getCoordinates(portSlug, regionSlug);

  try {
    // Step 1: Get the forecast URL for this location
    const pointMeta = await getPointMetadata(coords.lat, coords.lon);

    // Step 2: Fetch the hourly forecast
    const periods = await fetchNOAAHourlyForecast(pointMeta.forecastHourly);

    // Step 3: Convert to WeatherSnapshot format
    const snapshots = periods.map(periodToSnapshot);

    // Step 4: Cache the results
    weatherCache.set(cacheKey, {
      data: snapshots,
      timestamp: now,
      expiresAt: now + CACHE_TTL_MS,
    });

    return snapshots.slice(0, hours);
  } catch (error) {
    // If we have stale cache data and the fetch failed, use stale data
    if (cached && error instanceof WeatherFetchError && error.retryable) {
      console.warn(`Using stale cache for ${cacheKey} due to fetch error:`, error.message);
      return cached.data.slice(0, hours);
    }

    // Re-throw the error
    if (error instanceof WeatherFetchError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new WeatherFetchError(
        `Failed to fetch weather: ${error.message}`,
        'FETCH_ERROR',
        true
      );
    }
    throw new WeatherFetchError(
      'Failed to fetch weather: Unknown error',
      'UNKNOWN_ERROR',
      true
    );
  }
}

/**
 * Clear the weather cache (for testing or forced refresh)
 */
export function clearWeatherCache(): void {
  weatherCache.clear();
}

/**
 * Get cache stats (for monitoring)
 */
export function getWeatherCacheStats(): { size: number; keys: string[] } {
  return {
    size: weatherCache.size,
    keys: Array.from(weatherCache.keys()),
  };
}
