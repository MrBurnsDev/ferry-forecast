/**
 * Forecast Data Access Layer
 *
 * Phase 33: 7-Day and 14-Day Travel Forecast UX
 *
 * Reads predictions from ferry_forecast.prediction_snapshots_v2
 * This is READ-ONLY - no prediction computation happens here.
 *
 * IMPORTANT: Uses only verified schema columns:
 * - service_date (date)
 * - departure_time_local (text)
 * - risk_level (text)
 * - risk_score (integer)
 * - confidence (text)
 * - explanation (text[])
 * - model_version (text)
 * - hours_ahead (integer)
 *
 * FORECAST LOGIC:
 * - 7-day forecast: hours_ahead <= 168
 * - 14-day forecast: hours_ahead <= 336
 */

import { createServerClient } from '@/lib/supabase/client';

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
}

/**
 * Grouped forecast by date for UI display
 */
export interface DayForecast {
  service_date: string;
  predictions: ForecastPrediction[];
  highest_risk_level: string;
  prediction_count: number;
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
}

// Hours ahead thresholds (per specification)
const SEVEN_DAY_HOURS = 168;
const FOURTEEN_DAY_HOURS = 336;

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
  const supabase = createServerClient();
  if (!supabase) {
    console.error('[FORECAST] Supabase client is null');
    return null;
  }

  // Determine hours_ahead threshold based on forecast type
  const maxHoursAhead = forecastType === '7_day' ? SEVEN_DAY_HOURS : FOURTEEN_DAY_HOURS;

  // Query prediction_snapshots_v2 using ONLY verified columns
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
      sailing_time
    `)
    .eq('corridor_id', corridorId)
    .lte('hours_ahead', maxHoursAhead)
    .gte('hours_ahead', 0)
    .order('service_date', { ascending: true })
    .order('sailing_time', { ascending: true });

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
    // No predictions available - return empty forecast
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
    };

    const existing = dayMap.get(row.service_date) || [];
    existing.push(prediction);
    dayMap.set(row.service_date, existing);
  }

  // Convert map to sorted array of DayForecast
  const days: DayForecast[] = [];
  for (const [serviceDate, predictions] of dayMap) {
    const riskLevels = predictions.map((p) => p.risk_level);
    days.push({
      service_date: serviceDate,
      predictions,
      highest_risk_level: getHighestRiskLevel(riskLevels),
      prediction_count: predictions.length,
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
  const supabase = createServerClient();
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
  const { data: sevenDayData } = await supabase
    .from('prediction_snapshots_v2')
    .select('risk_level')
    .eq('corridor_id', corridorId)
    .lte('hours_ahead', SEVEN_DAY_HOURS)
    .gte('hours_ahead', 0);

  // Get counts and max risk for 14-day window (8-14 days)
  const { data: extendedData } = await supabase
    .from('prediction_snapshots_v2')
    .select('risk_level')
    .eq('corridor_id', corridorId)
    .gt('hours_ahead', SEVEN_DAY_HOURS)
    .lte('hours_ahead', FOURTEEN_DAY_HOURS);

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
