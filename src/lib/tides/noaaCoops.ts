// NOAA CO-OPS Tide Data Integration
// Fetches real tide predictions from NOAA Center for Operational Oceanographic Products and Services
// Documentation: https://api.tidesandcurrents.noaa.gov/api/prod/

import type { TideData, TideSwing } from '@/types/forecast';
import { format, addHours, parseISO } from 'date-fns';

const COOPS_API_BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const REQUEST_TIMEOUT = 15000; // 15 seconds - tide API can be slower

// In-memory cache for tide data
interface TideCacheEntry {
  data: TideData[];
  timestamp: number;
  expiresAt: number;
}

const tideCache = new Map<string, TideCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes for tide predictions (they don't change often)

// Custom error for tide fetching
export class TideFetchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'TideFetchError';
  }
}

// NOAA CO-OPS station IDs for Cape Cod & Islands
// Source: https://tidesandcurrents.noaa.gov/
const TIDE_STATIONS: Record<string, string> = {
  'woods-hole': '8447930', // Woods Hole, MA
  'hyannis': '8447241', // Hyannis, MA (nearest available)
  'vineyard-haven': '8449130', // Vineyard Haven, MA
  'nantucket': '8449726', // Nantucket Island, MA
  'oak-bluffs': '8448725', // Oak Bluffs, MA
};

interface COOPSTidePrediction {
  t: string; // Time in format YYYY-MM-DD HH:MM
  v: string; // Value (water level in feet)
  type?: string; // H for high, L for low (hi_lo product only)
}

interface COOPSResponse {
  predictions?: COOPSTidePrediction[];
  data?: COOPSTidePrediction[];
  error?: {
    message: string;
  };
}

/**
 * Get the station ID for a port
 */
function getStationId(portId: string): string | null {
  return TIDE_STATIONS[portId] || null;
}

/**
 * Get cache key for tide data
 */
function getCacheKey(portId: string, type: 'predictions' | 'hilo'): string {
  return `tide:${portId}:${type}`;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TideFetchError(
        `Request timeout after ${timeoutMs}ms`,
        'TIMEOUT',
        true
      );
    }
    throw error;
  }
}

/**
 * Fetch tide predictions for a port
 * Throws TideFetchError if data cannot be fetched - no mocks
 */
