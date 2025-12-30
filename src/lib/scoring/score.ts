// ============================================================================
// DETERMINISTIC SCORING ENGINE - Weather-Only Predictions
// ============================================================================
//
// SCORING PHILOSOPHY:
// - Score 0-30: Low risk - conditions favorable, disruptions unlikely
// - Score 31-60: Moderate risk - some concerning factors, monitor conditions
// - Score 61-100: High risk - significant factors present, disruptions likely
//
// The engine is fully deterministic - same inputs always produce same outputs.
// This allows for transparency, debugging, and user trust.
//
// ============================================================================
// LEARNING BOUNDARY - CRITICAL ARCHITECTURAL NOTE
// ============================================================================
//
// CURRENT STATE (v1.0):
// - Predictions are based ONLY on weather data (wind, gusts, advisories, tides)
// - Scoring uses FIXED weights defined in weights.ts
// - NO learning, ML, or adaptive behavior is active
// - NO outcome data is used in predictions
//
// DATA COLLECTION (active but not used):
// - Outcome logs are being collected via /api/outcomes/log
// - This data will enable FUTURE accuracy analysis
// - The historicalMatches parameter exists but receives no data currently
//
// FUTURE STATE (not yet implemented):
// - Offline analysis will compare predictions vs. actual outcomes
// - Weight adjustments may be derived from accuracy metrics
// - Any model changes will be explicit, versioned, and announced
//
// WHY THIS MATTERS:
// - Users see weather-based predictions, not learned patterns
// - No false claims of "AI" or "learning" should be made
// - Transparency builds trust
//
// ============================================================================

import type {
  FerryRoute,
  WeatherSnapshot,
  TideSwing,
  DisruptionHistory,
  ScoringResult,
  ContributingFactor,
  ConfidenceRating,
  AdvisoryLevel,
} from '@/types/forecast';

import {
  DEFAULT_WEIGHTS,
  WIND_THRESHOLDS,
  GUST_THRESHOLDS,
  TIDE_THRESHOLDS,
  CONFIDENCE_THRESHOLDS,
  MODEL_VERSION,
  DIRECTION_SENSITIVITY,
  VESSEL_CLASS_DEFAULTS,
  OPERATOR_DEFAULTS,
} from './weights';

import {
  calculateExposureModifier,
  getRouteExposure,
  degreesToCompassBucket,
} from '@/lib/config/exposure';

/**
 * Scoring Input for Weather-Only MVP
 *
 * The scoring engine uses these inputs:
 * - route: crossing type (open_water/protected) and bearing for wind direction impact
 * - weather: wind speed, gusts, direction, advisory level
 * - tide: swing height (if available)
 * - historicalMatches: past disruptions in similar conditions (future use)
 * - dataPointCount: number of data sources available (affects confidence)
 *
 * NOTE: Vessel-specific thresholds are NOT used in the MVP.
 * The engine uses fixed thresholds from VESSEL_CLASS_DEFAULTS.traditional_ferry
 */
export interface ScoringInput {
  route: FerryRoute;
  weather: WeatherSnapshot;
  tide?: TideSwing;
  historicalMatches?: DisruptionHistory[];
  dataPointCount?: number;
}

/**
 * Calculate wind direction impact based on route bearing
 * Returns a multiplier 0.75-1.5 based on how the wind affects the crossing
 */
function calculateDirectionImpact(
  windDirection: number,
  routeBearing: number
): { multiplier: number; description: string } {
  // Calculate the relative wind angle to the route
  let relativeAngle = Math.abs(windDirection - routeBearing);
  if (relativeAngle > 180) {
    relativeAngle = 360 - relativeAngle;
  }

  // Headwind (within 45 degrees of directly opposing)
  if (relativeAngle > 180 - DIRECTION_SENSITIVITY.HEADWIND_RANGE) {
    return {
      multiplier: DIRECTION_SENSITIVITY.HEADWIND_MULTIPLIER,
      description: 'Headwind conditions',
    };
  }

  // Crosswind (within 45 degrees of beam)
  if (
    relativeAngle > 90 - DIRECTION_SENSITIVITY.CROSSWIND_RANGE / 2 &&
    relativeAngle < 90 + DIRECTION_SENSITIVITY.CROSSWIND_RANGE / 2
  ) {
    return {
      multiplier: DIRECTION_SENSITIVITY.CROSSWIND_MULTIPLIER,
      description: 'Crosswind conditions',
    };
  }

  // Tailwind (favorable)
  if (relativeAngle < DIRECTION_SENSITIVITY.HEADWIND_RANGE) {
    return {
      multiplier: DIRECTION_SENSITIVITY.TAILWIND_MULTIPLIER,
      description: 'Favorable tailwind',
    };
  }

  // Quartering wind
  return {
    multiplier: 1.0,
    description: 'Quartering wind',
  };
}

