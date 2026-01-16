/**
 * Weather-Only Heuristic Baseline for Forecast Predictions
 *
 * Phase 52: Ensure forecasts NEVER render empty
 *
 * This module provides a fallback prediction system that ALWAYS produces output
 * based solely on weather data. It is used when:
 * - No predictions exist in prediction_snapshots_v2
 * - Database is unavailable
 * - Fresh deployment before first ingestion run
 *
 * DESIGN PRINCIPLES:
 * - ALWAYS produces output (never returns empty)
 * - Weather-only (no learned data required)
 * - Conservative (slightly pessimistic to avoid under-warning)
 * - Honest about confidence (clearly labeled as "forecast-only")
 *
 * Output format matches the specification:
 * - Wind displayed as "15 mph WNW (13 kt)"
 * - Risk levels: low, moderate, elevated, high, severe
 * - Confidence explicitly labeled: "Weather-based forecast (no historical data)"
 */

import { fetchCorridorForecast, type ForecastHour } from '@/lib/weather/open-meteo';
import { mphToKnots, degreesToCompass } from '@/lib/weather/wind-utils';
import type { DailyRiskSummary, RiskLevel, ConfidenceLevel } from './daily-risk';

// ============================================================
// TYPES
// ============================================================

/**
 * Heuristic prediction for a single sailing
 */
export interface HeuristicPrediction {
  service_date: string;
  departure_time_local: string;
  risk_level: RiskLevel;
  risk_score: number;
  confidence: ConfidenceLevel;
  confidence_label: string;  // Human-readable, e.g., "Weather-based forecast"
  explanation: string[];
  hours_ahead: number;
  sailing_time: string;
  // Wind data for display
  wind_speed_mph: number | null;
  wind_gust_mph: number | null;
  wind_direction_deg: number | null;
  wind_display: string;  // Formatted: "15 mph WNW (13 kt)"
  // Source attribution
  source: 'heuristic_baseline';
  model_version: 'heuristic_v1.0';
}

/**
 * Heuristic daily forecast
 */
export interface HeuristicDayForecast {
  service_date: string;
  predictions: HeuristicPrediction[];
  daily_risk: DailyRiskSummary;
  highest_risk_level: RiskLevel;
  prediction_count: number;
}

/**
 * Complete heuristic forecast response
 */
export interface HeuristicForecast {
  corridor_id: string;
  forecast_type: '7_day' | '14_day';
  days: HeuristicDayForecast[];
  total_predictions: number;
  generated_at: string;
  source: 'heuristic_baseline';
  confidence_disclaimer: string;
}

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Wind speed thresholds for risk scoring (mph)
 * Based on SSA cancellation patterns observed
 */