export async function fetchTidePredictions(
  portId: string,
  hours: number = 24
): Promise<TideData[]> {
  const stationId = getStationId(portId);

  if (!stationId) {
    throw new TideFetchError(
      `No tide station mapping for port: ${portId}`,
      'NO_STATION',
      false
    );
  }

  const cacheKey = getCacheKey(portId, 'predictions');
  const now = Date.now();

  // Check cache first
  const cached = tideCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    // Return cached data, sliced to requested hours
    const hoursMs = hours * 60 * 60 * 1000;
    return cached.data.filter((d) => {
      const dataTime = parseISO(d.timestamp.replace(' ', 'T')).getTime();
      return dataTime <= now + hoursMs;
    });
  }

  const nowDate = new Date();
  const endDate = addHours(nowDate, Math.max(hours, 48)); // Fetch at least 48 hours for caching

  const params = new URLSearchParams({
    begin_date: format(nowDate, 'yyyyMMdd HH:mm'),
    end_date: format(endDate, 'yyyyMMdd HH:mm'),
    station: stationId,
    product: 'predictions',
    datum: 'MLLW', // Mean Lower Low Water
    units: 'english', // Feet
    time_zone: 'lst_ldt', // Local time with daylight savings
    format: 'json',
    interval: 'h', // Hourly
  });

  try {
    const response = await fetchWithTimeout(
      `${COOPS_API_BASE}?${params.toString()}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new TideFetchError(
          `Station ${stationId} not found`,
          'STATION_NOT_FOUND',
          false
        );
      }
      if (response.status >= 500) {
        throw new TideFetchError(
          `NOAA CO-OPS server error: ${response.status}`,
          'SERVER_ERROR',
          true
        );
      }
      throw new TideFetchError(
        `NOAA CO-OPS API error: ${response.status} ${response.statusText}`,
        'API_ERROR',
        response.status >= 500
      );
    }

    const data: COOPSResponse = await response.json();

    if (data.error) {
      throw new TideFetchError(
        `NOAA CO-OPS error: ${data.error.message}`,
        'API_RESPONSE_ERROR',
        true
      );
    }

    const predictions = data.predictions || data.data;

    if (!predictions || predictions.length === 0) {
      throw new TideFetchError(
        'No tide predictions returned from NOAA CO-OPS',
        'EMPTY_RESPONSE',
        true
      );
    }

    const tideData: TideData[] = predictions.map((p) => ({
      timestamp: p.t,
      height: parseFloat(p.v),
      type: 'intermediate' as const,
    }));

    // Cache the full result
    tideCache.set(cacheKey, {
      data: tideData,
      timestamp: now,
      expiresAt: now + CACHE_TTL_MS,
    });

    // Return only requested hours
    const hoursMs = hours * 60 * 60 * 1000;
    return tideData.filter((d) => {
      const dataTime = parseISO(d.timestamp.replace(' ', 'T')).getTime();
      return dataTime <= now + hoursMs;
    });
  } catch (error) {
    // If we have stale cache data and the fetch failed, use stale data
    if (cached && error instanceof TideFetchError && error.retryable) {
      console.warn(`Using stale cache for ${cacheKey} due to fetch error:`, error.message);
      return cached.data;
    }

    if (error instanceof TideFetchError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new TideFetchError(
        `Failed to fetch tide predictions: ${error.message}`,
        'FETCH_ERROR',
        true
      );
    }
    throw new TideFetchError(
      'Failed to fetch tide predictions: Unknown error',
      'UNKNOWN_ERROR',
      true
    );
  }
}

/**
 * Fetch high/low tide times for a port
 * Throws TideFetchError if data cannot be fetched - no mocks
 */
export async function fetchHighLowTides(
  portId: string,
  hours: number = 48
): Promise<TideData[]> {
  const stationId = getStationId(portId);

  if (!stationId) {
    throw new TideFetchError(
      `No tide station mapping for port: ${portId}`,
      'NO_STATION',
      false
    );
  }

  const cacheKey = getCacheKey(portId, 'hilo');
  const now = Date.now();

  // Check cache first
  const cached = tideCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const nowDate = new Date();
  const endDate = addHours(nowDate, Math.max(hours, 72)); // Fetch at least 72 hours for hi/lo

  const params = new URLSearchParams({
    begin_date: format(nowDate, 'yyyyMMdd'),
    end_date: format(endDate, 'yyyyMMdd'),
    station: stationId,
    product: 'predictions',
    datum: 'MLLW',
    units: 'english',
    time_zone: 'lst_ldt',
    format: 'json',
    interval: 'hilo', // High/low only
  });

  try {
    const response = await fetchWithTimeout(
      `${COOPS_API_BASE}?${params.toString()}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new TideFetchError(
          `Station ${stationId} not found`,
          'STATION_NOT_FOUND',
          false
        );
      }
      if (response.status >= 500) {
        throw new TideFetchError(
          `NOAA CO-OPS server error: ${response.status}`,
          'SERVER_ERROR',
          true
        );
      }
      throw new TideFetchError(
        `NOAA CO-OPS API error: ${response.status} ${response.statusText}`,
        'API_ERROR',
        response.status >= 500
      );
    }

    const data: COOPSResponse = await response.json();

    if (data.error) {
      throw new TideFetchError(
        `NOAA CO-OPS error: ${data.error.message}`,
        'API_RESPONSE_ERROR',
        true
      );
    }

    const predictions = data.predictions || data.data;

    if (!predictions || predictions.length === 0) {
      throw new TideFetchError(
        'No high/low tide data returned from NOAA CO-OPS',
        'EMPTY_RESPONSE',
        true
      );
    }

    const tideData: TideData[] = predictions.map((p) => ({
      timestamp: p.t,
      height: parseFloat(p.v),
      type: p.type === 'H' ? 'high' : 'low',
    }));

    // Cache the result
    tideCache.set(cacheKey, {
      data: tideData,
      timestamp: now,
      expiresAt: now + CACHE_TTL_MS,
    });

    return tideData;
  } catch (error) {
    // If we have stale cache data and the fetch failed, use stale data
    if (cached && error instanceof TideFetchError && error.retryable) {
      console.warn(`Using stale cache for ${cacheKey} due to fetch error:`, error.message);
      return cached.data;
    }

    if (error instanceof TideFetchError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new TideFetchError(
        `Failed to fetch high/low tides: ${error.message}`,
        'FETCH_ERROR',
        true
      );
    }
    throw new TideFetchError(
      'Failed to fetch high/low tides: Unknown error',
      'UNKNOWN_ERROR',
      true
    );
  }
}

/**
 * Calculate current tide swing conditions
 * Throws TideFetchError if data cannot be fetched - no mocks
 */
export async function getCurrentTideSwing(portId: string): Promise<TideSwing> {
  const hiLo = await fetchHighLowTides(portId, 48);

  if (hiLo.length < 2) {
    throw new TideFetchError(
      'Insufficient tide data to calculate swing',
      'INSUFFICIENT_DATA',
      true
    );
  }

  const now = new Date();

  // Find the most recent past tide and next tide
  let prevTide: TideData | null = null;
  let nextTide: TideData | null = null;

  for (let i = 0; i < hiLo.length; i++) {
    const tideTime = parseISO(hiLo[i].timestamp.replace(' ', 'T'));

    if (tideTime <= now) {
      prevTide = hiLo[i];
    } else if (!nextTide) {
      nextTide = hiLo[i];
      break;
    }
  }

  if (!prevTide || !nextTide) {
    throw new TideFetchError(
      'Could not determine tide phase from available data',
      'PHASE_CALCULATION_ERROR',
      true
    );
  }

  const swingFeet = Math.abs(nextTide.height - prevTide.height);
  const nextTideTime = parseISO(nextTide.timestamp.replace(' ', 'T'));
  const hoursToNext = (nextTideTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  const currentPhase: TideSwing['current_phase'] =
    nextTide.type === 'high' ? 'rising' : 'falling';

  return {
    swing_feet: swingFeet,
    hours_to_next: Math.round(hoursToNext * 10) / 10,
    current_phase: currentPhase,
  };
}

/**
 * Check if a port has tide station coverage
 */
export function hasTideStation(portId: string): boolean {
  return !!TIDE_STATIONS[portId];
}

/**
 * Clear the tide cache (for testing or forced refresh)
 */
export function clearTideCache(): void {
  tideCache.clear();
}

/**
 * Get cache stats (for monitoring)
 */
export function getTideCacheStats(): { size: number; keys: string[] } {
  return {
    size: tideCache.size,
    keys: Array.from(tideCache.keys()),
  };
}
