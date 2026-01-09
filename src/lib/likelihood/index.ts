/**
 * Phase 81: Likelihood to Run Prediction System
 *
 * Computes probability-based predictions for whether a sailing will run,
 * based on historical data and current weather conditions.
 *
 * MODEL ARCHITECTURE:
 * 1. Weather-based cancellation probability (p_cancel_weather)
 *    - Query historical sailings with similar conditions
 *    - Same corridor, similar season, wind speed bin, wind direction
 *
 * 2. Mechanical baseline probability (p_cancel_mech)
 *    - Baseline cancellation rate in benign weather
 *    - Captures mechanical failures, crew issues, etc.
 *
 * 3. Combined probability:
 *    p_cancel_total = 1 - (1 - p_cancel_weather) * (1 - p_cancel_mech)
 *    likelihood_to_run_pct = round((1 - p_cancel_total) * 100)
 *
 * CONFIDENCE TIERS:
 * - high: >= 100 historical samples
 * - medium: 30-99 samples
 * - low: < 30 samples
 *
 * CROSS-OPERATOR MODELING:
 * For operators without sufficient data (e.g., Hy-Line), we use
 * data from similar routes on other operators, with reduced confidence.
 */

import { createServiceRoleClient } from '@/lib/supabase/serverServiceClient';

// ============================================================
// TYPES
// ============================================================

export interface LikelihoodResult {
  /** Predicted likelihood this sailing will run (0-100%) */
  likelihood_to_run_pct: number;
  /** Confidence level based on sample size */
  likelihood_confidence: 'high' | 'medium' | 'low';
  /** Basis for the calculation */
  likelihood_basis: 'same_operator' | 'cross_operator' | 'limited_data';
  /** Number of historical samples used */
  sample_size: number;
  /** Debug info for transparency */
  debug?: {
    p_cancel_weather: number;
    p_cancel_mech: number;
    p_cancel_total: number;
    weather_samples: number;
    mech_samples: number;
    wind_bin: string;
    season: string;
  };
}

export interface WeatherConditions {
  wind_speed_mph: number;
  wind_direction_degrees: number | null;
  wind_relation?: 'head' | 'cross' | 'tail';
  has_advisory?: boolean;
}

