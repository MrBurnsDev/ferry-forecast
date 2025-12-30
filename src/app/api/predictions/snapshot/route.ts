import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type {
  ContributingFactor,
  ConfidenceRating,
  WeatherSnapshot,
  TideSwing,
} from '@/types/forecast';

/**
 * POST /api/predictions/snapshot
 *
 * Server-side endpoint for logging prediction snapshots.
 * Called automatically when forecasts are generated to enable future accuracy analysis.
 *
 * ============================================================================
 * LEARNING BOUNDARY - CRITICAL ARCHITECTURAL NOTE
 * ============================================================================
 *
 * CURRENT STATE:
 * - This endpoint COLLECTS prediction snapshots
 * - Data is stored in prediction_snapshots table
 * - Predictions are WEATHER-ONLY (deterministic scoring engine)
 * - Historical data is NOT used in current predictions
 *
 * FUTURE STATE (not yet implemented):
 * - Offline analysis will compare predictions vs. actual outcomes
 * - Accuracy metrics will inform weight tuning
 * - Learning will be introduced via explicit retraining, not live inference
 *
 * ============================================================================
 *
 * SECURITY:
 * - Uses SUPABASE_SERVICE_ROLE_KEY (server-only, NOT exposed to browser)
 * - RLS prevents client-side writes
 *
 * Request body:
 * {
 *   route_id: string (required)
 *   forecast_for_time: string (required) - ISO timestamp of the sailing being predicted
 *   predicted_score: number (required) - 0-100 risk score
 *   predicted_risk_level: "low" | "moderate" | "high" (required)
 *   predicted_confidence: "low" | "medium" | "high" (required)
 *   factors: ContributingFactor[] (required)
 *   weather_input: WeatherSnapshot (required)
 *   tide_input?: TideSwing
 *   exposure_version?: "1" | "2"
 *   exposure_modifier?: number
 *   wind_direction_bucket?: string
 *   model_version: string (required)
 * }
 */

const SCHEMA_NAME = 'ferry_forecast';

interface PredictionSnapshotRequest {
  route_id: string;
  forecast_for_time: string;
  predicted_score: number;
  predicted_risk_level: 'low' | 'moderate' | 'high';
  predicted_confidence: ConfidenceRating;
  factors: ContributingFactor[];
  weather_input: WeatherSnapshot;
  tide_input?: TideSwing;
  exposure_version?: '1' | '2';
  exposure_modifier?: number;
  wind_direction_bucket?: string;
  model_version: string;
}

function isValidRiskLevel(level: unknown): level is 'low' | 'moderate' | 'high' {
  return typeof level === 'string' && ['low', 'moderate', 'high'].includes(level);
}

function isValidConfidence(conf: unknown): conf is ConfidenceRating {
  return typeof conf === 'string' && ['low', 'medium', 'high'].includes(conf);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    // Silently skip logging if service key not configured
    // This is expected in development without Supabase
    return NextResponse.json(
      { skipped: true, reason: 'SUPABASE_SERVICE_ROLE_KEY not configured' },
      { status: 200 }
    );
  }

  let body: PredictionSnapshotRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!body.route_id || typeof body.route_id !== 'string') {
    return NextResponse.json(
      { error: 'MISSING_ROUTE_ID', message: 'route_id is required' },
      { status: 400 }
    );
  }

  if (!body.forecast_for_time || typeof body.forecast_for_time !== 'string') {
    return NextResponse.json(
      { error: 'MISSING_FORECAST_TIME', message: 'forecast_for_time is required' },
      { status: 400 }
    );
  }

  const forecastDate = new Date(body.forecast_for_time);
  if (isNaN(forecastDate.getTime())) {
    return NextResponse.json(
      { error: 'INVALID_FORECAST_TIME', message: 'forecast_for_time must be a valid ISO timestamp' },
      { status: 400 }
    );
  }

  if (typeof body.predicted_score !== 'number' || body.predicted_score < 0 || body.predicted_score > 100) {
    return NextResponse.json(
      { error: 'INVALID_SCORE', message: 'predicted_score must be 0-100' },
      { status: 400 }
    );
  }

  if (!isValidRiskLevel(body.predicted_risk_level)) {
    return NextResponse.json(
      { error: 'INVALID_RISK_LEVEL', message: 'predicted_risk_level must be low, moderate, or high' },
      { status: 400 }
    );
  }

  if (!isValidConfidence(body.predicted_confidence)) {
    return NextResponse.json(
      { error: 'INVALID_CONFIDENCE', message: 'predicted_confidence must be low, medium, or high' },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.factors)) {
    return NextResponse.json(
      { error: 'INVALID_FACTORS', message: 'factors must be an array' },
      { status: 400 }
    );
  }

  if (!body.weather_input || typeof body.weather_input !== 'object') {
    return NextResponse.json(
      { error: 'MISSING_WEATHER', message: 'weather_input is required' },
      { status: 400 }
    );
  }

  if (!body.model_version || typeof body.model_version !== 'string') {
    return NextResponse.json(
      { error: 'MISSING_MODEL_VERSION', message: 'model_version is required' },
      { status: 400 }
    );
  }

  // Create Supabase client with service role
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: SCHEMA_NAME,
    },
  });

  const { data, error } = await supabase
    .from('prediction_snapshots')
    .insert({
      route_id: body.route_id,
      forecast_for_time: body.forecast_for_time,
      predicted_score: body.predicted_score,
      predicted_risk_level: body.predicted_risk_level,
      predicted_confidence: body.predicted_confidence,
      factors: body.factors,
      weather_input: body.weather_input,
      tide_input: body.tide_input ?? null,
      exposure_version: body.exposure_version ?? null,
      exposure_modifier: body.exposure_modifier ?? null,
      wind_direction_bucket: body.wind_direction_bucket ?? null,
      model_version: body.model_version,
    })
    .select('id, created_at')
    .single();

  if (error) {
    console.error('Failed to insert prediction snapshot:', error);
    return NextResponse.json(
      {
        error: 'INSERT_FAILED',
        message: 'Failed to log prediction snapshot',
        details: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      id: data.id,
      created_at: data.created_at,
    },
    { status: 201 }
  );
}

// GET endpoint for reading prediction snapshots (public access via RLS)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase is not configured' },
      { status: 503 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: SCHEMA_NAME,
    },
  });

  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('route_id');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  let query = supabase
    .from('prediction_snapshots')
    .select('*')
    .order('prediction_time', { ascending: false })
    .limit(limit);

  if (routeId) {
    query = query.eq('route_id', routeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch prediction snapshots:', error);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: 'Failed to fetch prediction snapshots', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    predictions: data,
    count: data.length,
    route_id: routeId || 'all',
  });
}
