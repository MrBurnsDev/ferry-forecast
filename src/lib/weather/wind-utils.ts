/**
 * Wind Utility Functions
 *
 * Phase 51: Cancellation Forecast UI + Prediction Layer
 *
 * Provides consistent wind unit conversion and display formatting:
 * - Primary unit: mph (miles per hour)
 * - Secondary unit: knots (in parentheses)
 * - Direction: Always compass-based (WNW, SW, etc), never degrees in UI
 *
 * Example output: "9 mph (8 kts) WNW"
 */

// ============================================================
// CONVERSION CONSTANTS
// ============================================================

/**
 * Conversion factor: 1 mph = 0.868976 knots
 */
const MPH_TO_KNOTS = 0.868976;

/**
 * Conversion factor: 1 knot = 1.15078 mph
 */
const KNOTS_TO_MPH = 1.15078;

/**
 * Conversion factor: 1 m/s = 2.23694 mph
 */
export const MPS_TO_MPH = 2.23694;

// ============================================================
// COMPASS DIRECTIONS
// ============================================================

/**
 * 16-point compass directions
 * Each point covers 22.5 degrees (360 / 16)
 */
const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
] as const;

export type CompassDirection = typeof COMPASS_POINTS[number];

// ============================================================
// CONVERSION FUNCTIONS
// ============================================================

/**
 * Convert miles per hour to knots
 *
 * @param mph - Wind speed in miles per hour
 * @returns Wind speed in knots, rounded to 1 decimal
 */
export function mphToKnots(mph: number): number {
  return Math.round(mph * MPH_TO_KNOTS * 10) / 10;
}

/**
 * Convert knots to miles per hour
 *
 * @param knots - Wind speed in knots
 * @returns Wind speed in mph, rounded to 1 decimal
 */
export function knotsToMph(knots: number): number {
  return Math.round(knots * KNOTS_TO_MPH * 10) / 10;
}

/**
 * Convert meters per second to miles per hour
 *
 * @param mps - Wind speed in meters per second
 * @returns Wind speed in mph, rounded to 1 decimal
 */
export function mpsToMph(mps: number): number {
  return Math.round(mps * MPS_TO_MPH * 10) / 10;
}

/**
 * Convert degrees to 16-point compass direction
 *
 * @param deg - Wind direction in degrees (0-360, meteorological convention)
 * @returns Compass direction string (N, NNE, NE, ENE, E, etc.)
 *
 * Note: Meteorological wind direction indicates where wind is coming FROM
 * 0° = N, 90° = E, 180° = S, 270° = W
 */
export function degreesToCompass(deg: number | null | undefined): CompassDirection | null {
  if (deg === null || deg === undefined || isNaN(deg)) {
    return null;
  }

  // Normalize to 0-360 range
  const normalized = ((deg % 360) + 360) % 360;

  // Each compass point covers 22.5 degrees
  // Add 11.25 to center each point, then divide by 22.5
  const index = Math.round(normalized / 22.5) % 16;

  return COMPASS_POINTS[index];
}

// ============================================================
// FORMATTING FUNCTIONS
// ============================================================

/**
 * Format wind speed with both units: "9 mph (8 kts)"
 *
 * @param mph - Wind speed in miles per hour
 * @returns Formatted string with mph and knots
 */
export function formatWindSpeed(mph: number | null | undefined): string {
  if (mph === null || mph === undefined || isNaN(mph)) {
    return '--';
  }

  const knots = Math.round(mph * MPH_TO_KNOTS);
  const roundedMph = Math.round(mph);

  return `${roundedMph} mph (${knots} kts)`;
}

/**
 * Format wind with speed and direction: "9 mph (8 kts) WNW"
 *
 * @param mph - Wind speed in miles per hour
 * @param deg - Wind direction in degrees
 * @returns Formatted string with speed, knots, and compass direction
 */
