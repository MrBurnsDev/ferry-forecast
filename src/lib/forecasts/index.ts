/**
 * Forecast Data Access Layer
 *
 * Phase 33: 7-Day and 14-Day Travel Forecast UX
 * Phase 35: Forecast API Auth Hardening + Regression Guard
 * Phase 51: Cancellation Forecast UI + Prediction Layer
 * Phase 52: Ensure forecasts NEVER render empty
 *
 * Reads predictions from ferry_forecast.prediction_snapshots_v2
 * Falls back to weather-only heuristic baseline when no DB predictions exist.
 *
 * PHASE 52 CRITICAL REQUIREMENT:
 * - 7-day and 14-day forecasts must NEVER be empty
 * - If no DB predictions, use heuristic baseline from Open-Meteo
 * - Confidence labeling must be explicit and honest
 *
 * AUTHENTICATION:
 * Uses service role key (NOT anon key) because:
 * - prediction_snapshots_v2 has RLS policies blocking anon access
 * - Service role bypasses RLS for server-side API routes
 * - This file is only imported from API routes (server-side)
 *
 * IMPORTANT: Uses verified schema columns including wind data:
 * - service_date (date)
 * - departure_time_local (text)
 * - risk_level (text)
 * - risk_score (integer)
 * - confidence (text)
 * - explanation (text[])
 * - model_version (text)
 * - hours_ahead (integer)
 * - wind_speed_used (numeric) - Phase 51
 * - wind_gusts_used (numeric) - Phase 51
 * - wind_direction_used (integer) - Phase 51
 * - advisory_level_used (text) - Phase 51
 *
 * FORECAST LOGIC:
 * - 7-day forecast: hours_ahead <= 168
 * - 14-day forecast: hours_ahead <= 336
 */

import { createServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/serverServiceClient';
import {
  type DailyRiskSummary,
  calculateDailyRiskFromPredictions,
  type PredictionInput,
} from '@/lib/forecast/daily-risk';
import { generateHeuristicForecast } from '@/lib/forecast/heuristic-baseline';

/**
 * A single prediction row from prediction_snapshots_v2
 * Maps exactly to verified schema columns
 */
export interface ForecastPrediction {
  service_date: string;
  departure_time_local: string;
  risk_level: string;
  risk_score: number;
  confidence: string;
  explanation: string[];
  model_version: string;
  hours_ahead: number;
  sailing_time: string;
  // Phase 51: Wind data
  wind_speed_mph: number | null;
  wind_gust_mph: number | null;
  wind_direction_deg: number | null;
  advisory_level: string | null;
}

/**
 * Grouped forecast by date for UI display
 */
export interface DayForecast {
  service_date: string;
  predictions: ForecastPrediction[];
  highest_risk_level: string;
  prediction_count: number;
  // Phase 51: Daily risk summary
  daily_risk: DailyRiskSummary;
}

/**
 * Complete forecast response
 */
export interface CorridorForecast {
  corridor_id: string;
  forecast_type: '7_day' | '14_day';
  days: DayForecast[];
  total_predictions: number;
  generated_at: string;
  // Phase 51: Export DailyRiskSummary for UI consumption
  // Phase 52: Source attribution and confidence disclaimer
  source?: 'database' | 'heuristic_baseline';
  confidence_disclaimer?: string;
}

// Re-export DailyRiskSummary for API consumers
export type { DailyRiskSummary } from '@/lib/forecast/daily-risk';

// Hours ahead thresholds (per specification)
const SEVEN_DAY_HOURS = 168;
const FOURTEEN_DAY_HOURS = 336;

/**
 * Raw row type from prediction_snapshots_v2
 * Used for typing the Supabase query result
 */
interface PredictionRow {
  service_date: string;
  departure_time_local: string;
  risk_level: string;
  risk_score: number;
  confidence: string;
  explanation: string[] | null;
  model_version: string;
  hours_ahead: number;
  sailing_time: string;
  // Phase 51: Wind data columns
  wind_speed_used: number | null;
  wind_gusts_used: number | null;
  wind_direction_used: number | null;
  advisory_level_used: string | null;
}

/**
 * Risk level ordering for comparison
 */
const RISK_ORDER: Record<string, number> = {
  low: 0,
  moderate: 1,
  elevated: 2,
  high: 3,
  severe: 4,
};

/**
 * Get the highest risk level from a list
 */
function getHighestRiskLevel(levels: string[]): string {
  if (levels.length === 0) return 'low';
  return levels.reduce((highest, current) => {
    const currentOrder = RISK_ORDER[current] ?? 0;
    const highestOrder = RISK_ORDER[highest] ?? 0;
    return currentOrder > highestOrder ? current : highest;
  }, 'low');
}

/**
 * Fetch forecast predictions for a corridor
 *
 * @param corridorId - The corridor identifier
 * @param forecastType - '7_day' (hours_ahead <= 168) or '14_day' (hours_ahead <= 336)
 * @returns CorridorForecast with predictions grouped by date
 */
export async function getCorridorForecast(
  corridorId: string,
  forecastType: '7_day' | '14_day' = '7_day'
): Promise<CorridorForecast | null> {
  // Pre-flight check: Service role key must be configured
  // This is a REGRESSION GUARD - if this fails, the deployment is misconfigured
  if (!isServiceRoleConfigured()) {
    console.error(
      '[FORECAST] REGRESSION: SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
        'Forecast API cannot read prediction_snapshots_v2 without service role. ' +
        'Check Vercel environment variables.'
    );
    return null;
  }

  // Create service role client (bypasses RLS)
  // allowNull: true means we return null instead of throwing if missing
  const supabase = createServiceRoleClient({ allowNull: true });
  if (!supabase) {
    console.error('[FORECAST] Failed to create service role Supabase client');
    return null;
  }

  // Determine hours_ahead threshold based on forecast type
  const maxHoursAhead = forecastType === '7_day' ? SEVEN_DAY_HOURS : FOURTEEN_DAY_HOURS;

  // Query prediction_snapshots_v2 including Phase 51 wind data columns
  // Cast result to PredictionRow[] since we're using a generic client without schema types
  const { data, error } = await supabase
    .from('prediction_snapshots_v2')
    .select(`
      service_date,
      departure_time_local,
      risk_level,
      risk_score,
      confidence,
      explanation,
      model_version,
      hours_ahead,
      sailing_time,
      wind_speed_used,
      wind_gusts_used,
      wind_direction_used,
      advisory_level_used
    `)
    .eq('corridor_id', corridorId)
    .lte('hours_ahead', maxHoursAhead)
    .gte('hours_ahead', 0)
    .order('service_date', { ascending: true })
    .order('sailing_time', { ascending: true }) as { data: PredictionRow[] | null; error: { code?: string; message?: string } | null };

  if (error) {
    // Handle missing table or permission errors gracefully - return empty forecast
    // 42P01 = relation does not exist (table not found)
    // 42501 = permission denied (RLS or grants not configured)
    const isTableMissing = error.code === '42P01' || error.message?.includes('does not exist');
    const isPermissionDenied = error.code === '42501' || error.message?.includes('permission denied');

    if (isTableMissing || isPermissionDenied) {
      console.warn(`[FORECAST] ${isTableMissing ? 'Table not found' : 'Permission denied'} for prediction_snapshots_v2 - returning empty forecast`);
      return {
        corridor_id: corridorId,
        forecast_type: forecastType,
        days: [],
        total_predictions: 0,
        generated_at: new Date().toISOString(),
      };
    }
    console.error('[FORECAST] Query error:', error);
    return null;
  }

  if (!data || data.length === 0) {
    // Phase 52: No DB predictions available - use heuristic baseline
    // This ensures forecasts NEVER render empty
    console.log(
      `[FORECAST] No DB predictions for ${corridorId}, falling back to heuristic baseline`
    );

    const heuristicForecast = await generateHeuristicForecast(corridorId, forecastType);

    if (heuristicForecast) {
      // Convert heuristic forecast to CorridorForecast format
      return {
        corridor_id: corridorId,
        forecast_type: forecastType,
        days: heuristicForecast.days.map((day) => ({
          service_date: day.service_date,
          predictions: day.predictions.map((p) => ({
            service_date: p.service_date,
            departure_time_local: p.departure_time_local,
            risk_level: p.risk_level,
            risk_score: p.risk_score,
            confidence: p.confidence,
            explanation: p.explanation,
            model_version: p.model_version,
            hours_ahead: p.hours_ahead,
            sailing_time: p.sailing_time,
            wind_speed_mph: p.wind_speed_mph,
            wind_gust_mph: p.wind_gust_mph,
            wind_direction_deg: p.wind_direction_deg,
            advisory_level: null,
          })),
          highest_risk_level: day.highest_risk_level,
          prediction_count: day.prediction_count,
          daily_risk: day.daily_risk,
        })),
        total_predictions: heuristicForecast.total_predictions,
        generated_at: heuristicForecast.generated_at,
        // Phase 52: Add source attribution
        source: 'heuristic_baseline' as const,
        confidence_disclaimer: heuristicForecast.confidence_disclaimer,
      };
    }

    // If even heuristic fails, return empty (should rarely happen)
    console.error(`[FORECAST] Heuristic baseline also failed for ${corridorId}`);
    return {
      corridor_id: corridorId,
      forecast_type: forecastType,
      days: [],
      total_predictions: 0,
      generated_at: new Date().toISOString(),
    };
  }

  // Group predictions by service_date
  const dayMap = new Map<string, ForecastPrediction[]>();

  for (const row of data) {
    const prediction: ForecastPrediction = {
      service_date: row.service_date,
      departure_time_local: row.departure_time_local,
      risk_level: row.risk_level,
      risk_score: row.risk_score,
      confidence: row.confidence,
      explanation: row.explanation || [],
      model_version: row.model_version,
      hours_ahead: row.hours_ahead,
      sailing_time: row.sailing_time,
      // Phase 51: Add wind data
      wind_speed_mph: row.wind_speed_used,
      wind_gust_mph: row.wind_gusts_used,
      wind_direction_deg: row.wind_direction_used,
      advisory_level: row.advisory_level_used,
    };

    const existing = dayMap.get(row.service_date) || [];
    existing.push(prediction);
    dayMap.set(row.service_date, existing);
  }

  // Convert map to sorted array of DayForecast with daily risk summaries
  const days: DayForecast[] = [];
  for (const [serviceDate, predictions] of dayMap) {
    const riskLevels = predictions.map((p) => p.risk_level);

    // Phase 51: Convert predictions to PredictionInput format for daily risk calculation
    const predictionInputs: PredictionInput[] = predictions.map((p) => ({
      service_date: p.service_date,
      departure_time_local: p.departure_time_local,
      risk_level: p.risk_level,
      risk_score: p.risk_score,
      confidence: p.confidence,
      explanation: p.explanation,
      model_version: p.model_version,
      hours_ahead: p.hours_ahead,
      sailing_time: p.sailing_time,
      wind_speed_mph: p.wind_speed_mph,
      wind_gust_mph: p.wind_gust_mph,
      wind_direction_deg: p.wind_direction_deg,
    }));

    // Calculate daily risk summary
    const dailyRisk = calculateDailyRiskFromPredictions(predictionInputs);

    days.push({
      service_date: serviceDate,
      predictions,
      highest_risk_level: getHighestRiskLevel(riskLevels),
      prediction_count: predictions.length,
      daily_risk: dailyRisk,
    });
  }

  // Sort by date
  days.sort((a, b) => a.service_date.localeCompare(b.service_date));

  return {
    corridor_id: corridorId,
    forecast_type: forecastType,
    days,
    total_predictions: data.length,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Get a summary of the forecast for quick display
 */
export interface ForecastSummary {
  corridor_id: string;
  has_data: boolean;
  seven_day_count: number;
  fourteen_day_count: number;
  highest_risk_7_day: string;
  highest_risk_14_day: string;
}

export async function getCorridorForecastSummary(
  corridorId: string
): Promise<ForecastSummary> {
  // Check service role configuration
  if (!isServiceRoleConfigured()) {
    console.error('[FORECAST_SUMMARY] Service role key not configured');
    return {
      corridor_id: corridorId,
      has_data: false,
      seven_day_count: 0,
      fourteen_day_count: 0,
      highest_risk_7_day: 'low',
      highest_risk_14_day: 'low',
    };
  }

  const supabase = createServiceRoleClient({ allowNull: true });
  if (!supabase) {
    return {
      corridor_id: corridorId,
      has_data: false,
      seven_day_count: 0,
      fourteen_day_count: 0,
      highest_risk_7_day: 'low',
      highest_risk_14_day: 'low',
    };
  }

  // Get counts and max risk for 7-day window
  // Cast to expected type since we're using generic client without schema types
  const { data: sevenDayData } = await supabase
    .from('prediction_snapshots_v2')
    .select('risk_level')
    .eq('corridor_id', corridorId)
    .lte('hours_ahead', SEVEN_DAY_HOURS)
    .gte('hours_ahead', 0) as { data: { risk_level: string }[] | null };

  // Get counts and max risk for 14-day window (8-14 days)
  const { data: extendedData } = await supabase
    .from('prediction_snapshots_v2')
    .select('risk_level')
    .eq('corridor_id', corridorId)
    .gt('hours_ahead', SEVEN_DAY_HOURS)
    .lte('hours_ahead', FOURTEEN_DAY_HOURS) as { data: { risk_level: string }[] | null };

  const sevenDayRisks = (sevenDayData || []).map((r) => r.risk_level);
  const extendedRisks = (extendedData || []).map((r) => r.risk_level);
  const allRisks = [...sevenDayRisks, ...extendedRisks];

  return {
    corridor_id: corridorId,
    has_data: allRisks.length > 0,
    seven_day_count: sevenDayRisks.length,
    fourteen_day_count: sevenDayRisks.length + extendedRisks.length,
    highest_risk_7_day: getHighestRiskLevel(sevenDayRisks),
    highest_risk_14_day: getHighestRiskLevel(allRisks),
  };
}
