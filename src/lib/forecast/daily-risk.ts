/**
 * Daily Cancellation Risk Engine
 *
 * Phase 51: Cancellation Forecast UI + Prediction Layer
 *
 * Aggregates per-sailing predictions into daily risk summaries.
 * Computes daily cancellation risk from forecast data (Open-Meteo).
 *
 * Output format:
 * {
 *   "date": "2026-01-07",
 *   "risk_level": "moderate",
 *   "confidence": 0.62,
 *   "primary_factors": ["Sustained WNW winds", "Forecast gusts exceed historical cancellation median"]
 * }
 */

import { formatWindRiskDescription, degreesToCompass } from '@/lib/weather/wind-utils';

// ============================================================
// TYPES
// ============================================================

/**
 * Risk levels from least to most severe
 */
export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'severe';

/**
 * Confidence levels for predictions
 */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/**
 * Daily cancellation risk summary
 */
export interface DailyRiskSummary {
  date: string;                    // ISO date (YYYY-MM-DD)
  risk_level: RiskLevel;
  risk_score: number;              // 0-100
  confidence: number;              // 0-1
  confidence_level: ConfidenceLevel;
  primary_factors: string[];       // Human-readable factor descriptions
  secondary_factors: string[];     // Less significant factors

  // Wind summary for the day
  wind: {
    max_speed_mph: number | null;
    max_gust_mph: number | null;
    predominant_direction: string | null;  // Compass direction
    worst_period: string | null;            // "Morning", "Afternoon", "Evening"
  };

  // Sailing-level predictions aggregated
  sailings_analyzed: number;
  high_risk_sailings: number;      // Count of sailings with elevated+ risk

  // Source attribution
  source: 'forecast';              // Always 'forecast' for predictions
  model: 'gfs' | 'ecmwf' | null;  // Which weather model
  hours_ahead: number;             // How far in the future
}

/**
 * Input prediction from prediction_snapshots_v2
 */
export interface PredictionInput {
  service_date: string;
  departure_time_local: string;
  risk_level: string;
  risk_score: number;
  confidence: string;
  explanation: string[];
  model_version: string;
  hours_ahead: number;
  sailing_time: string;

  // Weather data (if available)
  wind_speed_mph?: number | null;
  wind_gust_mph?: number | null;
  wind_direction_deg?: number | null;
}

/**
 * Forecast hour data for risk calculation
 */
export interface ForecastHourInput {
  forecastTime: string;
  model: 'gfs' | 'ecmwf';
  windSpeed10mMph: number | null;
  windGustsMph: number | null;
  windDirectionDeg: number | null;
  waveHeightFt: number | null;
  advisoryLevel: string | null;
}

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Risk level thresholds (based on prediction engine v2)
 */
const RISK_THRESHOLDS = {
  low: 0,
  moderate: 25,
  elevated: 45,
  high: 65,
  severe: 85,
} as const;

/**
 * Wind speed thresholds for daily risk (mph)
 */
const WIND_THRESHOLDS = {
  low: 15,
  moderate: 20,
  elevated: 25,
  high: 30,
  severe: 40,
} as const;

/**
 * Gust thresholds (mph)
 */
const GUST_THRESHOLDS = {
  moderate: 25,
  elevated: 35,
  high: 45,
  severe: 55,
} as const;

/**
 * Time periods for worst-case analysis
 */
const TIME_PERIODS = {
  morning: { start: 6, end: 12 },
  afternoon: { start: 12, end: 18 },
  evening: { start: 18, end: 22 },
} as const;

// ============================================================
// DAILY RISK CALCULATION
// ============================================================

/**
 * Calculate daily risk summary from sailing predictions
 *
 * @param predictions - Array of per-sailing predictions for a single day
 * @returns DailyRiskSummary
 */
