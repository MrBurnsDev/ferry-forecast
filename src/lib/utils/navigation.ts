/**
 * Navigation utilities for ferry route display
 *
 * These helpers convert technical navigation data into human-readable formats
 * that match how users naturally think about directions and routes.
 */

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
 * Route sensitivity metadata for Cape Cod & Islands routes
 *
 * This provides human-readable explanations of why certain wind directions
 * affect specific routes more than others. Based on geographical exposure.
 *
 * Intent: Build user trust by showing the app "understands" local conditions.
 * This is informational only - does not affect scoring (yet).
 */
export interface RouteSensitivity {
  /** Primary wind directions that most impact this route */
  sensitiveWindDirections: CompassDirection[];
  /** Human-readable explanation of route exposure */
  exposureDescription: string;
  /** General heading description (avoids misleading specific bearings) */
  generalHeading: string;
  /** Water body the route crosses */
  waterBody: string;
}

/**
 * Route sensitivity data keyed by route_id
 *
 * These are based on actual geography of Vineyard Sound and Nantucket Sound:
 * - Vineyard Sound runs roughly E-W between Cape Cod and Martha's Vineyard
 * - Nantucket Sound is more protected but exposed to S and SW winds
 * - Routes crossing open water are most affected by winds perpendicular to route
 */
export const ROUTE_SENSITIVITY: Record<string, RouteSensitivity> = {
  // Woods Hole ↔ Vineyard Haven (SSA)
  'wh-vh-ssa': {
    sensitiveWindDirections: ['W', 'WNW', 'SW', 'WSW'],
    exposureDescription: 'This route crosses Vineyard Sound and is most impacted by strong westerly and southwesterly winds due to open-water exposure.',
    generalHeading: 'North–South across Vineyard Sound',
    waterBody: 'Vineyard Sound',
  },
  'vh-wh-ssa': {
    sensitiveWindDirections: ['W', 'WNW', 'SW', 'WSW'],
    exposureDescription: 'This route crosses Vineyard Sound and is most impacted by strong westerly and southwesterly winds due to open-water exposure.',
    generalHeading: 'South–North across Vineyard Sound',
    waterBody: 'Vineyard Sound',
  },

  // Woods Hole ↔ Oak Bluffs (SSA)
  'wh-ob-ssa': {
    sensitiveWindDirections: ['W', 'SW', 'S'],
    exposureDescription: 'This route travels through Vineyard Sound with exposure to southerly and westerly winds across open water.',
    generalHeading: 'North–South through Vineyard Sound',
    waterBody: 'Vineyard Sound',
  },
  'ob-wh-ssa': {
    sensitiveWindDirections: ['W', 'SW', 'S'],
    exposureDescription: 'This route travels through Vineyard Sound with exposure to southerly and westerly winds across open water.',
    generalHeading: 'South–North through Vineyard Sound',
    waterBody: 'Vineyard Sound',
  },

  // Hyannis ↔ Nantucket (SSA & Hy-Line)
  'hy-nan-ssa': {
    sensitiveWindDirections: ['S', 'SW', 'SE'],
    exposureDescription: 'This longer crossing through Nantucket Sound is most affected by southerly winds, which can create significant swells.',
    generalHeading: 'Northwest–Southeast across Nantucket Sound',
    waterBody: 'Nantucket Sound',
  },
  'nan-hy-ssa': {
    sensitiveWindDirections: ['S', 'SW', 'SE'],
    exposureDescription: 'This longer crossing through Nantucket Sound is most affected by southerly winds, which can create significant swells.',
    generalHeading: 'Southeast–Northwest across Nantucket Sound',
    waterBody: 'Nantucket Sound',
  },
  'hy-nan-hlc': {
    sensitiveWindDirections: ['S', 'SW', 'SE'],
    exposureDescription: 'This crossing through Nantucket Sound is most affected by southerly winds. High-speed vessels may be more sensitive to sea conditions.',
    generalHeading: 'Northwest–Southeast across Nantucket Sound',
    waterBody: 'Nantucket Sound',
  },
  'nan-hy-hlc': {
    sensitiveWindDirections: ['S', 'SW', 'SE'],
    exposureDescription: 'This crossing through Nantucket Sound is most affected by southerly winds. High-speed vessels may be more sensitive to sea conditions.',
    generalHeading: 'Southeast–Northwest across Nantucket Sound',
    waterBody: 'Nantucket Sound',
  },

  // Hyannis ↔ Vineyard Haven (Hy-Line)
  'hy-vh-hlc': {
    sensitiveWindDirections: ['S', 'SW', 'W'],
    exposureDescription: 'This route crosses both Nantucket Sound and approaches Vineyard Sound, with exposure to southwesterly winds.',
    generalHeading: 'East–Southwest across the Sounds',
    waterBody: 'Nantucket Sound / Vineyard Sound',
  },
  'vh-hy-hlc': {
    sensitiveWindDirections: ['S', 'SW', 'W'],
    exposureDescription: 'This route crosses both Nantucket Sound and approaches Vineyard Sound, with exposure to southwesterly winds.',
    generalHeading: 'Southwest–East across the Sounds',
    waterBody: 'Nantucket Sound / Vineyard Sound',
  },
};

/**
 * Get route sensitivity data, with fallback for unknown routes
 */
export function getRouteSensitivity(routeId: string): RouteSensitivity | null {
  return ROUTE_SENSITIVITY[routeId] || null;
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
