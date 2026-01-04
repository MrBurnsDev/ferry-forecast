/**
 * NDBC Buoy Collector
 *
 * Phase 50: Cancellation Weather Enrichment
 *
 * Fetches latest observation from NDBC (National Data Buoy Center) buoys
 * at the moment of cancellation. Stores immutable snapshot in database.
 *
 * NDBC Data Format Reference:
 * - Real-time data: https://www.ndbc.noaa.gov/data/realtime2/
 * - Station info: https://www.ndbc.noaa.gov/station_page.php?station=XXXXX
 *
 * Data file columns (space-separated):
 * #YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
 */

import { BuoySource } from './weather-sources';

// ============================================================
// TYPES
// ============================================================

export interface NDBCObservation {
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

  // Wave data
  wave_height_m?: number;       // meters (raw)
  wave_height_ft?: number;      // converted
  dominant_wave_period_sec?: number;
  average_wave_period_sec?: number;
  mean_wave_direction_deg?: number;

  // Atmospheric
  air_temp_c?: number;          // Celsius (raw)
  air_temp_f?: number;          // converted
  water_temp_c?: number;        // Celsius (raw)
  water_temp_f?: number;        // converted
  pressure_hpa?: number;        // hPa (raw)
  pressure_mb?: number;         // same as hPa
  visibility_nmi?: number;      // nautical miles (raw)
  visibility_mi?: number;       // converted

  // Raw data for debugging
  raw_line?: string;
}

export interface NDBCCollectorResult {
  success: boolean;
  observation?: NDBCObservation;
  error?: string;
  fetch_latency_ms: number;
  source_url: string;
}

// ============================================================
// CONSTANTS
// ============================================================

// NDBC real-time data URL pattern
// Uses .txt for standard meteorological data
const NDBC_REALTIME_URL = 'https://www.ndbc.noaa.gov/data/realtime2';

// Conversion factors
const MPS_TO_MPH = 2.23694;
const METERS_TO_FEET = 3.28084;
const CELSIUS_TO_FAHRENHEIT = (c: number) => (c * 9/5) + 32;
const NMI_TO_MI = 1.15078;

// Missing data marker in NDBC files
const MISSING_VALUE = 'MM';

// ============================================================
// COLLECTOR IMPLEMENTATION
// ============================================================

/**
 * Fetch latest observation from an NDBC buoy
 *
 * @param buoy - The buoy source configuration
 * @returns NDBCCollectorResult with observation or error
 */