/**
 * Get advisory level weight
 */
function getAdvisoryWeight(level: AdvisoryLevel): number {
  switch (level) {
    case 'hurricane_warning':
      return DEFAULT_WEIGHTS.hurricane_warning;
    case 'storm_warning':
      return DEFAULT_WEIGHTS.storm_warning;
    case 'gale_warning':
      return DEFAULT_WEIGHTS.gale_warning;
    case 'small_craft_advisory':
      return DEFAULT_WEIGHTS.small_craft_advisory;
    default:
      return 0;
  }
}

/**
 * Get weather threshold modifiers for scoring
 * Weather-Only MVP: Uses fixed defaults based on traditional ferry class
 * These thresholds represent conservative estimates for general ferry operations
 */
function getWeatherModifiers(): {
  windLimit: number;
  gustLimit: number;
  dirSensitivity: number;
  advSensitivity: number;
} {
  // Weather-only MVP uses fixed traditional ferry defaults
  // These are conservative thresholds suitable for most ferry types
  const defaults = VESSEL_CLASS_DEFAULTS.traditional_ferry;
  return {
    windLimit: defaults.wind_limit,
    gustLimit: defaults.gust_limit,
    dirSensitivity: defaults.directional_sensitivity,
    advSensitivity: defaults.advisory_sensitivity,
  };
}

/**
 * Calculate historical pattern match score
 */
function calculateHistoricalScore(
  weather: WeatherSnapshot,
  history?: DisruptionHistory[]
): { score: number; matchCount: number; description: string } {
  if (!history || history.length === 0) {
    return { score: 0, matchCount: 0, description: 'No historical data' };
  }

  // Find similar conditions in history
  const similarConditions = history.filter((h) => {
    if (!h.weather_conditions) return false;

    const windDiff = Math.abs(
      h.weather_conditions.wind_speed - weather.wind_speed
    );
    const gustDiff = Math.abs(
      h.weather_conditions.wind_gusts - weather.wind_gusts
    );

    // Consider similar if within 10 mph of current conditions
    return windDiff <= 10 && gustDiff <= 15;
  });

  if (similarConditions.length === 0) {
    return { score: 0, matchCount: 0, description: 'No similar conditions' };
  }

  // Calculate disruption rate in similar conditions
  const totalSailings = similarConditions.reduce(
    (sum, h) => sum + h.scheduled_sailings,
    0
  );
  const disruptedSailings = similarConditions.reduce(
    (sum, h) => sum + h.delayed_sailings + h.canceled_sailings,
    0
  );

  if (totalSailings === 0) {
    return { score: 0, matchCount: 0, description: 'Insufficient data' };
  }

  const disruptionRate = disruptedSailings / totalSailings;
  const score = Math.min(
    DEFAULT_WEIGHTS.historical_match,
    Math.round(disruptionRate * 40)
  );

  return {
    score,
    matchCount: similarConditions.length,
    description: `${Math.round(disruptionRate * 100)}% disruption in similar conditions`,
  };
}

/**
 * Determine confidence rating based on data availability
 */
function determineConfidence(
  dataPointCount: number,
  historicalMatches: number
): ConfidenceRating {
  if (
    dataPointCount >= CONFIDENCE_THRESHOLDS.HIGH_MIN_DATA_POINTS &&
    historicalMatches >= CONFIDENCE_THRESHOLDS.HIGH_HISTORICAL_MATCHES
  ) {
    return 'high';
  }

  if (
    dataPointCount >= CONFIDENCE_THRESHOLDS.MEDIUM_MIN_DATA_POINTS &&
    historicalMatches >= CONFIDENCE_THRESHOLDS.MEDIUM_HISTORICAL_MATCHES
  ) {
    return 'medium';
  }

  return 'low';
}

/**
 * Main scoring function - calculates disruption risk
 */
