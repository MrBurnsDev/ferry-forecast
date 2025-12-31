/**
 * Backtesting and Learning Loop
 *
 * Phase 32: Forecast Modeling
 *
 * Links predictions to outcomes and computes accuracy metrics.
 * This is the foundation for model improvement.
 *
 * WORKFLOW:
 * 1. Find unlinked predictions (predictions without outcomes)
 * 2. For each prediction, find matching sailing events
 * 3. Link them via prediction_outcomes table
 * 4. Compute accuracy metrics by model version
 */

import { createServerClient } from '@/lib/supabase/client';

// Types for backtesting
export interface UnlinkedPrediction {
  id: string;
  routeId: string;
  corridorId: string;
  sailingTime: string;
  serviceDate: string;
  departureTimeLocal: string;
  predictedAt: string;
  riskScore: number;
  riskLevel: string;
  modelVersion: string;
}

export interface MatchingSailingEvent {
  id: string;
  operatorId: string;
  corridorId: string;
  fromPort: string;
  toPort: string;
  serviceDate: string;
  departureTime: string;
  status: 'on_time' | 'delayed' | 'canceled';
  statusMessage: string | null;
  observedAt: string;
}

export interface AccuracyMetrics {
  modelVersion: string;
  corridorId: string | null;
  totalPredictions: number;
  predictionsWithOutcomes: number;
  correctCount: number;
  accuracyPct: number;
  avgScoreError: number;
  onTimeCount: number;
  delayedCount: number;
  canceledCount: number;
}

export interface BacktestResult {
  predictionsProcessed: number;
  predictionsLinked: number;
  errors: number;
}

/**
 * Find predictions that don't have outcomes linked yet
 */
export async function findUnlinkedPredictions(
  limit: number = 100
): Promise<UnlinkedPrediction[]> {
  const supabase = createServerClient();
  if (!supabase) {
    console.error('[BACKTEST] Supabase client is null');
    return [];
  }

  // Find predictions that don't have outcomes yet
  // and whose sailing time has passed
  const { data, error } = await supabase
    .from('prediction_snapshots_v2')
    .select(`
      id,
      route_id,
      corridor_id,
      sailing_time,
      service_date,
      departure_time_local,
      predicted_at,
      risk_score,
      risk_level,
      model_version
    `)
    .lt('sailing_time', new Date().toISOString()) // Sailing has passed
    .not('id', 'in', supabase
      .from('prediction_outcomes')
      .select('prediction_id')
    )
    .order('sailing_time', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[BACKTEST] Error finding unlinked predictions:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    routeId: row.route_id,
    corridorId: row.corridor_id,
    sailingTime: row.sailing_time,
    serviceDate: row.service_date,
    departureTimeLocal: row.departure_time_local,
    predictedAt: row.predicted_at,
    riskScore: row.risk_score,
    riskLevel: row.risk_level,
    modelVersion: row.model_version,
  }));
}

/**
 * Find matching sailing events for a prediction
 */