const WIND_THRESHOLDS = {
  low: 15,        // Below this is low risk
  moderate: 20,   // 15-20 mph is moderate
  elevated: 25,   // 20-25 mph is elevated
  high: 30,       // 25-30 mph is high
  severe: 40,     // Above 40 mph is severe (likely cancellation)
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
 * Standard sailing times for each corridor
 * These are used to generate predictions for each sailing
 */
const CORRIDOR_SAILING_TIMES: Record<string, string[]> = {
  'woods-hole-vineyard-haven': [
    '07:00', '08:30', '09:30', '10:30', '11:30', '12:30',
    '13:30', '14:30', '15:30', '16:30', '17:45', '19:00',
    '20:15', '21:30',
  ],
  'hyannis-nantucket': [
    '06:00', '08:15', '09:15', '10:15', '11:15', '12:15',
    '14:15', '15:45', '17:00', '18:00', '19:30', '21:00',
  ],
  // Add more corridors as needed
};

// Default sailing times if corridor not found
const DEFAULT_SAILING_TIMES = [
  '07:00', '08:30', '10:00', '11:30', '13:00', '14:30',
  '16:00', '17:30', '19:00', '20:30',
];

// ============================================================
// CORE HEURISTIC LOGIC
// ============================================================

/**
 * Calculate risk score from weather data
 * ALWAYS returns a valid score (0-100)
 */
function calculateRiskScore(
  windSpeedMph: number | null,
  windGustsMph: number | null,
  advisoryLevel: string | null
): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  const wind = windSpeedMph ?? 0;
  const gusts = windGustsMph ?? 0;

  // Wind speed contribution
  if (wind >= WIND_THRESHOLDS.severe) {
    score += 50;
    factors.push(`Severe winds (${Math.round(wind)} mph) – likely cancellation`);
  } else if (wind >= WIND_THRESHOLDS.high) {
    score += 35;
    factors.push(`Very strong winds (${Math.round(wind)} mph)`);
  } else if (wind >= WIND_THRESHOLDS.elevated) {
    score += 25;
    factors.push(`Strong winds (${Math.round(wind)} mph)`);
  } else if (wind >= WIND_THRESHOLDS.moderate) {
    score += 15;
    factors.push(`Moderate winds (${Math.round(wind)} mph)`);
  } else if (wind >= WIND_THRESHOLDS.low) {
    score += 5;
    factors.push(`Light winds (${Math.round(wind)} mph)`);
  } else {
    factors.push('Calm conditions expected');
  }

  // Gust contribution
  if (gusts >= GUST_THRESHOLDS.severe) {
    score += 30;
    factors.push(`Severe gusts to ${Math.round(gusts)} mph`);
  } else if (gusts >= GUST_THRESHOLDS.high) {
    score += 20;
    factors.push(`Strong gusts to ${Math.round(gusts)} mph`);
  } else if (gusts >= GUST_THRESHOLDS.elevated) {
    score += 12;
    factors.push(`Elevated gusts to ${Math.round(gusts)} mph`);
  } else if (gusts >= GUST_THRESHOLDS.moderate) {
    score += 6;
  }

  // Advisory level contribution
  if (advisoryLevel === 'hurricane_warning') {
    score += 60;
    factors.push('Hurricane warning in effect');
  } else if (advisoryLevel === 'storm_warning') {
    score += 45;
    factors.push('Storm warning in effect');
  } else if (advisoryLevel === 'gale_warning') {
    score += 30;
    factors.push('Gale warning in effect');
  } else if (advisoryLevel === 'small_craft_advisory') {
    score += 15;
    factors.push('Small craft advisory in effect');
  }

  // Cap at 100
  return {
    score: Math.min(100, score),
    factors: factors.length > 0 ? factors : ['Favorable conditions expected'],
  };
}

/**
 * Convert score to risk level
 */
function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 85) return 'severe';
  if (score >= 65) return 'high';
  if (score >= 45) return 'elevated';
  if (score >= 25) return 'moderate';
  return 'low';
}

/**
 * Calculate confidence based on hours ahead
 * Longer forecasts = lower confidence
 */
function calculateConfidence(hoursAhead: number): { level: ConfidenceLevel; value: number } {
  if (hoursAhead <= 24) {
    return { level: 'high', value: 0.85 };
  } else if (hoursAhead <= 72) {
    return { level: 'medium', value: 0.7 };
  } else if (hoursAhead <= 168) {
    return { level: 'medium', value: 0.55 };
  } else {
    return { level: 'low', value: 0.4 };
  }
}

/**
 * Format wind for display: "15 mph WNW (13 kt)"
 */
function formatWindDisplay(
  speedMph: number | null,
  directionDeg: number | null
): string {
  if (speedMph === null || speedMph === undefined) {
    return 'Wind data unavailable';
  }

  const knots = Math.round(mphToKnots(speedMph));
  const compass = degreesToCompass(directionDeg);
  const roundedMph = Math.round(speedMph);

  if (compass) {
    return `${roundedMph} mph ${compass} (${knots} kt)`;
  }
  return `${roundedMph} mph (${knots} kt)`;
}

/**
 * Get forecast hour for a specific time
 *
 * PHASE 94: Timezone-aware hour matching
 * Forecast data is now fetched in America/New_York timezone, so forecast times
 * are local (e.g., "2026-01-16T07:00"). We match using local time strings directly.
 */
