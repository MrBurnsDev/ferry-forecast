/**
 * Per-Sailing Risk Computation
 * =============================
 *
 * Phase 16: Sailing-level risk overlays
 *
 * This module computes weather-based risk for individual sailings,
 * taking into account the sailing's direction and current weather conditions.
 *
 * IMPORTANT DISTINCTIONS:
 * - Schedule = what is planned (times, directions)
 * - Status = what the operator declares (on_time, delayed, canceled)
 * - Risk = Ferry Forecast's interpretation (weather exposure)
 *
 * These are SEPARATE and NEVER overwrite each other.
 * Risk does NOT predict cancellation - it explains exposure.
 */

import type { Sailing } from '@/lib/schedules/types';
import {
  getRouteExposure,
  degreesToCompassBucket,
  type CompassDirection,
} from '@/lib/config/exposure';
import {
  WIND_THRESHOLDS,
  GUST_THRESHOLDS,
} from './weights';

/**
 * Risk level for a sailing
 */
export type SailingRiskLevel = 'low' | 'moderate' | 'elevated';

/**
 * Per-sailing risk assessment
 */
export interface SailingRisk {
  /** Risk score 0-100 */
  score: number;

  /** Risk level category */
  level: SailingRiskLevel;

  /** Short explanation of the risk */
  reason: string | null;

  /** Whether direction affects this sailing's risk */
  directionAffected: boolean;

  /** Wind direction relative to sailing direction */
  windRelation: 'headwind' | 'tailwind' | 'crosswind' | 'quartering' | null;
}

/**
 * Weather context for risk computation
 */
export interface WeatherContext {
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  advisoryLevel?: string;
}

/**
 * Convert port slugs to route bearing
 * Returns approximate bearing in degrees for the crossing
 */
function getRouteBearing(fromSlug: string, toSlug: string): number {
  // Cape Cod region port bearings (approximate)
  const portBearings: Record<string, Record<string, number>> = {
    // Woods Hole routes
    'woods-hole': {
      'vineyard-haven': 180, // South
      'oak-bluffs': 165,     // SSE
    },
    'vineyard-haven': {
      'woods-hole': 0,       // North
      'hyannis': 45,         // NE
    },
    'oak-bluffs': {
      'woods-hole': 345,     // NNW
    },
    // Hyannis routes
    'hyannis': {
      'nantucket': 135,      // SE
      'vineyard-haven': 225, // SW
    },
    'nantucket': {
      'hyannis': 315,        // NW
    },
  };

  return portBearings[fromSlug]?.[toSlug] ?? 90; // Default to east if unknown
}

/**
 * Calculate wind-to-route relationship
 *
 * @param windDirection - Wind direction in degrees (where wind comes FROM)
 * @param routeBearing - Route bearing in degrees (direction of travel)
 * @returns Wind relationship and multiplier
 */
function calculateWindRelation(
  windDirection: number,
  routeBearing: number
): { relation: 'headwind' | 'tailwind' | 'crosswind' | 'quartering'; multiplier: number } {
  // Calculate relative angle between wind and route
  // Wind direction is where wind comes FROM
  // Route bearing is where boat is GOING
  let relativeAngle = Math.abs(windDirection - routeBearing);
  if (relativeAngle > 180) {
    relativeAngle = 360 - relativeAngle;
  }

  // Headwind: wind opposing direction of travel (135-180 degrees relative)
  if (relativeAngle >= 135) {
    return { relation: 'headwind', multiplier: 1.4 };
  }

  // Crosswind: wind perpendicular to travel (45-135 degrees relative)
  if (relativeAngle >= 45) {
    return { relation: 'crosswind', multiplier: 1.2 };
  }

  // Tailwind: wind in same direction as travel (0-45 degrees relative)
  if (relativeAngle < 20) {
    return { relation: 'tailwind', multiplier: 0.8 };
  }

  // Quartering wind
  return { relation: 'quartering', multiplier: 1.0 };
}

/**
 * Compute risk score for a single sailing
 *
 * This uses:
 * - Route shelter signature (exposure to wind from each direction)
 * - Sailing direction (which way the ferry is heading)
 * - Current wind conditions (speed, direction, gusts)
 *
 * @param sailing - The sailing to assess
 * @param weather - Current weather conditions
 * @param routeId - Route identifier for exposure lookup
 * @returns SailingRisk assessment
 */
