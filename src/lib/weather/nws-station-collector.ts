/**
 * NWS Station Collector
 *
 * Phase 50: Cancellation Weather Enrichment
 *
 * Fetches latest observations from NWS (National Weather Service) stations
 * at the moment of cancellation. Stores immutable snapshot in database.
 *
 * NWS Observations API:
 * - Endpoint: https://api.weather.gov/stations/{stationId}/observations/latest
 * - Free, no API key required
 * - Returns current weather conditions
 *
 * Station Mapping:
 * - Woods Hole terminal → BZBM3 (Buzzards Bay CMAN) or KHYA (Hyannis Airport)
 * - Vineyard Haven terminal → KMVY (Martha's Vineyard Airport)
 * - Nantucket terminal → KACK (Nantucket Memorial Airport)
 * - Hyannis terminal → KHYA (Barnstable Municipal Airport)
 */

import { LandStationSource } from './weather-sources';

// ============================================================
// TYPES
// ============================================================

export interface NWSObservation {
  station_id: string;
  station_name: string;
  latitude: number;
  longitude: number;
  observation_time: Date;

  // Wind data
  wind_speed_mps?: number;      // meters per second (raw)
  wind_speed_mph?: number;      // converted
  wind_direction_deg?: number;  // degrees true
  wind_gust_mps?: number;       // meters per second (raw)
  wind_gust_mph?: number;       // converted

  // Atmospheric
  air_temp_c?: number;          // Celsius (raw)
  air_temp_f?: number;          // converted
  barometric_pressure_pa?: number;  // Pascals (raw)
  pressure_mb?: number;         // converted
  relative_humidity?: number;   // percent
  visibility_m?: number;        // meters (raw)
  visibility_mi?: number;       // converted
  dewpoint_c?: number;          // Celsius (raw)
  dewpoint_f?: number;          // converted

  // Conditions
  text_description?: string;    // e.g., "Partly Cloudy"

  // Raw data for debugging
  raw_data?: Record<string, unknown>;
}

export interface NWSCollectorResult {
  success: boolean;
  observation?: NWSObservation;
  error?: string;
  fetch_latency_ms: number;
  source_url: string;
}

// ============================================================
// CONSTANTS
// ============================================================

// NWS API base URL
const NWS_API_BASE = 'https://api.weather.gov';

// Conversion factors
const MPS_TO_MPH = 2.23694;
const CELSIUS_TO_FAHRENHEIT = (c: number) => (c * 9/5) + 32;
const PA_TO_MB = 0.01;
const METERS_TO_MILES = 0.000621371;

// Station mappings for terminals (fallback if not in weather-sources.ts)
export const TERMINAL_TO_NWS_STATION: Record<string, string> = {
  'woods-hole': 'KHYA',       // Hyannis is closest with reliable data
  'vineyard-haven': 'KMVY',   // Martha's Vineyard Airport
  'oak-bluffs': 'KMVY',       // Same as Vineyard Haven
  'hyannis': 'KHYA',          // Barnstable Municipal Airport
  'nantucket': 'KACK',        // Nantucket Memorial Airport
};

// ============================================================
// COLLECTOR IMPLEMENTATION
// ============================================================

/**
 * Fetch latest observation from an NWS station
 *
 * @param station - The station source configuration
 * @returns NWSCollectorResult with observation or error
 */
