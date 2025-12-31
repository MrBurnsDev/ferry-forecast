/**
 * Prediction Engine v2
 *
 * Phase 32: Forecast Modeling
 *
 * Versioned prediction logic that uses multi-day forecast data to predict
 * sailing outcomes. This replaces the current weather-only scoring with
 * a more sophisticated approach that can be A/B tested and improved.
 *
 * DESIGN PRINCIPLES:
 * - Versioned: Each change creates a new version for comparison
 * - Heuristic-based: Start with simple rules, add ML later
 * - Explainable: Always provide human-readable reasons
 * - Direction-aware: Wind relation affects risk differently
 *
 * MODEL VERSIONS:
 * - v2.0.0: Initial forecast-based model
 */

import { createServerClient } from '@/lib/supabase/client';
import type { ForecastHour } from '@/lib/weather/open-meteo';

// Current model version
export const MODEL_VERSION = 'v2.0.0';

// Risk level enum with more granular levels
export type RiskLevelV2 = 'low' | 'moderate' | 'elevated' | 'high' | 'severe';

// Confidence levels
export type ConfidenceLevel = 'low' | 'medium' | 'high';

// Wind relation types
export type WindRelation = 'headwind' | 'crosswind' | 'tailwind';

// Route bearings for wind relation calculation (degrees from true north)
const ROUTE_BEARINGS: Record<string, Record<string, number>> = {
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
  'hyannis': {
    'nantucket': 135,      // SE
    'vineyard-haven': 225, // SW
  },
  'nantucket': {
    'hyannis': 315,        // NW
  },
};

// Thresholds for v2.0.0
const V2_THRESHOLDS = {
  // Wind speed thresholds (mph)
  wind: {
    low: 15,           // Below this is low risk
    moderate: 20,      // Above this is moderate
    elevated: 25,      // Above this is elevated
    high: 30,          // Above this is high
    severe: 40,        // Above this is severe (likely cancellation)
  },
  // Gust thresholds (mph) - gusts add extra risk
  gusts: {
    moderate: 25,
    elevated: 35,
    high: 45,
    severe: 55,
  },
  // Wave height thresholds (feet)
  waves: {
    low: 3,
    moderate: 5,
    elevated: 7,
    high: 10,
  },
  // Visibility thresholds (miles)
  visibility: {
    low: 5,
    moderate: 2,
    elevated: 1,
    high: 0.5,
  },
  // Advisory level modifiers
  advisoryModifiers: {
    none: 0,
    small_craft_advisory: 15,
    gale_warning: 35,
    storm_warning: 60,
    hurricane_warning: 100,
  },
  // Wind relation modifiers (crosswinds are worse for ferries)
  windRelationModifiers: {
    tailwind: -5,      // Slightly easier
    headwind: 5,       // Slightly harder
    crosswind: 15,     // Much harder
  },
};

// Prediction result
export interface PredictionResult {
  riskScore: number;           // 0-100
  riskLevel: RiskLevelV2;
  confidence: ConfidenceLevel;
  explanation: string[];
  primaryFactor: string;
  windRelation: WindRelation | null;
  modelVersion: string;
  hoursAhead: number;
  forecastData: {
    windSpeed: number | null;
    windGusts: number | null;
    windDirection: number | null;
    waveHeight: number | null;
    visibility: number | null;
    advisoryLevel: string | null;
  };
}

/**
 * Calculate wind relation to route
 */
function calculateWindRelation(
  windDirection: number | null,
  fromPort: string,
  toPort: string
): WindRelation | null {
  if (windDirection === null) return null;

  const routeBearing = ROUTE_BEARINGS[fromPort]?.[toPort];
  if (routeBearing === undefined) return null;

  // Calculate relative angle between wind and route
  // Wind direction is where wind comes FROM
  // Route bearing is where boat is GOING
  let relativeAngle = Math.abs(windDirection - routeBearing);
  if (relativeAngle > 180) {
    relativeAngle = 360 - relativeAngle;
  }

  // Headwind: wind opposing direction of travel (135-180 degrees relative)
  if (relativeAngle >= 135) {
    return 'headwind';
  }

  // Tailwind: wind in same direction as travel (0-45 degrees relative)
  if (relativeAngle <= 45) {
    return 'tailwind';
  }

  // Crosswind: wind perpendicular to travel (45-135 degrees relative)
  return 'crosswind';
}

/**
 * Convert risk score to risk level
 */
function scoreToLevel(score: number): RiskLevelV2 {
  if (score >= 80) return 'severe';
  if (score >= 60) return 'high';
  if (score >= 40) return 'elevated';
  if (score >= 20) return 'moderate';
  return 'low';
}

/**
 * Calculate confidence based on data availability and forecast horizon
 */