export function formatWind(
  mph: number | null | undefined,
  deg: number | null | undefined
): string {
  const speedStr = formatWindSpeed(mph);
  const direction = degreesToCompass(deg);

  if (speedStr === '--') {
    return '--';
  }

  if (!direction) {
    return speedStr;
  }

  return `${speedStr} ${direction}`;
}

/**
 * Format wind gusts: "Gusts to 15 mph (13 kts)"
 *
 * @param gustMph - Gust speed in miles per hour
 * @returns Formatted gust string, or empty string if no gusts
 */
export function formatGusts(gustMph: number | null | undefined): string {
  if (gustMph === null || gustMph === undefined || isNaN(gustMph)) {
    return '';
  }

  const knots = Math.round(gustMph * MPH_TO_KNOTS);
  const rounded = Math.round(gustMph);

  return `Gusts to ${rounded} mph (${knots} kts)`;
}

/**
 * Format wind with optional gusts for full display
 *
 * @param mph - Wind speed in mph
 * @param deg - Wind direction in degrees
 * @param gustMph - Optional gust speed in mph
 * @returns Full wind description, e.g., "9 mph (8 kts) WNW, gusts to 15 mph (13 kts)"
 */
export function formatWindFull(
  mph: number | null | undefined,
  deg: number | null | undefined,
  gustMph: number | null | undefined
): string {
  const baseWind = formatWind(mph, deg);

  if (baseWind === '--') {
    return 'Wind data unavailable';
  }

  const gusts = formatGusts(gustMph);

  if (!gusts) {
    return baseWind;
  }

  // Only show gusts if significantly higher than sustained
  if (gustMph && mph && gustMph > mph * 1.2) {
    return `${baseWind}, ${gusts.toLowerCase()}`;
  }

  return baseWind;
}

// ============================================================
// RISK DESCRIPTION HELPERS
// ============================================================

/**
 * Get human-readable wind intensity description
 *
 * @param mph - Wind speed in mph
 * @returns Description like "light", "moderate", "strong", "very strong", "severe"
 */
export function getWindIntensity(mph: number | null | undefined): string {
  if (mph === null || mph === undefined || isNaN(mph)) {
    return 'unknown';
  }

  if (mph < 10) return 'light';
  if (mph < 20) return 'moderate';
  if (mph < 30) return 'strong';
  if (mph < 40) return 'very strong';
  return 'severe';
}

/**
 * Format wind for risk description: "strong WNW winds"
 *
 * @param mph - Wind speed in mph
 * @param deg - Wind direction in degrees
 * @returns Description like "strong WNW winds" or "moderate SW winds"
 */
export function formatWindRiskDescription(
  mph: number | null | undefined,
  deg: number | null | undefined
): string {
  const intensity = getWindIntensity(mph);
  const direction = degreesToCompass(deg);

  if (intensity === 'unknown') {
    return 'wind conditions unknown';
  }

  if (!direction) {
    return `${intensity} winds`;
  }

  return `${intensity} ${direction} winds`;
}

// ============================================================
// DISPLAY UTILITIES
// ============================================================

/**
 * Format direction only (for compact displays)
 *
 * @param deg - Wind direction in degrees
 * @returns Compass direction or '--'
 */
export function formatDirection(deg: number | null | undefined): string {
  const direction = degreesToCompass(deg);
  return direction ?? '--';
}

/**
 * Get wind arrow rotation for UI display
 * Arrow points in the direction wind is blowing TO (opposite of meteorological direction)
 *
 * @param deg - Meteorological wind direction in degrees (where wind comes FROM)
 * @returns CSS rotation value in degrees (where wind goes TO)
 */
export function getWindArrowRotation(deg: number | null | undefined): number {
  if (deg === null || deg === undefined || isNaN(deg)) {
    return 0;
  }
  // Wind FROM north (0°) blows TO south, so arrow points down (180°)
  return (deg + 180) % 360;
}