export async function fetchNDBCObservation(buoy: BuoySource): Promise<NDBCCollectorResult> {
  const startTime = Date.now();
  const sourceUrl = `${NDBC_REALTIME_URL}/${buoy.id}.txt`;

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'FerryForecast/1.0 (weather-enrichment)',
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

    const text = await response.text();
    const observation = parseNDBCData(text, buoy);

    if (!observation) {
      return {
        success: false,
        error: 'Failed to parse NDBC data - no valid observations found',
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
 * Parse NDBC realtime data file
 *
 * Format (first two lines are headers):
 * #YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY TIDE
 * #yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa   ft
 * 2024 01 15 18 00  230  8.2  10.3   1.2   5.0   4.2  220 1015.2  12.5  14.2  10.1   MM   MM   MM
 */
function parseNDBCData(text: string, buoy: BuoySource): NDBCObservation | null {
  const lines = text.trim().split('\n');

  // Need at least 3 lines (2 header + 1 data)
  if (lines.length < 3) {
    return null;
  }

  // Find first data line (skip header lines starting with #)
  let dataLineIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#')) {
      dataLineIndex = i;
      break;
    }
  }

  const dataLine = lines[dataLineIndex];
  if (!dataLine || dataLine.startsWith('#')) {
    return null;
  }

  // Split on whitespace
  const parts = dataLine.trim().split(/\s+/);

  // Expected minimum columns: YY MM DD hh mm + some data
  if (parts.length < 6) {
    return null;
  }

  // Parse timestamp
  // Format: YY MM DD hh mm (or YYYY MM DD hh mm)
  let year = parseInt(parts[0], 10);
  if (year < 100) {
    year += 2000; // Convert 2-digit year
  }
  const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
  const day = parseInt(parts[2], 10);
  const hour = parseInt(parts[3], 10);
  const minute = parseInt(parts[4], 10);

  const observationTime = new Date(Date.UTC(year, month, day, hour, minute));

  // Parse optional fields (index positions based on standard NDBC format)
  const getValue = (index: number): number | undefined => {
    if (index >= parts.length) return undefined;
    const val = parts[index];
    if (val === MISSING_VALUE || val === 'MM' || val === 'NA' || val === '') return undefined;
    const num = parseFloat(val);
    return isNaN(num) ? undefined : num;
  };

  // Column indices (0-indexed, after timestamp fields):
  // 5: WDIR (wind direction)
  // 6: WSPD (wind speed m/s)
  // 7: GST (gust m/s)
  // 8: WVHT (wave height m)
  // 9: DPD (dominant wave period sec)
  // 10: APD (average wave period sec)
  // 11: MWD (mean wave direction)
  // 12: PRES (pressure hPa)
  // 13: ATMP (air temp C)
  // 14: WTMP (water temp C)
  // 15: DEWP (dew point C)
  // 16: VIS (visibility nmi)

  const windDir = getValue(5);
  const windSpeedMps = getValue(6);
  const gustMps = getValue(7);
  const waveHeightM = getValue(8);
  const dominantPeriod = getValue(9);
  const avgPeriod = getValue(10);
  const meanWaveDir = getValue(11);
  const pressureHpa = getValue(12);
  const airTempC = getValue(13);
  const waterTempC = getValue(14);
  const visibilityNmi = getValue(16);

  const observation: NDBCObservation = {
    station_id: buoy.id,
    station_name: buoy.name,
    latitude: buoy.lat,
    longitude: buoy.lon,
    observation_time: observationTime,
    raw_line: dataLine,
  };

  // Add wind data with conversions
  if (windDir !== undefined) {
    observation.wind_direction_deg = windDir;
  }
  if (windSpeedMps !== undefined) {
    observation.wind_speed_mps = windSpeedMps;
    observation.wind_speed_mph = Math.round(windSpeedMps * MPS_TO_MPH * 10) / 10;
  }
  if (gustMps !== undefined) {
    observation.wind_gust_mps = gustMps;
    observation.wind_gust_mph = Math.round(gustMps * MPS_TO_MPH * 10) / 10;
  }

  // Add wave data with conversions
  if (waveHeightM !== undefined) {
    observation.wave_height_m = waveHeightM;
    observation.wave_height_ft = Math.round(waveHeightM * METERS_TO_FEET * 10) / 10;
  }
  if (dominantPeriod !== undefined) {
    observation.dominant_wave_period_sec = dominantPeriod;
  }
  if (avgPeriod !== undefined) {
    observation.average_wave_period_sec = avgPeriod;
  }
  if (meanWaveDir !== undefined) {
    observation.mean_wave_direction_deg = meanWaveDir;
  }

  // Add atmospheric data with conversions
  if (pressureHpa !== undefined) {
    observation.pressure_hpa = pressureHpa;
    observation.pressure_mb = pressureHpa; // hPa = mb
  }
  if (airTempC !== undefined) {
    observation.air_temp_c = airTempC;
    observation.air_temp_f = Math.round(CELSIUS_TO_FAHRENHEIT(airTempC) * 10) / 10;
  }
  if (waterTempC !== undefined) {
    observation.water_temp_c = waterTempC;
    observation.water_temp_f = Math.round(CELSIUS_TO_FAHRENHEIT(waterTempC) * 10) / 10;
  }
  if (visibilityNmi !== undefined) {
    observation.visibility_nmi = visibilityNmi;
    observation.visibility_mi = Math.round(visibilityNmi * NMI_TO_MI * 10) / 10;
  }

  return observation;
}

/**
 * Fetch observations from multiple buoys for a corridor
 *
 * @param buoys - Array of buoy sources to fetch
 * @returns Array of results (some may be errors)
 */
export async function fetchMultipleBuoyObservations(
  buoys: BuoySource[]
): Promise<NDBCCollectorResult[]> {
  // Fetch all buoys in parallel
  return Promise.all(buoys.map(buoy => fetchNDBCObservation(buoy)));
}