export async function findMatchingSailingEvent(
  corridorId: string,
  serviceDate: string,
  departureTimeLocal: string
): Promise<MatchingSailingEvent | null> {
  const supabase = createServerClient();
  if (!supabase) {
    return null;
  }

  // Find sailing events with matching corridor, date, and time
  const { data, error } = await supabase
    .from('sailing_events')
    .select('*')
    .eq('corridor_id', corridorId)
    .eq('service_date', serviceDate)
    .eq('departure_time', departureTimeLocal)
    .order('observed_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  const row = data[0];
  return {
    id: row.id,
    operatorId: row.operator_id,
    corridorId: row.corridor_id,
    fromPort: row.from_port,
    toPort: row.to_port,
    serviceDate: row.service_date,
    departureTime: row.departure_time,
    status: row.status as 'on_time' | 'delayed' | 'canceled',
    statusMessage: row.status_message,
    observedAt: row.observed_at,
  };
}

/**
 * Link a prediction to a sailing event outcome
 */
export async function linkPredictionToOutcome(
  prediction: UnlinkedPrediction,
  event: MatchingSailingEvent
): Promise<boolean> {
  const supabase = createServerClient();
  if (!supabase) {
    return false;
  }

  // Calculate expected score based on outcome
  const expectedScore =
    event.status === 'on_time' ? 15 :
    event.status === 'delayed' ? 45 :
    event.status === 'canceled' ? 80 : 50;

  // Determine if prediction was correct
  const wasCorrect =
    (prediction.riskLevel === 'low' && event.status === 'on_time') ||
    (['moderate', 'elevated'].includes(prediction.riskLevel) && ['on_time', 'delayed'].includes(event.status)) ||
    (['high', 'severe'].includes(prediction.riskLevel) && ['delayed', 'canceled'].includes(event.status));

  // Calculate hours before sailing
  const predictedAt = new Date(prediction.predictedAt);
  const sailingTime = new Date(prediction.sailingTime);
  const hoursBeforeSailing = (sailingTime.getTime() - predictedAt.getTime()) / (1000 * 60 * 60);

  // Insert outcome record
  const { error } = await supabase
    .from('prediction_outcomes')
    .insert({
      prediction_id: prediction.id,
      sailing_event_id: event.id,
      actual_status: event.status,
      actual_status_message: event.statusMessage,
      was_correct: wasCorrect,
      score_error: prediction.riskScore - expectedScore,
      expected_score: expectedScore,
      hours_before_sailing: Math.round(hoursBeforeSailing * 10) / 10,
    });

  if (error) {
    console.error('[BACKTEST] Error linking prediction:', error);
    return false;
  }

  return true;
}

/**
 * Run backtesting loop
 * Links unlinked predictions to their outcomes
 */
export async function runBacktest(limit: number = 100): Promise<BacktestResult> {
  console.log('[BACKTEST] Starting backtest run...');

  const predictions = await findUnlinkedPredictions(limit);
  console.log(`[BACKTEST] Found ${predictions.length} unlinked predictions`);

  let linked = 0;
  let errors = 0;

  for (const prediction of predictions) {
    const event = await findMatchingSailingEvent(
      prediction.corridorId,
      prediction.serviceDate,
      prediction.departureTimeLocal
    );

    if (!event) {
      // No matching sailing event found - this is expected for future sailings
      // or if no observer data was collected
      continue;
    }

    const success = await linkPredictionToOutcome(prediction, event);
    if (success) {
      linked++;
    } else {
      errors++;
    }
  }

  console.log(`[BACKTEST] Complete: ${linked} linked, ${errors} errors`);

  return {
    predictionsProcessed: predictions.length,
    predictionsLinked: linked,
    errors,
  };
}

/**
 * Get accuracy metrics by model version
 */
export async function getAccuracyMetrics(
  modelVersion?: string,
  corridorId?: string
): Promise<AccuracyMetrics[]> {
  const supabase = createServerClient();
  if (!supabase) {
    return [];
  }

  // Use the model_accuracy view
  let query = supabase
    .from('model_accuracy')
    .select('*');

  if (modelVersion) {
    query = query.eq('model_version', modelVersion);
  }

  if (corridorId) {
    query = query.eq('corridor_id', corridorId);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('[BACKTEST] Error fetching accuracy metrics:', error);
    return [];
  }

  return data.map((row) => ({
    modelVersion: row.model_version,
    corridorId: row.corridor_id,
    totalPredictions: row.total_predictions,
    predictionsWithOutcomes: row.predictions_with_outcomes,
    correctCount: row.correct_count || 0,
    accuracyPct: row.accuracy_pct || 0,
    avgScoreError: row.avg_score_error || 0,
    onTimeCount: row.on_time_count || 0,
    delayedCount: row.delayed_count || 0,
    canceledCount: row.canceled_count || 0,
  }));
}

/**
 * Get recent prediction outcomes for debugging
 */
export async function getRecentOutcomes(
  limit: number = 20
): Promise<Array<{
  predictionId: string;
  corridorId: string;
  sailingTime: string;
  predictedRiskLevel: string;
  actualStatus: string;
  wasCorrect: boolean;
  scoreError: number;
  hoursBeforeSailing: number;
}>> {
  const supabase = createServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('recent_prediction_outcomes')
    .select('*')
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    predictionId: row.prediction_id,
    corridorId: row.corridor_id,
    sailingTime: row.sailing_time,
    predictedRiskLevel: row.risk_level,
    actualStatus: row.actual_status || 'unknown',
    wasCorrect: row.was_correct || false,
    scoreError: row.score_error || 0,
    hoursBeforeSailing: row.hours_before_sailing || 0,
  }));
}