export function computeSailingRisk(
  sailing: Sailing,
  weather: WeatherContext,
  routeId: string
): SailingRisk {
  // Start with base score from wind conditions
  let score = 0;
  const reasons: string[] = [];

  // Get route bearing for this sailing direction
  const routeBearing = getRouteBearing(
    sailing.direction.fromSlug,
    sailing.direction.toSlug
  );

  // Calculate wind-to-route relationship
  const windRelation = calculateWindRelation(weather.windDirection, routeBearing);

  // Get route exposure for this wind direction
  const routeExposure = getRouteExposure(routeId);
  const windCompass = degreesToCompassBucket(weather.windDirection);

  // 1. Base wind score
  if (weather.windSpeed >= WIND_THRESHOLDS.SEVERE) {
    score += 35;
    reasons.push(`strong ${weather.windSpeed} mph winds`);
  } else if (weather.windSpeed >= WIND_THRESHOLDS.SIGNIFICANT) {
    score += 20;
    reasons.push(`${weather.windSpeed} mph winds`);
  } else if (weather.windSpeed >= WIND_THRESHOLDS.MODERATE) {
    score += 10;
  }

  // 2. Gust penalty
  if (weather.windGusts >= GUST_THRESHOLDS.SEVERE) {
    score += 15;
    reasons.push(`gusts to ${weather.windGusts} mph`);
  } else if (weather.windGusts >= GUST_THRESHOLDS.SIGNIFICANT) {
    score += 8;
  }

  // 3. Apply direction multiplier (only if winds are significant)
  let directionAffected = false;
  if (weather.windSpeed >= WIND_THRESHOLDS.MODERATE && windRelation.multiplier !== 1.0) {
    directionAffected = true;
    score = Math.round(score * windRelation.multiplier);

    if (windRelation.relation === 'headwind') {
      reasons.push(`${windCompass} headwind opposing ${sailing.direction.to}-bound crossing`);
    } else if (windRelation.relation === 'crosswind') {
      reasons.push(`${windCompass} crosswind on beam`);
    }
  }

  // 4. Route exposure modifier (if available)
  if (routeExposure && weather.windSpeed >= WIND_THRESHOLDS.MODERATE) {
    const exposureValue = routeExposure.exposure_by_dir[windCompass];
    if (exposureValue !== undefined) {
      // Exposure 0-1 maps to modifier -5 to +10
      const exposureModifier = Math.round(-5 + 15 * exposureValue);
      score += exposureModifier;

      if (exposureValue > 0.6) {
        directionAffected = true;
        reasons.push(`route open to ${windCompass} winds`);
      }
    }
  }

  // 5. Advisory boost
  if (weather.advisoryLevel === 'small_craft_advisory') {
    score += 15;
  } else if (weather.advisoryLevel === 'gale_warning') {
    score += 25;
  } else if (weather.advisoryLevel === 'storm_warning') {
    score += 40;
  }

  // Clamp score
  score = Math.min(100, Math.max(0, score));

  // Determine level
  let level: SailingRiskLevel;
  if (score <= 30) {
    level = 'low';
  } else if (score <= 55) {
    level = 'moderate';
  } else {
    level = 'elevated';
  }

  // Build reason string
  let reason: string | null = null;
  if (reasons.length > 0 && score > 25) {
    reason = reasons.slice(0, 2).join(', ');
  }

  return {
    score,
    level,
    reason,
    directionAffected,
    windRelation: weather.windSpeed >= WIND_THRESHOLDS.MODERATE ? windRelation.relation : null,
  };
}

/**
 * Get risk level display properties
 */
export function getSailingRiskDisplay(level: SailingRiskLevel): {
  label: string;
  className: string;
  bgClassName: string;
} {
  switch (level) {
    case 'low':
      return {
        label: 'Low',
        className: 'text-success',
        bgClassName: 'bg-success-muted/50 border-success/30',
      };
    case 'moderate':
      return {
        label: 'Moderate',
        className: 'text-warning',
        bgClassName: 'bg-warning-muted/50 border-warning/30',
      };
    case 'elevated':
      return {
        label: 'Elevated',
        className: 'text-accent',
        bgClassName: 'bg-accent-muted/50 border-accent/30',
      };
  }
}

/**
 * Get direction impact description for display
 */
export function getDirectionImpactDescription(
  sailing: Sailing,
  windRelation: SailingRisk['windRelation'],
  windCompass: CompassDirection
): string | null {
  if (!windRelation) return null;

  const destination = sailing.direction.to;

  switch (windRelation) {
    case 'headwind':
      return `Strong ${windCompass} winds opposing ${destination}-bound crossing`;
    case 'crosswind':
      return `${windCompass} crosswind affects ${destination}-bound sailings`;
    case 'tailwind':
      return `Favorable ${windCompass} tailwind for ${destination}-bound crossing`;
    default:
      return null;
  }
}