export function calculateDailyRiskFromPredictions(
  predictions: PredictionInput[]
): DailyRiskSummary {
  if (predictions.length === 0) {
    return createEmptyRiskSummary('unknown');
  }

  const date = predictions[0].service_date;

  // Aggregate risk scores
  const riskScores = predictions.map(p => p.risk_score);
  const avgRiskScore = riskScores.reduce((a, b) => a + b, 0) / riskScores.length;
  const maxRiskScore = Math.max(...riskScores);

  // Use weighted average: 70% max, 30% average
  const dailyRiskScore = Math.round(maxRiskScore * 0.7 + avgRiskScore * 0.3);

  // Count high-risk sailings
  const highRiskSailings = predictions.filter(
    p => ['elevated', 'high', 'severe'].includes(p.risk_level)
  ).length;

  // Aggregate confidence
  const confidenceValues = predictions.map(p => confidenceToNumber(p.confidence));
  const avgConfidence = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;

  // Aggregate wind data
  const windData = aggregateWindData(predictions);

  // Collect and prioritize factors
  const { primaryFactors, secondaryFactors } = aggregateFactors(predictions);

  // Determine hours ahead (use minimum)
  const hoursAhead = Math.min(...predictions.map(p => p.hours_ahead));

  // Determine model (prefer GFS for near-term, ECMWF for long-term)
  const model = hoursAhead <= 168 ? 'gfs' : 'ecmwf';

  return {
    date,
    risk_level: scoreToRiskLevel(dailyRiskScore),
    risk_score: dailyRiskScore,
    confidence: Math.round(avgConfidence * 100) / 100,
    confidence_level: numberToConfidenceLevel(avgConfidence),
    primary_factors: primaryFactors.slice(0, 3),
    secondary_factors: secondaryFactors.slice(0, 2),
    wind: windData,
    sailings_analyzed: predictions.length,
    high_risk_sailings: highRiskSailings,
    source: 'forecast',
    model,
    hours_ahead: hoursAhead,
  };
}

/**
 * Calculate daily risk directly from forecast hours
 * Used when per-sailing predictions are not yet generated
 *
 * @param date - ISO date string
 * @param forecastHours - Array of forecast hours for that day
 * @returns DailyRiskSummary
 */
export function calculateDailyRiskFromForecast(
  date: string,
  forecastHours: ForecastHourInput[]
): DailyRiskSummary {
  if (forecastHours.length === 0) {
    return createEmptyRiskSummary(date);
  }

  // Find peak wind conditions
  let maxWindSpeed = 0;
  let maxGust = 0;
  let worstHour: ForecastHourInput | null = null;
  const directions: number[] = [];

  for (const hour of forecastHours) {
    const wind = hour.windSpeed10mMph ?? 0;
    const gust = hour.windGustsMph ?? 0;

    if (wind > maxWindSpeed) {
      maxWindSpeed = wind;
      worstHour = hour;
    }
    if (gust > maxGust) {
      maxGust = gust;
    }
    if (hour.windDirectionDeg !== null) {
      directions.push(hour.windDirectionDeg);
    }
  }

  // Calculate risk score based on max conditions
  let riskScore = 0;
  const factors: string[] = [];

  // Wind speed contribution
  if (maxWindSpeed >= WIND_THRESHOLDS.severe) {
    riskScore += 50;
    factors.push(`Severe ${formatWindRiskDescription(maxWindSpeed, worstHour?.windDirectionDeg)}`);
  } else if (maxWindSpeed >= WIND_THRESHOLDS.high) {
    riskScore += 40;
    factors.push(`Very strong ${formatWindRiskDescription(maxWindSpeed, worstHour?.windDirectionDeg)}`);
  } else if (maxWindSpeed >= WIND_THRESHOLDS.elevated) {
    riskScore += 30;
    factors.push(`Strong ${formatWindRiskDescription(maxWindSpeed, worstHour?.windDirectionDeg)}`);
  } else if (maxWindSpeed >= WIND_THRESHOLDS.moderate) {
    riskScore += 20;
    factors.push(`Moderate ${formatWindRiskDescription(maxWindSpeed, worstHour?.windDirectionDeg)}`);
  } else if (maxWindSpeed >= WIND_THRESHOLDS.low) {
    riskScore += 10;
  }

  // Gust contribution
  if (maxGust >= GUST_THRESHOLDS.severe) {
    riskScore += 35;
    factors.push(`Severe gusts to ${Math.round(maxGust)} mph expected`);
  } else if (maxGust >= GUST_THRESHOLDS.high) {
    riskScore += 25;
    factors.push(`Strong gusts to ${Math.round(maxGust)} mph forecast`);
  } else if (maxGust >= GUST_THRESHOLDS.elevated) {
    riskScore += 15;
    factors.push(`Gusts to ${Math.round(maxGust)} mph possible`);
  } else if (maxGust >= GUST_THRESHOLDS.moderate) {
    riskScore += 10;
  }

  // Advisory contribution
  const hasAdvisory = forecastHours.some(h => h.advisoryLevel);
  if (hasAdvisory) {
    const advisories = [...new Set(forecastHours
      .filter(h => h.advisoryLevel)
      .map(h => h.advisoryLevel))];

    for (const advisory of advisories) {
      if (advisory === 'storm_warning') {
        riskScore += 40;
        factors.push('Storm warning in effect');
      } else if (advisory === 'gale_warning') {
        riskScore += 30;
        factors.push('Gale warning in effect');
      } else if (advisory === 'small_craft_advisory') {
        riskScore += 15;
        factors.push('Small craft advisory in effect');
      }
    }
  }

  // Cap at 100
  riskScore = Math.min(100, riskScore);

  // Calculate predominant direction
  const predominantDir = directions.length > 0
    ? degreesToCompass(averageDirection(directions))
    : null;

  // Determine worst period
  const worstPeriod = worstHour ? getTimePeriod(worstHour.forecastTime) : null;

  // Confidence based on hours ahead
  const hoursAhead = calculateHoursAhead(forecastHours[0].forecastTime);
  const confidence = hoursAhead <= 48 ? 0.85 : hoursAhead <= 120 ? 0.7 : 0.5;

  return {
    date,
    risk_level: scoreToRiskLevel(riskScore),
    risk_score: riskScore,
    confidence,
    confidence_level: numberToConfidenceLevel(confidence),
    primary_factors: factors.slice(0, 3),
    secondary_factors: [],
    wind: {
      max_speed_mph: Math.round(maxWindSpeed),
      max_gust_mph: Math.round(maxGust),
      predominant_direction: predominantDir,
      worst_period: worstPeriod,
    },
    sailings_analyzed: 0,
    high_risk_sailings: 0,
    source: 'forecast',
    model: forecastHours[0]?.model ?? null,
    hours_ahead: hoursAhead,
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Convert risk score to risk level
 */
function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.severe) return 'severe';
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.elevated) return 'elevated';
  if (score >= RISK_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

/**
 * Convert confidence string to number
 */
function confidenceToNumber(confidence: string): number {
  switch (confidence.toLowerCase()) {
    case 'high': return 0.85;
    case 'medium': return 0.65;
    case 'low': return 0.45;
    default: return 0.5;
  }
}

/**
 * Convert confidence number to level
 */
function numberToConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
}

