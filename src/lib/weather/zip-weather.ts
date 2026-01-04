/**
 * Phase 56: ZIP-Based Local Weather Observations
 *
 * Fetches current weather observations using ZIP code → coordinates.
 * Uses Open-Meteo's current_weather endpoint for observation-like data.
 *
 * IMPORTANT: This is NOT forecast data. Open-Meteo's current_weather returns
 * the most recent observation-based conditions from their blended model.
 *
 * AUTHORITY LADDER:
 * 1. operator (highest) - SSA terminal-measured wind
 * 2. local_zip_observation - ZIP code-resolved current conditions (this module)
 * 3. unavailable - No data available
 */

// Terminal → ZIP code mapping (hardcoded per Phase 56 spec)
export const TERMINAL_ZIP_MAP: Record<string, string> = {
  'woods-hole': '02543',
  'vineyard-haven': '02568',
  'nantucket': '02554',
  'hyannis': '02601',
  'oak-bluffs': '02557',
};

// ZIP code → coordinates mapping (pre-resolved, no geocoding)
// These are town center coordinates for each ZIP
const ZIP_COORDINATES: Record<string, { lat: number; lon: number; town: string }> = {
  '02543': { lat: 41.5265, lon: -70.6714, town: 'Woods Hole' },
  '02568': { lat: 41.4537, lon: -70.5979, town: 'Vineyard Haven' },
  '02554': { lat: 41.2835, lon: -70.0995, town: 'Nantucket' },
  '02601': { lat: 41.6529, lon: -70.2850, town: 'Hyannis' },
  '02557': { lat: 41.4543, lon: -70.5622, town: 'Oak Bluffs' },
};

const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT = 10000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Open-Meteo current weather response structure
interface OpenMeteoCurrentResponse {
  latitude: number;
  longitude: number;
  current_weather: {
    time: string;
    temperature: number; // Celsius
    windspeed: number; // km/h
    winddirection: number; // degrees
    weathercode: number;
    is_day: number;
  };
}

// Our structured observation result
export interface LocalZipObservation {
  wind_speed_mph: number;
  wind_speed_kts: number;
  wind_direction_degrees: number;
  wind_direction_text: string;
  observed_at: string;
  zip_code: string;
  town_name: string;
  terminal_slug: string;
}

// In-memory cache
interface CacheEntry {
  data: LocalZipObservation;
  timestamp: number;
  expiresAt: number;
}

const observationCache = new Map<string, CacheEntry>();

/**
 * Convert km/h to mph
 */
function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371 * 10) / 10;
}

/**
 * Convert mph to knots
 */
function mphToKts(mph: number): number {
  return Math.round(mph * 0.868976 * 10) / 10;
}

/**
 * Convert degrees to compass direction
 */
function degreesToCompass(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
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
 * Fetch current weather observation for a terminal by ZIP code
 *
 * Uses Open-Meteo's current_weather parameter which returns
 * the most recent observation-based conditions.
 *
 * Returns null if:
 * - Terminal has no ZIP mapping
 * - ZIP has no coordinates
 * - API call fails
 * - Response is invalid
 */
export async function fetchZipWeather(terminalSlug: string): Promise<LocalZipObservation | null> {
  // Check cache first
  const cacheKey = `zip-weather:${terminalSlug}`;
  const now = Date.now();
  const cached = observationCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    console.log(`[ZIP_WEATHER] Cache hit for ${terminalSlug}`);
    return cached.data;
  }

  // Look up ZIP code for terminal
  const zipCode = TERMINAL_ZIP_MAP[terminalSlug];
  if (!zipCode) {
    console.warn(`[ZIP_WEATHER] No ZIP mapping for terminal: ${terminalSlug}`);
    return null;
  }

  // Look up coordinates for ZIP
  const coords = ZIP_COORDINATES[zipCode];
  if (!coords) {
    console.warn(`[ZIP_WEATHER] No coordinates for ZIP: ${zipCode}`);
    return null;
  }

  try {
    // Build Open-Meteo URL with current_weather parameter
    const params = new URLSearchParams({
      latitude: coords.lat.toString(),
      longitude: coords.lon.toString(),
      current_weather: 'true',
      timezone: 'America/New_York',
    });

    const url = `${OPEN_METEO_API}?${params}`;
    console.log(`[ZIP_WEATHER] Fetching for ${terminalSlug} (ZIP ${zipCode}) @ ${coords.lat},${coords.lon}`);

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      console.error(`[ZIP_WEATHER] API error for ${terminalSlug}: ${response.status}`);
      return null;
    }

    const data: OpenMeteoCurrentResponse = await response.json();

    if (!data.current_weather) {
      console.error(`[ZIP_WEATHER] No current_weather in response for ${terminalSlug}`);
      return null;
    }

    const cw = data.current_weather;
    const windSpeedMph = kmhToMph(cw.windspeed);

    const observation: LocalZipObservation = {
      wind_speed_mph: windSpeedMph,
      wind_speed_kts: mphToKts(windSpeedMph),
      wind_direction_degrees: cw.winddirection,
      wind_direction_text: degreesToCompass(cw.winddirection),
      observed_at: cw.time,
      zip_code: zipCode,
      town_name: coords.town,
      terminal_slug: terminalSlug,
    };

    // Cache the result
    observationCache.set(cacheKey, {
      data: observation,
      timestamp: now,
      expiresAt: now + CACHE_TTL_MS,
    });

    console.log(
      `[ZIP_WEATHER] Fetched for ${terminalSlug}: ` +
      `${observation.wind_direction_text} ${observation.wind_speed_mph} mph ` +
      `(${observation.wind_speed_kts} kt) @ ${observation.observed_at}`
    );

    return observation;
  } catch (error) {
    console.error(`[ZIP_WEATHER] Fetch failed for ${terminalSlug}:`, error);

    // Return stale cache if available
    if (cached) {
      console.warn(`[ZIP_WEATHER] Using stale cache for ${terminalSlug}`);
      return cached.data;
    }

    return null;
  }
}

/**
 * Clear the observation cache
 */
export function clearZipWeatherCache(): void {
  observationCache.clear();
}

/**
 * Get cache stats
 */
export function getZipWeatherCacheStats(): { size: number; keys: string[] } {
  return {
    size: observationCache.size,
    keys: Array.from(observationCache.keys()),
  };
}