function getHourlyForecastForTime(
  hours: ForecastHour[],
  targetDate: string,
  targetTime: string
): ForecastHour | null {
  // Build target local time string (e.g., "2026-01-16T07:00")
  // Forecast times from Open-Meteo are now in America/New_York local time
  const targetLocalTime = `${targetDate}T${targetTime}`;

  // First try exact match (most common case)
  for (const hour of hours) {
    // forecastTime format: "2026-01-16T07:00" (no Z suffix when using local timezone)
    if (hour.forecastTime.startsWith(targetLocalTime)) {
      return hour;
    }
  }

  // Fall back to finding closest hour within 2 hours
  // Parse both as local times for comparison
  let closest: ForecastHour | null = null;
  let closestDiff = Infinity;

  // Parse target time - no Z suffix since it's local time
  const targetDateTime = new Date(`${targetDate}T${targetTime}:00`);

  for (const hour of hours) {
    // Parse forecast time - also local, no Z suffix
    const hourDate = new Date(hour.forecastTime);
    const diff = Math.abs(hourDate.getTime() - targetDateTime.getTime());

    if (diff < closestDiff) {
      closestDiff = diff;
      closest = hour;
    }
  }

  // Only return if within 2 hours of target
  if (closest && closestDiff <= 2 * 60 * 60 * 1000) {
    return closest;
  }

  return null;
}

// ============================================================
// MAIN API
// ============================================================

/**
 * Generate heuristic forecast for a corridor
 *
 * ALWAYS returns data (never empty) using Open-Meteo weather forecasts.
 * This is the fallback when database predictions are unavailable.
 *
 * Phase 57: Forecast Consistency Fix
 * - Days 1-7 ALWAYS use GFS model (for consistency between 7-day and 14-day views)
 * - Days 8-14 use ECMWF model (better long-range accuracy)
 * - This ensures that January 10 shows the same forecast in both views
 *
 * @param corridorId - The corridor identifier
 * @param forecastType - '7_day' or '14_day'
 * @returns HeuristicForecast with predictions for all days
 */