/**
 * Aggregate wind data from predictions
 */
function aggregateWindData(predictions: PredictionInput[]): DailyRiskSummary['wind'] {
  const speeds = predictions
    .map(p => p.wind_speed_mph)
    .filter((s): s is number => s !== null && s !== undefined);

  const gusts = predictions
    .map(p => p.wind_gust_mph)
    .filter((g): g is number => g !== null && g !== undefined);

  const directions = predictions
    .map(p => p.wind_direction_deg)
    .filter((d): d is number => d !== null && d !== undefined);

  // Find worst hour based on departure time
  let worstPrediction: PredictionInput | null = null;
  let maxRisk = -1;
  for (const p of predictions) {
    if (p.risk_score > maxRisk) {
      maxRisk = p.risk_score;
      worstPrediction = p;
    }
  }

  return {
    max_speed_mph: speeds.length > 0 ? Math.max(...speeds) : null,
    max_gust_mph: gusts.length > 0 ? Math.max(...gusts) : null,
    predominant_direction: directions.length > 0
      ? degreesToCompass(averageDirection(directions))
      : null,
    worst_period: worstPrediction
      ? getTimePeriod(worstPrediction.departure_time_local)
      : null,
  };
}

/**
 * Aggregate factors from predictions with deduplication
 */
function aggregateFactors(predictions: PredictionInput[]): {
  primaryFactors: string[];
  secondaryFactors: string[];
} {
  const factorCounts = new Map<string, number>();

  for (const p of predictions) {
    for (const explanation of p.explanation) {
      // Normalize factor text
      const normalized = normalizeFactor(explanation);
      factorCounts.set(normalized, (factorCounts.get(normalized) || 0) + 1);
    }
  }

  // Sort by frequency
  const sorted = [...factorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([factor]) => factor);

  return {
    primaryFactors: sorted.slice(0, 3),
    secondaryFactors: sorted.slice(3, 5),
  };
}