export async function fetchNWSObservation(station: LandStationSource): Promise<NWSCollectorResult> {
  const startTime = Date.now();
  const sourceUrl = `${NWS_API_BASE}/stations/${station.id}/observations/latest`;

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'FerryForecast/1.0 (weather-enrichment; contact@ferryforecast.com)',
        'Accept': 'application/geo+json',
      },
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        fetch_latency_ms: Date.now() - startTime,
        source_url: sourceUrl,
      };
    }

    const data = await response.json();
    const observation = parseNWSObservation(data, station);

    if (!observation) {
      return {
        success: false,
        error: 'Failed to parse NWS observation data',
        fetch_latency_ms: Date.now() - startTime,
        source_url: sourceUrl,
      };
    }

    return {
      success: true,
      observation,
      fetch_latency_ms: Date.now() - startTime,
      source_url: sourceUrl,
    };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Fetch failed: ${error}`,
      fetch_latency_ms: Date.now() - startTime,
      source_url: sourceUrl,
    };
  }
}

/**
 * Fetch observation for a terminal by slug
 *
 * @param terminalSlug - Terminal slug (e.g., 'woods-hole')
 * @returns NWSCollectorResult with observation or error
 */
export async function fetchNWSObservationForTerminal(
  terminalSlug: string
): Promise<NWSCollectorResult> {
  const stationId = TERMINAL_TO_NWS_STATION[terminalSlug];

  if (!stationId) {
    return {
      success: false,
      error: `No NWS station mapped for terminal: ${terminalSlug}`,
      fetch_latency_ms: 0,
      source_url: '',
    };
  }

  // Create a minimal station source
  const station: LandStationSource = {
    id: stationId,
    name: `${stationId} Weather Station`,
    terminal_slug: terminalSlug,
    lat: 0,  // Will be populated from response
    lon: 0,
  };

  return fetchNWSObservation(station);
}

/**
 * Parse NWS GeoJSON observation response
 *
 * Response structure (GeoJSON Feature):
 * {
 *   "type": "Feature",
 *   "geometry": { "type": "Point", "coordinates": [-70.28, 41.67] },
 *   "properties": {
 *     "station": "https://api.weather.gov/stations/KHYA",
 *     "timestamp": "2024-01-15T18:53:00+00:00",
 *     "temperature": { "value": 12.2, "unitCode": "wmoUnit:degC" },
 *     "windSpeed": { "value": 5.14, "unitCode": "wmoUnit:m_s-1" },
 *     "windDirection": { "value": 230, "unitCode": "wmoUnit:degree_(angle)" },
 *     "windGust": { "value": 8.23, "unitCode": "wmoUnit:m_s-1" },
 *     ...
 *   }
 * }
 */
function parseNWSObservation(
  data: Record<string, unknown>,
  station: LandStationSource
): NWSObservation | null {
  try {
    const properties = data.properties as Record<string, unknown>;
    if (!properties) {
      return null;
    }

    // Extract coordinates from geometry
    const geometry = data.geometry as { type: string; coordinates: number[] } | undefined;
    const lon = geometry?.coordinates?.[0] ?? station.lon;
    const lat = geometry?.coordinates?.[1] ?? station.lat;

    // Parse timestamp
    const timestamp = properties.timestamp as string;
    if (!timestamp) {
      return null;
    }
    const observationTime = new Date(timestamp);

    // Helper to extract numeric value from NWS property format
    const getValue = (prop: unknown): number | undefined => {
      if (!prop || typeof prop !== 'object') return undefined;
      const p = prop as { value: unknown };
      const val = p.value;
      if (val === null || val === undefined) return undefined;
      if (typeof val !== 'number') return undefined;
      return val;
    };

    const observation: NWSObservation = {
      station_id: station.id,
      station_name: station.name,
      latitude: lat,
      longitude: lon,
      observation_time: observationTime,
      raw_data: properties,
    };

    // Wind speed (m/s in API)
    const windSpeedMps = getValue(properties.windSpeed);
    if (windSpeedMps !== undefined) {
      observation.wind_speed_mps = windSpeedMps;
      observation.wind_speed_mph = Math.round(windSpeedMps * MPS_TO_MPH * 10) / 10;
    }

    // Wind direction (degrees)
    const windDir = getValue(properties.windDirection);
    if (windDir !== undefined) {
      observation.wind_direction_deg = windDir;
    }

    // Wind gust (m/s in API)
    const windGustMps = getValue(properties.windGust);
    if (windGustMps !== undefined) {
      observation.wind_gust_mps = windGustMps;
      observation.wind_gust_mph = Math.round(windGustMps * MPS_TO_MPH * 10) / 10;
    }

    // Temperature (Celsius in API)
    const tempC = getValue(properties.temperature);
    if (tempC !== undefined) {
      observation.air_temp_c = tempC;
      observation.air_temp_f = Math.round(CELSIUS_TO_FAHRENHEIT(tempC) * 10) / 10;
    }

    // Barometric pressure (Pascals in API)
    const pressurePa = getValue(properties.barometricPressure);
    if (pressurePa !== undefined) {
      observation.barometric_pressure_pa = pressurePa;
      observation.pressure_mb = Math.round(pressurePa * PA_TO_MB * 10) / 10;
    }

    // Relative humidity (percent)
    const humidity = getValue(properties.relativeHumidity);
    if (humidity !== undefined) {
      observation.relative_humidity = humidity;
    }

    // Visibility (meters in API)
    const visibilityM = getValue(properties.visibility);
    if (visibilityM !== undefined) {
      observation.visibility_m = visibilityM;
      observation.visibility_mi = Math.round(visibilityM * METERS_TO_MILES * 10) / 10;
    }

    // Dewpoint (Celsius in API)
    const dewpointC = getValue(properties.dewpoint);
    if (dewpointC !== undefined) {
      observation.dewpoint_c = dewpointC;
      observation.dewpoint_f = Math.round(CELSIUS_TO_FAHRENHEIT(dewpointC) * 10) / 10;
    }

    // Text description
    const textDesc = properties.textDescription;
    if (typeof textDesc === 'string') {
      observation.text_description = textDesc;
    }

    return observation;
  } catch (err) {
    console.error('[NWS] Parse error:', err);
    return null;
  }
}

/**
 * Fetch observations from multiple NWS stations
 *
 * @param stations - Array of station sources to fetch
 * @returns Array of results (some may be errors)
 */
export async function fetchMultipleNWSObservations(
  stations: LandStationSource[]
): Promise<NWSCollectorResult[]> {
  // Fetch all stations in parallel
  return Promise.all(stations.map(station => fetchNWSObservation(station)));
}
