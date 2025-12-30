/**
 * Navigation utilities for ferry route display
 *
 * These helpers convert technical navigation data into human-readable formats
 * that match how users naturally think about directions and routes.
 *
 * IMPORTANT: Route sensitivity data is now COMPUTED from coastline geometry,
 * not hand-authored. See src/lib/config/exposure.ts for the computed data.
 */

import { getRouteExposure, isUsingV2Algorithm } from '@/lib/config/exposure';

/**
 * Cardinal and intercardinal compass directions
 * 16-point compass rose for precise wind direction display
 */
const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW'
] as const;

export type CompassDirection = typeof COMPASS_POINTS[number];

/**
 * Converts degrees to compass direction
 *
 * @param degrees - Wind direction in degrees (0-360, where 0/360 = North)
 * @returns Cardinal/intercardinal direction (e.g., "NW", "SSE")
 *
 * @example
 * degreesToCompass(270) // "W"
 * degreesToCompass(292) // "WNW"
 * degreesToCompass(135) // "SE"
 * degreesToCompass(0)   // "N"
 */
export function degreesToCompass(degrees: number): CompassDirection {
  // Normalize to 0-360 range
  const normalized = ((degrees % 360) + 360) % 360;

  // Each compass point spans 22.5 degrees (360 / 16)
  // Add 11.25 to center the ranges around each point
  const index = Math.round(normalized / 22.5) % 16;

  return COMPASS_POINTS[index];
}

/**
 * Formats wind direction for display with both cardinal and degrees
 *
 * @param degrees - Wind direction in degrees
 * @returns Formatted string like "W (270°)"
 */
export function formatWindDirection(degrees: number): string {
  const compass = degreesToCompass(degrees);
  return `${compass} (${degrees}°)`;
}

/**
 * Route sensitivity metadata - now derived from COMPUTED exposure data
 *
 * MIGRATION NOTE: This interface maintains backward compatibility with the UI,
 * but the underlying data now comes from physics-based coastline analysis
 * (see src/lib/config/exposure.ts) instead of hand-authored values.
 *
 * The computed data uses fetch distance (km to land) to determine exposure
 * for each of 16 wind directions, providing truthful comparisons between routes.
 */
export interface RouteSensitivity {
  /** Primary wind directions that most impact this route (top 3 by exposure) */
  sensitiveWindDirections: CompassDirection[];
  /** Human-readable explanation of route exposure (generated from computed data) */
  exposureDescription: string;
  /** General heading description */
  generalHeading: string;
  /** Water body the route crosses */
  waterBody: string;
  /** Average exposure score (0-1) for transparency */
  avgExposure: number;
  /** Whether this is computed vs static data */
  isComputed: boolean;
}

// Water body lookup by port pairs (static geographic fact)
const WATER_BODIES: Record<string, string> = {
  'woods-hole:vineyard-haven': 'Vineyard Sound',
  'woods-hole:oak-bluffs': 'Vineyard Sound',
  'hyannis:nantucket': 'Nantucket Sound',
  'hyannis:vineyard-haven': 'Nantucket Sound / Vineyard Sound',
};

function getWaterBody(origin: string, dest: string): string {
  const key1 = `${origin}:${dest}`;
  const key2 = `${dest}:${origin}`;
  return WATER_BODIES[key1] || WATER_BODIES[key2] || 'Open water';
}

function generateExposureDescription(
  topDirs: CompassDirection[],
  avgExposure: number,
  waterBody: string
): string {
  const dirList = topDirs.length === 3
    ? `${topDirs[0]}, ${topDirs[1]}, and ${topDirs[2]}`
    : topDirs.join(' and ');

  const isV2 = isUsingV2Algorithm();

  if (avgExposure > 0.65) {
    return isV2
      ? `This longer crossing through ${waterBody} has high open-water exposure to ${dirList} winds (${Math.round(avgExposure * 100)}% open).`
      : `This longer crossing through ${waterBody} has high exposure to ${dirList} winds based on computed fetch distances to land.`;
  } else if (avgExposure > 0.5) {
    return isV2
      ? `This route across ${waterBody} is moderately exposed to ${dirList} winds (${Math.round(avgExposure * 100)}% open).`
      : `This route across ${waterBody} is moderately exposed to ${dirList} winds based on coastline geometry.`;
  } else {
    return isV2
      ? `This route through ${waterBody} has good shelter but is most exposed to ${dirList} winds (${Math.round(avgExposure * 100)}% open).`
      : `This route through ${waterBody} has some shelter but is most exposed to ${dirList} winds.`;
  }
}

function generateHeading(origin: string, dest: string): string {
  // Simplified heading based on port pair
  const headings: Record<string, string> = {
    'woods-hole:vineyard-haven': 'North–South across Vineyard Sound',
    'vineyard-haven:woods-hole': 'South–North across Vineyard Sound',
    'woods-hole:oak-bluffs': 'North–South through Vineyard Sound',
    'oak-bluffs:woods-hole': 'South–North through Vineyard Sound',
    'hyannis:nantucket': 'Northwest–Southeast across Nantucket Sound',
    'nantucket:hyannis': 'Southeast–Northwest across Nantucket Sound',
    'hyannis:vineyard-haven': 'East–Southwest across the Sounds',
    'vineyard-haven:hyannis': 'Southwest–East across the Sounds',
  };
  return headings[`${origin}:${dest}`] || 'Open water crossing';
}

/**
 * Get route sensitivity data derived from computed exposure
 *
 * This function now uses physics-based exposure data computed from
 * coastline geometry (fetch distance analysis) instead of hand-authored values.
 */
export function getRouteSensitivity(routeId: string): RouteSensitivity | null {
  const exposure = getRouteExposure(routeId);

  if (!exposure) {
    return null;
  }

  const waterBody = getWaterBody(exposure.origin_port, exposure.destination_port);

  return {
    sensitiveWindDirections: exposure.top_exposure_dirs as CompassDirection[],
    exposureDescription: generateExposureDescription(
      exposure.top_exposure_dirs as CompassDirection[],
      exposure.avg_exposure,
      waterBody
    ),
    generalHeading: generateHeading(exposure.origin_port, exposure.destination_port),
    waterBody,
    avgExposure: exposure.avg_exposure,
    isComputed: true,
  };
}

/**
 * Formats sensitive wind directions for display
 *
 * @param directions - Array of compass directions
 * @returns Human-readable string like "W, WNW, and SW"
 */
export function formatSensitiveDirections(directions: CompassDirection[]): string {
  if (directions.length === 0) return '';
  if (directions.length === 1) return directions[0];
  if (directions.length === 2) return `${directions[0]} and ${directions[1]}`;

  const last = directions[directions.length - 1];
  const rest = directions.slice(0, -1);
  return `${rest.join(', ')}, and ${last}`;
}