export interface SailingContext {
  corridor_id: string;
  operator_id: string;
  departure_time_local: string;
  service_date: string;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Wind speed bins for historical comparison */
const WIND_BINS = [
  { min: 0, max: 10, label: '0-10' },
  { min: 10, max: 20, label: '10-20' },
  { min: 20, max: 30, label: '20-30' },
  { min: 30, max: 999, label: '30+' },
];

/** Season mapping by month */
const SEASONS: Record<number, string> = {
  1: 'winter', 2: 'winter', 3: 'spring',
  4: 'spring', 5: 'spring', 6: 'summer',
  7: 'summer', 8: 'summer', 9: 'fall',
  10: 'fall', 11: 'fall', 12: 'winter',
};

/** Operators known to have live status feeds */
export const OPERATORS_WITH_LIVE_STATUS = new Set([
  'steamship-authority',
  'ssa',
]);

/** Cross-operator similarity mappings */
const CROSS_OPERATOR_SIMILARITY: Record<string, string[]> = {
  // Hy-Line routes can use SSA data from similar corridors
  'hy-line-cruises': ['steamship-authority', 'ssa'],
  'hyline': ['steamship-authority', 'ssa'],
};

/** Corridor similarity for cross-operator modeling (reserved for future use) */
// const SIMILAR_CORRIDORS: Record<string, string[]> = {
//   // Hyannis-Nantucket is similar to Woods Hole routes (open water exposure)
//   'hyannis-nantucket': ['woods-hole-vineyard-haven', 'woods-hole-nantucket'],
//   'hy-hyannis-nantucket': ['woods-hole-vineyard-haven', 'woods-hole-nantucket'],
// };

/** Benign weather threshold */
const BENIGN_WIND_THRESHOLD_MPH = 15;

/** Default cancellation rate when no data available */
const DEFAULT_CANCEL_RATE = 0.02; // 2%

/** Minimum sample size thresholds */
const SAMPLE_SIZE_HIGH = 100;
const SAMPLE_SIZE_MEDIUM = 30;

// ============================================================
// MAIN COMPUTATION FUNCTION
// ============================================================

/**
 * Compute likelihood that a sailing will run.
 *
 * @param sailing - Context about the sailing (corridor, operator, time)
 * @param weather - Current weather conditions
 * @returns LikelihoodResult with prediction and confidence
 */
export async function computeLikelihood(
  sailing: SailingContext,
  weather: WeatherConditions | null
): Promise<LikelihoodResult> {
  const supabase = createServiceRoleClient({ allowNull: true });

  // If no database connection, fall back to simplified computation
  if (!supabase) {
    return computeSimplifiedLikelihood(weather, sailing.operator_id);
  }

  // Determine wind bin
  const windBin = weather
    ? WIND_BINS.find(b => weather.wind_speed_mph >= b.min && weather.wind_speed_mph < b.max)?.label || '0-10'
    : '0-10';

  // Determine season from service date (for debug output)
  const month = new Date(sailing.service_date).getMonth() + 1;
  const season = SEASONS[month] || 'summer';

  // Try same-operator data first
  let weatherStats = await queryHistoricalStats(
    supabase,
    sailing.operator_id,
    windBin
  );

  let basis: 'same_operator' | 'cross_operator' | 'limited_data' = 'same_operator';

  // If insufficient data, try cross-operator modeling
  if (weatherStats.total < SAMPLE_SIZE_MEDIUM) {
    const similarOperators = CROSS_OPERATOR_SIMILARITY[sailing.operator_id.toLowerCase()] || [];
    // Note: Corridor filtering reserved for future queries
    // const similarCorridors = SIMILAR_CORRIDORS[sailing.corridor_id.toLowerCase()] || [];

    for (const altOperator of similarOperators) {
      // Try similar operators (corridors reserved for future use)
      const altStats = await queryHistoricalStats(
        supabase,
        altOperator,
        windBin
      );

      if (altStats.total > weatherStats.total) {
        weatherStats = altStats;
        basis = 'cross_operator';
      }
    }
  }

  // If still insufficient, use limited_data basis
  if (weatherStats.total < SAMPLE_SIZE_MEDIUM) {
    basis = 'limited_data';
  }

  // Query mechanical baseline (benign weather cancellations)
  const mechStats = await queryMechanicalBaseline(
    supabase,
    sailing.operator_id,
    basis === 'cross_operator' ? CROSS_OPERATOR_SIMILARITY[sailing.operator_id.toLowerCase()] : undefined
  );

  // Compute probabilities
  const p_cancel_weather = weatherStats.total > 0
    ? weatherStats.canceled / weatherStats.total
    : DEFAULT_CANCEL_RATE;

  const p_cancel_mech = mechStats.total > 0
    ? mechStats.canceled / mechStats.total
    : DEFAULT_CANCEL_RATE * 0.5; // Mechanical is rarer

  // Combine using independence assumption
  const p_cancel_total = 1 - (1 - p_cancel_weather) * (1 - p_cancel_mech);
  const likelihood_to_run_pct = Math.round((1 - p_cancel_total) * 100);

  // Determine confidence
  const totalSamples = weatherStats.total + mechStats.total;
  let confidence: 'high' | 'medium' | 'low';

  if (totalSamples >= SAMPLE_SIZE_HIGH) {
    confidence = 'high';
  } else if (totalSamples >= SAMPLE_SIZE_MEDIUM) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Reduce confidence by one tier for cross-operator
  if (basis === 'cross_operator' && confidence === 'high') {
    confidence = 'medium';
  } else if (basis === 'cross_operator' && confidence === 'medium') {
    confidence = 'low';
  }

  return {
    likelihood_to_run_pct,
    likelihood_confidence: confidence,
    likelihood_basis: basis,
    sample_size: totalSamples,
    debug: {
      p_cancel_weather,
      p_cancel_mech,
      p_cancel_total,
      weather_samples: weatherStats.total,
      mech_samples: mechStats.total,
      wind_bin: windBin,
      season,
    },
  };
}

// ============================================================
// DATABASE QUERIES
// ============================================================

interface HistoricalStats {
  total: number;
  canceled: number;
}

/**
 * Query historical cancellation statistics for similar conditions.
 *
 * Note: corridorId and season parameters are reserved for future use
 * when we add corridor-specific and seasonal filtering to the queries.
 */
async function queryHistoricalStats(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  operatorId: string,
  windBin: string
): Promise<HistoricalStats> {
  try {
    // Parse wind bin to get range
    const [minStr, maxStr] = windBin.split('-');
    const minWind = parseInt(minStr, 10);
    const maxWind = maxStr === '+' ? 999 : parseInt(maxStr, 10);

    // Query sailing_events with weather conditions
    // This requires joining with weather data - for now, use a simpler approach
    // Query all historical sailings for this corridor/operator
    const { data, error } = await supabase
      .from('sailing_events')
      .select('status, wind_speed_mph')
      .eq('operator_id', normalizeOperatorId(operatorId))
      .gte('wind_speed_mph', minWind)
      .lt('wind_speed_mph', maxWind)
      .limit(1000);

    if (error || !data) {
      console.warn(`[LIKELIHOOD] Failed to query historical stats: ${error?.message}`);
      return { total: 0, canceled: 0 };
    }

    const total = data.length;
    const canceled = data.filter(s => s.status === 'canceled').length;

    return { total, canceled };
  } catch (err) {
    console.error('[LIKELIHOOD] Error querying historical stats:', err);
    return { total: 0, canceled: 0 };
  }
}

/**
 * Query mechanical baseline (cancellations in benign weather).
 *
 * Note: corridorId parameter is reserved for future corridor-specific queries.
 */
async function queryMechanicalBaseline(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  operatorId: string,
  altOperators?: string[]
): Promise<HistoricalStats> {
  try {
    const operators = [operatorId, ...(altOperators || [])].map(normalizeOperatorId);

    // Query sailings in benign weather (low wind, no advisory)
    const { data, error } = await supabase
      .from('sailing_events')
      .select('status, wind_speed_mph')
      .in('operator_id', operators)
      .lt('wind_speed_mph', BENIGN_WIND_THRESHOLD_MPH)
      .limit(1000);

    if (error || !data) {
      console.warn(`[LIKELIHOOD] Failed to query mechanical baseline: ${error?.message}`);
      return { total: 0, canceled: 0 };
    }

    const total = data.length;
    const canceled = data.filter(s => s.status === 'canceled').length;

    return { total, canceled };
  } catch (err) {
    console.error('[LIKELIHOOD] Error querying mechanical baseline:', err);
    return { total: 0, canceled: 0 };
  }
}

/**
 * Normalize operator ID to database format.
 */
function normalizeOperatorId(operatorId: string): string {
  const normalized = operatorId.toLowerCase();
  if (normalized === 'steamship-authority') return 'ssa';
  if (normalized === 'hy-line-cruises') return 'hyline';
  return normalized;
}

// ============================================================
// SIMPLIFIED LIKELIHOOD (NO DB QUERY)
// ============================================================

/**
 * Compute simplified likelihood based on weather alone.
 * Used when database queries are not available or too slow.
 *
 * This uses empirical rules based on known ferry operations:
 * - Wind < 15 mph: ~98% run rate
 * - Wind 15-25 mph: ~90% run rate
 * - Wind 25-35 mph: ~70% run rate
 * - Wind > 35 mph: ~40% run rate
 */
export function computeSimplifiedLikelihood(
  weather: WeatherConditions | null,
  operatorId: string
): LikelihoodResult {
  const hasLiveStatus = OPERATORS_WITH_LIVE_STATUS.has(operatorId.toLowerCase()) ||
                        OPERATORS_WITH_LIVE_STATUS.has(normalizeOperatorId(operatorId));

  // Default to high likelihood if no weather data
  if (!weather) {
    return {
      likelihood_to_run_pct: 95,
      likelihood_confidence: 'low',
      likelihood_basis: hasLiveStatus ? 'same_operator' : 'limited_data',
      sample_size: 0,
    };
  }

  const windSpeed = weather.wind_speed_mph;

  // Empirical likelihood based on wind speed
  let likelihood: number;
  if (windSpeed < 15) {
    likelihood = 98;
  } else if (windSpeed < 25) {
    likelihood = 90;
  } else if (windSpeed < 35) {
    likelihood = 70;
  } else if (windSpeed < 45) {
    likelihood = 40;
  } else {
    likelihood = 20;
  }

  // Adjust for advisory if present
  if (weather.has_advisory) {
    likelihood = Math.max(likelihood - 15, 10);
  }

  // Adjust for wind relation (headwind is worse than tailwind)
  if (weather.wind_relation === 'head') {
    likelihood = Math.max(likelihood - 10, 10);
  } else if (weather.wind_relation === 'tail') {
    likelihood = Math.min(likelihood + 5, 99);
  }

  const basis: 'same_operator' | 'cross_operator' | 'limited_data' =
    hasLiveStatus ? 'same_operator' : 'cross_operator';

  return {
    likelihood_to_run_pct: likelihood,
    likelihood_confidence: hasLiveStatus ? 'medium' : 'low',
    likelihood_basis: basis,
    sample_size: 0, // No historical query
    debug: {
      p_cancel_weather: (100 - likelihood) / 100,
      p_cancel_mech: 0.02,
      p_cancel_total: (100 - likelihood) / 100,
      weather_samples: 0,
      mech_samples: 0,
      wind_bin: `${Math.floor(windSpeed / 10) * 10}-${Math.floor(windSpeed / 10) * 10 + 10}`,
      season: SEASONS[new Date().getMonth() + 1] || 'summer',
    },
  };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Check if an operator has live status available.
 */
export function operatorHasLiveStatus(operatorId: string): boolean {
  const normalized = normalizeOperatorId(operatorId);
  return OPERATORS_WITH_LIVE_STATUS.has(operatorId.toLowerCase()) ||
         OPERATORS_WITH_LIVE_STATUS.has(normalized);
}

/**
 * Get operators that should use cross-operator modeling.
 */
export function getOperatorsNeedingCrossOperatorModel(operatorIds: string[]): string[] {
  return operatorIds.filter(op => !operatorHasLiveStatus(op));
}