export function calculateRiskScore(input: ScoringInput): ScoringResult {
  const factors: ContributingFactor[] = [];
  let baseScore = 0;

  // Weather-only MVP: Use fixed thresholds (no vessel-specific modifiers)
  const weatherMods = getWeatherModifiers();

  // 1. Advisory Level (highest priority, mutually exclusive)
  const advisoryWeight =
    getAdvisoryWeight(input.weather.advisory_level) *
    weatherMods.advSensitivity;
  if (advisoryWeight > 0) {
    baseScore += advisoryWeight;
    factors.push({
      factor: 'advisory',
      description: `${input.weather.advisory_level.replace(/_/g, ' ')} in effect`,
      weight: advisoryWeight,
      value: input.weather.advisory_level,
    });
  }

  // 2. Wind Speed Impact
  const directionImpact = calculateDirectionImpact(
    input.weather.wind_direction,
    input.route.bearing_degrees
  );

  // Sustained wind >= 30 mph
  if (input.weather.wind_speed >= WIND_THRESHOLDS.SEVERE) {
    const windScore =
      DEFAULT_WEIGHTS.sustained_wind_30 *
      directionImpact.multiplier *
      weatherMods.dirSensitivity;
    baseScore += windScore;
    factors.push({
      factor: 'high_wind',
      description: `Sustained winds of ${input.weather.wind_speed} mph`,
      weight: windScore,
      value: input.weather.wind_speed,
    });
  }
  // Wind >= 20 mph with unfavorable direction
  else if (
    input.weather.wind_speed >= WIND_THRESHOLDS.SIGNIFICANT &&
    directionImpact.multiplier > 1.0
  ) {
    const windScore =
      DEFAULT_WEIGHTS.unfavorable_wind_20 *
      directionImpact.multiplier *
      weatherMods.dirSensitivity;
    baseScore += windScore;
    factors.push({
      factor: 'unfavorable_wind',
      description: `${input.weather.wind_speed} mph winds with ${directionImpact.description.toLowerCase()}`,
      weight: windScore,
      value: `${input.weather.wind_speed} mph ${directionImpact.description}`,
    });
  }

  // 3. Gust Impact (additive if significant)
  if (input.weather.wind_gusts >= GUST_THRESHOLDS.SEVERE) {
    const gustPenalty = Math.min(
      15,
      (input.weather.wind_gusts - GUST_THRESHOLDS.SIGNIFICANT) * 0.5
    );
    baseScore += gustPenalty * weatherMods.dirSensitivity;
    factors.push({
      factor: 'gusts',
      description: `Wind gusts to ${input.weather.wind_gusts} mph`,
      weight: gustPenalty,
      value: input.weather.wind_gusts,
    });
  }

  // 4. Tide Impact
  if (input.tide && input.tide.swing_feet >= TIDE_THRESHOLDS.EXTREME) {
    const tideScore = Math.min(
      DEFAULT_WEIGHTS.extreme_tide_swing,
      (input.tide.swing_feet - TIDE_THRESHOLDS.NORMAL) * 2
    );
    baseScore += tideScore;
    factors.push({
      factor: 'tide',
      description: `Extreme tide swing of ${input.tide.swing_feet.toFixed(1)} feet`,
      weight: tideScore,
      value: input.tide.swing_feet,
    });
  }

  // 4b. Route Exposure Impact (computed from coastline geometry)
  // This replaces simple crossing_type logic with physics-based exposure scores
  const routeExposure = getRouteExposure(input.route.route_id);
  if (routeExposure && input.weather.wind_speed >= WIND_THRESHOLDS.MODERATE) {
    // Get exposure modifier for this wind direction
    // Bounded to [-10, +15] points to prevent dominating the score
    const exposureModifier = calculateExposureModifier(
      input.route.route_id,
      input.weather.wind_direction
    );

    if (exposureModifier !== 0) {
      baseScore += exposureModifier;

      // Determine wind direction bucket for description
      const windDir = degreesToCompassBucket(input.weather.wind_direction);
      const exposureValue = routeExposure.exposure_by_dir[windDir];

      if (exposureModifier > 0) {
        factors.push({
          factor: 'route_exposure',
          description: `Route exposed to ${windDir} winds (fetch: ${routeExposure.fetch_km_by_dir[windDir]}km)`,
          weight: exposureModifier,
          value: exposureValue,
        });
      } else {
        factors.push({
          factor: 'route_shelter',
          description: `Route sheltered from ${windDir} winds`,
          weight: exposureModifier,
          value: exposureValue,
        });
      }
    }
  } else if (input.route.crossing_type === 'open_water' && input.weather.wind_speed >= WIND_THRESHOLDS.MODERATE) {
    // Fallback for routes without computed exposure data
    const exposureScore = Math.min(10, Math.round(input.weather.wind_speed / 5));
    baseScore += exposureScore;
    factors.push({
      factor: 'exposure',
      description: 'Open water crossing (more exposed to conditions)',
      weight: exposureScore,
      value: input.route.crossing_type,
    });
  }

  // 5. Historical Pattern Matching
  const historicalResult = calculateHistoricalScore(
    input.weather,
    input.historicalMatches
  );
  if (historicalResult.score > 0) {
    baseScore += historicalResult.score;
    factors.push({
      factor: 'historical',
      description: historicalResult.description,
      weight: historicalResult.score,
      value: historicalResult.matchCount,
    });
  }

  // Apply operator behavior modifier
  const operatorConfig =
    OPERATOR_DEFAULTS[input.route.operator as keyof typeof OPERATOR_DEFAULTS];
  if (operatorConfig) {
    baseScore *= operatorConfig.conservative_factor;
  }

  // Clamp score to 0-100
  const finalScore = Math.min(100, Math.max(0, Math.round(baseScore)));

  // Determine confidence
  const confidence = determineConfidence(
    input.dataPointCount || 0,
    historicalResult.matchCount
  );

  // Sort factors by weight descending
  factors.sort((a, b) => b.weight - a.weight);

  return {
    score: finalScore,
    confidence,
    factors,
    model_version: MODEL_VERSION,
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Get risk level label from score
 */
export function getRiskLevel(score: number): {
  label: string;
  color: string;
  level: 'low' | 'moderate' | 'high';
} {
  if (score <= 30) {
    return { label: 'Low Risk', color: 'green', level: 'low' };
  }
  if (score <= 60) {
    return { label: 'Moderate Risk', color: 'yellow', level: 'moderate' };
  }
  return { label: 'High Risk', color: 'red', level: 'high' };
}

// ============================================
// LEARNING HOOKS - For Future ML Integration
// ============================================
//
// IMPORTANT: These functions exist for FUTURE use.
// They are NOT currently integrated into the prediction pipeline.
//
// Purpose:
// - createScoringSnapshot: Creates a record of prediction + inputs
// - evaluatePrediction: Compares prediction to actual outcome
// - These will be used in OFFLINE analysis, not live inference
//
// Current Status: INACTIVE
// Future Status: Will be used for weight tuning after data collection

/**
 * Snapshot the current scoring state for later analysis
 * This creates a record that can be compared against actual outcomes
 *
 * NOTE: This is infrastructure for future learning, not active functionality.
 */
export interface ScoringSnapshot {
  input: ScoringInput;
  result: ScoringResult;
  timestamp: string;
  // Will be filled in later when outcome is known
  actual_outcome?: 'on_time' | 'delayed' | 'canceled';
  outcome_timestamp?: string;
}

/**
 * Create a snapshot for learning purposes
 * In production, these would be stored and later correlated with actual outcomes
 */
export function createScoringSnapshot(
  input: ScoringInput,
  result: ScoringResult
): ScoringSnapshot {
  return {
    input,
    result,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compare prediction to actual outcome
 * Returns accuracy metrics that can be used to tune weights
 */
export function evaluatePrediction(
  snapshot: ScoringSnapshot,
  actualOutcome: 'on_time' | 'delayed' | 'canceled'
): {
  wasAccurate: boolean;
  predictedRisk: 'low' | 'moderate' | 'high';
  actualSeverity: 'none' | 'minor' | 'major';
  scoreDelta: number;
} {
  const riskLevel = getRiskLevel(snapshot.result.score);

  const actualSeverity = actualOutcome === 'on_time'
    ? 'none'
    : actualOutcome === 'delayed'
      ? 'minor'
      : 'major';

  // Determine if prediction was accurate
  // Low risk + on_time = accurate
  // Moderate risk + delayed = accurate
  // High risk + canceled = accurate
  const wasAccurate =
    (riskLevel.level === 'low' && actualOutcome === 'on_time') ||
    (riskLevel.level === 'moderate' && actualOutcome === 'delayed') ||
    (riskLevel.level === 'high' && actualOutcome === 'canceled');

  // Calculate how far off the prediction was
  const expectedScore = actualOutcome === 'on_time' ? 15
    : actualOutcome === 'delayed' ? 45
    : 80;
  const scoreDelta = snapshot.result.score - expectedScore;

  return {
    wasAccurate,
    predictedRisk: riskLevel.level,
    actualSeverity,
    scoreDelta,
  };
}

/**
 * Get model info for transparency
 */
export function getModelInfo(): {
  version: string;
  weights: typeof DEFAULT_WEIGHTS;
  thresholds: {
    wind: typeof WIND_THRESHOLDS;
    gust: typeof GUST_THRESHOLDS;
    tide: typeof TIDE_THRESHOLDS;
  };
} {
  return {
    version: MODEL_VERSION,
    weights: DEFAULT_WEIGHTS,
    thresholds: {
      wind: WIND_THRESHOLDS,
      gust: GUST_THRESHOLDS,
      tide: TIDE_THRESHOLDS,
    },
  };
}