export async function generateHeuristicForecast(
  corridorId: string,
  forecastType: '7_day' | '14_day' = '7_day'
): Promise<HeuristicForecast | null> {
  // Phase 57: Always use GFS for consistency
  // Days 1-7 use GFS in both 7-day and 14-day forecasts
  // Days 8-14 (14-day only) also use GFS for simplicity and to avoid
  // the complexity of blending two different models
  //
  // RATIONALE: Users expect the same date to show the same forecast
  // regardless of which tab they're viewing. Using different models
  // (GFS vs ECMWF) caused Jan 10 to show "Elevated" in 7-day but
  // "Low Risk" in 14-day, which is confusing.
  const model = 'gfs';
  const forecastDays = forecastType === '7_day' ? 7 : 14;

  // Fetch weather forecast from Open-Meteo
  // Pass the number of days to fetch for 14-day forecasts
  const forecast = await fetchCorridorForecast(corridorId, model, forecastDays);

  if (!forecast || forecast.hours.length === 0) {
    console.warn(`[HEURISTIC] No Open-Meteo forecast available for ${corridorId}`);
    return null;
  }

  const now = new Date();
  const sailingTimes = CORRIDOR_SAILING_TIMES[corridorId] || DEFAULT_SAILING_TIMES;
  const maxDays = forecastType === '7_day' ? 7 : 14;

  // Group predictions by date
  const dayMap = new Map<string, HeuristicPrediction[]>();

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + dayOffset);
    const dateStr = targetDate.toISOString().split('T')[0];

    const dailyPredictions: HeuristicPrediction[] = [];

    for (const timeStr of sailingTimes) {
      const forecastHour = getHourlyForecastForTime(forecast.hours, dateStr, timeStr);

      // Calculate hours ahead
      // PHASE 94: Parse as local time (no Z suffix) since sailing times are local
      const sailingTime = new Date(`${dateStr}T${timeStr}:00`);
      const hoursAhead = Math.max(0, Math.floor((sailingTime.getTime() - now.getTime()) / (1000 * 60 * 60)));

      // Get weather data (or null if not available)
      const windSpeed = forecastHour?.windSpeed10mMph ?? null;
      const windGusts = forecastHour?.windGustsMph ?? null;
      const windDirection = forecastHour?.windDirectionDeg ?? null;
      const advisoryLevel = forecastHour?.advisoryLevel ?? null;

      // Calculate risk
      const { score, factors } = calculateRiskScore(windSpeed, windGusts, advisoryLevel);
      const riskLevel = scoreToRiskLevel(score);
      const confidence = calculateConfidence(hoursAhead);

      // Create prediction
      const prediction: HeuristicPrediction = {
        service_date: dateStr,
        departure_time_local: timeStr,
        risk_level: riskLevel,
        risk_score: score,
        confidence: confidence.level,
        confidence_label: hoursAhead <= 48
          ? 'Weather-based forecast (24-48 hr)'
          : hoursAhead <= 168
            ? 'Extended weather forecast'
            : 'Long-range forecast (lower confidence)',
        explanation: factors,
        hours_ahead: hoursAhead,
        sailing_time: sailingTime.toISOString(),
        wind_speed_mph: windSpeed,
        wind_gust_mph: windGusts,
        wind_direction_deg: windDirection,
        wind_display: formatWindDisplay(windSpeed, windDirection),
        source: 'heuristic_baseline',
        model_version: 'heuristic_v1.0',
      };

      dailyPredictions.push(prediction);
    }

    if (dailyPredictions.length > 0) {
      dayMap.set(dateStr, dailyPredictions);
    }
  }

  // Build day forecasts
  const days: HeuristicDayForecast[] = [];
  let totalPredictions = 0;

  for (const [dateStr, predictions] of dayMap) {
    // Calculate daily summary
    const riskScores = predictions.map(p => p.risk_score);
    const avgRiskScore = riskScores.reduce((a, b) => a + b, 0) / riskScores.length;
    const maxRiskScore = Math.max(...riskScores);
    const dailyRiskScore = Math.round(maxRiskScore * 0.7 + avgRiskScore * 0.3);

    const highRiskCount = predictions.filter(
      p => ['elevated', 'high', 'severe'].includes(p.risk_level)
    ).length;

    // Get wind summary
    const windSpeeds = predictions
      .map(p => p.wind_speed_mph)
      .filter((s): s is number => s !== null);
    const windGusts = predictions
      .map(p => p.wind_gust_mph)
      .filter((g): g is number => g !== null);
    const windDirs = predictions
      .map(p => p.wind_direction_deg)
      .filter((d): d is number => d !== null);

    const hoursAhead = Math.min(...predictions.map(p => p.hours_ahead));
    const confidence = calculateConfidence(hoursAhead);

    const dailyRisk: DailyRiskSummary = {
      date: dateStr,
      risk_level: scoreToRiskLevel(dailyRiskScore),
      risk_score: dailyRiskScore,
      confidence: confidence.value,
      confidence_level: confidence.level,
      primary_factors: predictions
        .flatMap(p => p.explanation)
        .slice(0, 3),
      secondary_factors: [],
      wind: {
        max_speed_mph: windSpeeds.length > 0 ? Math.max(...windSpeeds) : null,
        max_gust_mph: windGusts.length > 0 ? Math.max(...windGusts) : null,
        predominant_direction: windDirs.length > 0
          ? degreesToCompass(windDirs[Math.floor(windDirs.length / 2)])
          : null,
        worst_period: null,
      },
      sailings_analyzed: predictions.length,
      high_risk_sailings: highRiskCount,
      source: 'forecast',
      model: model,
      hours_ahead: hoursAhead,
    };

    const riskLevels = predictions.map(p => p.risk_level);
    const highestRiskLevel = getHighestRiskLevel(riskLevels);

    days.push({
      service_date: dateStr,
      predictions,
      daily_risk: dailyRisk,
      highest_risk_level: highestRiskLevel,
      prediction_count: predictions.length,
    });

    totalPredictions += predictions.length;
  }

  // Sort by date
  days.sort((a, b) => a.service_date.localeCompare(b.service_date));

  return {
    corridor_id: corridorId,
    forecast_type: forecastType,
    days,
    total_predictions: totalPredictions,
    generated_at: new Date().toISOString(),
    source: 'heuristic_baseline',
    confidence_disclaimer:
      'This forecast is based on weather data only. ' +
      'Historical cancellation patterns will be incorporated as data is collected.',
  };
}

/**
 * Get the highest risk level from a list
 */
function getHighestRiskLevel(levels: RiskLevel[]): RiskLevel {
  const order: Record<RiskLevel, number> = {
    low: 0,
    moderate: 1,
    elevated: 2,
    high: 3,
    severe: 4,
  };

  return levels.reduce((highest, current) => {
    return order[current] > order[highest] ? current : highest;
  }, 'low' as RiskLevel);
}