/**
 * Normalize factor text for deduplication
 */
function normalizeFactor(factor: string): string {
  // Remove specific values, keep the type of factor
  return factor
    .replace(/\d+(\.\d+)?/g, 'N')  // Replace numbers with N
    .replace(/N mph/g, 'strong winds')
    .replace(/N kts/g, 'strong winds')
    .trim();
}

/**
 * Calculate average direction from array of degrees
 */
function averageDirection(directions: number[]): number {
  if (directions.length === 0) return 0;

  // Convert to unit vectors and average
  let sinSum = 0;
  let cosSum = 0;

  for (const deg of directions) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }

  const avgRad = Math.atan2(sinSum, cosSum);
  let avgDeg = (avgRad * 180) / Math.PI;

  // Normalize to 0-360
  if (avgDeg < 0) avgDeg += 360;

  return Math.round(avgDeg);
}

/**
 * Get time period from time string
 */
function getTimePeriod(timeStr: string): string | null {
  try {
    const date = new Date(timeStr);
    const hour = date.getHours();

    if (hour >= TIME_PERIODS.morning.start && hour < TIME_PERIODS.morning.end) {
      return 'Morning';
    }
    if (hour >= TIME_PERIODS.afternoon.start && hour < TIME_PERIODS.afternoon.end) {
      return 'Afternoon';
    }
    if (hour >= TIME_PERIODS.evening.start && hour < TIME_PERIODS.evening.end) {
      return 'Evening';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Calculate hours ahead from forecast time
 */
function calculateHoursAhead(forecastTime: string): number {
  const forecast = new Date(forecastTime);
  const now = new Date();
  return Math.floor((forecast.getTime() - now.getTime()) / (1000 * 60 * 60));
}

/**
 * Create empty risk summary for unavailable data
 */
function createEmptyRiskSummary(date: string): DailyRiskSummary {
  return {
    date,
    risk_level: 'low',
    risk_score: 0,
    confidence: 0,
    confidence_level: 'low',
    primary_factors: ['Forecast unavailable'],
    secondary_factors: [],
    wind: {
      max_speed_mph: null,
      max_gust_mph: null,
      predominant_direction: null,
      worst_period: null,
    },
    sailings_analyzed: 0,
    high_risk_sailings: 0,
    source: 'forecast',
    model: null,
    hours_ahead: 0,
  };
}

// ============================================================
// HUMAN-READABLE RISK DESCRIPTIONS
// ============================================================

/**
 * Generate human-readable risk description for UI
 *
 * @param summary - Daily risk summary
 * @returns Human-readable description string
 *
 * Examples:
 * - "Low cancellation risk"
 * - "Moderate cancellation risk – strong WNW winds likely"
 * - "High cancellation risk – severe gusts forecast, small craft advisory in effect"
 */
export function formatRiskDescription(summary: DailyRiskSummary): string {
  const riskLabels: Record<RiskLevel, string> = {
    low: 'Low cancellation risk',
    moderate: 'Moderate cancellation risk',
    elevated: 'Elevated cancellation risk',
    high: 'High cancellation risk',
    severe: 'Severe cancellation risk',
  };

  const baseLabel = riskLabels[summary.risk_level];

  if (summary.primary_factors.length === 0 ||
      summary.primary_factors[0] === 'Forecast unavailable') {
    return baseLabel;
  }

  // For low risk, no additional detail needed
  if (summary.risk_level === 'low') {
    return baseLabel;
  }

  // Add primary factor for moderate+ risk
  const primaryFactor = summary.primary_factors[0].toLowerCase();
  return `${baseLabel} – ${primaryFactor}`;
}

/**
 * Get CSS color class for risk level
 */
export function getRiskColorClass(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'low': return 'text-green-600';
    case 'moderate': return 'text-yellow-600';
    case 'elevated': return 'text-orange-500';
    case 'high': return 'text-red-600';
    case 'severe': return 'text-red-800';
  }
}

/**
 * Get CSS background class for risk level
 */
export function getRiskBgClass(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'low': return 'bg-green-50';
    case 'moderate': return 'bg-yellow-50';
    case 'elevated': return 'bg-orange-50';
    case 'high': return 'bg-red-50';
    case 'severe': return 'bg-red-100';
  }
}