function calculateConfidence(
  forecast: ForecastHour | null,
  hoursAhead: number
): ConfidenceLevel {
  if (!forecast) return 'low';

  // Reduce confidence for longer forecasts
  if (hoursAhead > 168) return 'low';   // > 7 days
  if (hoursAhead > 72) return 'medium'; // > 3 days

  // Check data completeness
  const hasWind = forecast.windSpeed10mMph !== null;
  const hasGusts = forecast.windGustsMph !== null;
  const hasWaves = forecast.waveHeightFt !== null;

  if (!hasWind) return 'low';
  if (hasWind && hasGusts && hasWaves) return 'high';
  if (hasWind && hasGusts) return 'medium';

  return 'medium';
}

/**
 * Generate prediction for a sailing based on forecast data
 */
export function generatePrediction(
  forecast: ForecastHour | null,
  fromPort: string,
  toPort: string,
  sailingTime: Date,
  predictedAt: Date = new Date()
): PredictionResult {
  const hoursAhead = Math.round((sailingTime.getTime() - predictedAt.getTime()) / (1000 * 60 * 60));
  const explanation: string[] = [];
  let score = 0;
  let primaryFactor = 'calm_conditions';

  // Calculate wind relation
  const windRelation = forecast
    ? calculateWindRelation(forecast.windDirectionDeg, fromPort, toPort)
    : null;

  if (!forecast) {
    return {
      riskScore: 25,
      riskLevel: 'moderate',
      confidence: 'low',
      explanation: ['No forecast data available'],
      primaryFactor: 'unknown',
      windRelation: null,
      modelVersion: MODEL_VERSION,
      hoursAhead,
      forecastData: {
        windSpeed: null,
        windGusts: null,
        windDirection: null,
        waveHeight: null,
        visibility: null,
        advisoryLevel: null,
      },
    };
  }

  // Wind speed scoring
  const windSpeed = forecast.windSpeed10mMph ?? 0;
  if (windSpeed >= V2_THRESHOLDS.wind.severe) {
    score += 50;
    explanation.push(`Severe winds (${windSpeed} mph) - likely cancellation`);
    primaryFactor = 'severe_wind';
  } else if (windSpeed >= V2_THRESHOLDS.wind.high) {
    score += 35;
    explanation.push(`High winds (${windSpeed} mph)`);
    if (primaryFactor === 'calm_conditions') primaryFactor = 'high_wind';
  } else if (windSpeed >= V2_THRESHOLDS.wind.elevated) {
    score += 25;
    explanation.push(`Elevated winds (${windSpeed} mph)`);
    if (primaryFactor === 'calm_conditions') primaryFactor = 'elevated_wind';
  } else if (windSpeed >= V2_THRESHOLDS.wind.moderate) {
    score += 15;
    explanation.push(`Moderate winds (${windSpeed} mph)`);
    if (primaryFactor === 'calm_conditions') primaryFactor = 'moderate_wind';
  } else if (windSpeed >= V2_THRESHOLDS.wind.low) {
    score += 5;
  }

  // Wind gusts scoring
  const gusts = forecast.windGustsMph ?? 0;
  if (gusts >= V2_THRESHOLDS.gusts.severe) {
    score += 25;
    explanation.push(`Severe gusts (${gusts} mph)`);
    if (primaryFactor === 'calm_conditions') primaryFactor = 'severe_gusts';
  } else if (gusts >= V2_THRESHOLDS.gusts.high) {
    score += 15;
    explanation.push(`High gusts (${gusts} mph)`);
    if (primaryFactor === 'calm_conditions') primaryFactor = 'high_gusts';
  } else if (gusts >= V2_THRESHOLDS.gusts.elevated) {
    score += 10;
    explanation.push(`Elevated gusts (${gusts} mph)`);
  } else if (gusts >= V2_THRESHOLDS.gusts.moderate) {
    score += 5;
  }

  // Wave height scoring
  const waves = forecast.waveHeightFt ?? 0;
  if (waves >= V2_THRESHOLDS.waves.high) {
    score += 20;
    explanation.push(`High waves (${waves} ft)`);
    if (primaryFactor === 'calm_conditions') primaryFactor = 'high_waves';
  } else if (waves >= V2_THRESHOLDS.waves.elevated) {
    score += 12;
    explanation.push(`Elevated waves (${waves} ft)`);
  } else if (waves >= V2_THRESHOLDS.waves.moderate) {
    score += 6;
    explanation.push(`Moderate waves (${waves} ft)`);
  } else if (waves >= V2_THRESHOLDS.waves.low) {
    score += 2;
  }

  // Visibility scoring
  const visibility = forecast.visibilityMiles ?? 10;
  if (visibility <= V2_THRESHOLDS.visibility.high) {
    score += 15;
    explanation.push(`Very low visibility (${visibility} mi)`);
    if (primaryFactor === 'calm_conditions') primaryFactor = 'low_visibility';
  } else if (visibility <= V2_THRESHOLDS.visibility.elevated) {
    score += 10;
    explanation.push(`Low visibility (${visibility} mi)`);
  } else if (visibility <= V2_THRESHOLDS.visibility.moderate) {
    score += 5;
    explanation.push(`Reduced visibility (${visibility} mi)`);
  }

  // Advisory level modifier
  const advisoryLevel = forecast.advisoryLevel ?? 'none';
  const advisoryMod = V2_THRESHOLDS.advisoryModifiers[advisoryLevel as keyof typeof V2_THRESHOLDS.advisoryModifiers] ?? 0;
  if (advisoryMod > 0) {
    score += advisoryMod;
    explanation.push(`${advisoryLevel.replace(/_/g, ' ')} in effect`);
    if (advisoryMod >= 35) {
      primaryFactor = advisoryLevel;
    }
  }

  // Wind relation modifier
  if (windRelation && windSpeed >= V2_THRESHOLDS.wind.low) {
    const relationMod = V2_THRESHOLDS.windRelationModifiers[windRelation];
    score += relationMod;
    if (windRelation === 'crosswind') {
      explanation.push('Crosswinds increase difficulty');
    } else if (windRelation === 'headwind') {
      explanation.push('Headwinds slow progress');
    } else {
      explanation.push('Tailwinds provide favorable conditions');
    }
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // If no risk factors, add positive explanation
  if (explanation.length === 0) {
    explanation.push('Favorable conditions expected');
  }

  const confidence = calculateConfidence(forecast, hoursAhead);

  return {
    riskScore: Math.round(score),
    riskLevel: scoreToLevel(score),
    confidence,
    explanation,
    primaryFactor,
    windRelation,
    modelVersion: MODEL_VERSION,
    hoursAhead,
    forecastData: {
      windSpeed: forecast.windSpeed10mMph,
      windGusts: forecast.windGustsMph,
      windDirection: forecast.windDirectionDeg,
      waveHeight: forecast.waveHeightFt,
      visibility: forecast.visibilityMiles,
      advisoryLevel: forecast.advisoryLevel,
    },
  };
}

/**
 * Persist a prediction to the database
 */
export async function persistPrediction(
  prediction: PredictionResult,
  corridorId: string,
  routeId: string,
  sailingTime: Date,
  serviceDate: string,
  departureTimeLocal: string,
  forecastSnapshotId?: string
): Promise<string | null> {
  const supabase = createServerClient();
  if (!supabase) {
    console.error('[PREDICTION] Supabase client is null');
    return null;
  }

  const record = {
    corridor_id: corridorId,
    route_id: routeId,
    sailing_time: sailingTime.toISOString(),
    service_date: serviceDate,
    departure_time_local: departureTimeLocal,
    predicted_at: new Date().toISOString(),
    risk_score: prediction.riskScore,
    risk_level: prediction.riskLevel,
    confidence: prediction.confidence,
    explanation: prediction.explanation,
    primary_factor: prediction.primaryFactor,
    forecast_snapshot_id: forecastSnapshotId || null,
    wind_speed_used: prediction.forecastData.windSpeed,
    wind_gusts_used: prediction.forecastData.windGusts,
    wind_direction_used: prediction.forecastData.windDirection,
    wind_relation: prediction.windRelation,
    wave_height_used: prediction.forecastData.waveHeight,
    advisory_level_used: prediction.forecastData.advisoryLevel,
    model_version: prediction.modelVersion,
    hours_ahead: prediction.hoursAhead,
  };

  const { data, error } = await supabase
    .from('prediction_snapshots_v2')
    .insert(record)
    .select('id')
    .single();

  if (error) {
    console.error('[PREDICTION] Insert error:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Get the latest prediction for a sailing
 */
export async function getLatestPrediction(
  routeId: string,
  sailingTime: Date
): Promise<PredictionResult | null> {
  const supabase = createServerClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('prediction_snapshots_v2')
    .select('*')
    .eq('route_id', routeId)
    .eq('sailing_time', sailingTime.toISOString())
    .order('predicted_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    riskScore: data.risk_score,
    riskLevel: data.risk_level as RiskLevelV2,
    confidence: data.confidence as ConfidenceLevel,
    explanation: data.explanation || [],
    primaryFactor: data.primary_factor,
    windRelation: data.wind_relation as WindRelation | null,
    modelVersion: data.model_version,
    hoursAhead: data.hours_ahead,
    forecastData: {
      windSpeed: data.wind_speed_used,
      windGusts: data.wind_gusts_used,
      windDirection: data.wind_direction_used,
      waveHeight: data.wave_height_used,
      visibility: null,
      advisoryLevel: data.advisory_level_used,
    },
  };
}

/**
 * Link a prediction to its outcome
 */
export async function linkPredictionToOutcome(
  predictionId: string,
  sailingEventId: string
): Promise<boolean> {
  const supabase = createServerClient();
  if (!supabase) {
    return false;
  }

  // Call the database function
  const { error } = await supabase.rpc('link_prediction_to_outcome', {
    p_prediction_id: predictionId,
    p_sailing_event_id: sailingEventId,
  });

  if (error) {
    console.error('[PREDICTION] Failed to link outcome:', error);
    return false;
  }

  return true;
}
