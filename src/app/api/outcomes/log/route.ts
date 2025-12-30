import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ObservedOutcome, WeatherSnapshot, ConfidenceRating } from '@/types/forecast';

/**
 * POST /api/outcomes/log
 *
 * Server-side endpoint for logging ferry outcome observations.
 * Used to collect ground truth data for model accuracy analysis.
 *
 * SECURITY:
 * - Uses SUPABASE_SERVICE_ROLE_KEY (server-only, NOT exposed to browser)
 * - This key is configured in Vercel as a non-NEXT_PUBLIC env var
 * - The endpoint validates input and enriches with prediction data if available
 *
 * Request body:
 * {
 *   route_id: string (required) - Route slug e.g. "wh-vh-ssa"
 *   observed_time: string (required) - ISO timestamp of the sailing
 *   observed_outcome: "ran" | "delayed" | "canceled" | "unknown" (required)
 *   operator_reported_status?: string - Official status message
 *   notes?: string - Additional observations
 *   predicted_score?: number - Override prediction (otherwise fetched)
 *   predicted_confidence?: string - Override confidence
 *   weather_snapshot?: object - Override weather data
 *   advisory_level?: string - Override advisory
 *   tide_swing_ft?: number - Override tide
 * }
 */

// Schema name for ferry_forecast
const SCHEMA_NAME = 'ferry_forecast';

// Validate observed outcome
function isValidOutcome(outcome: unknown): outcome is ObservedOutcome {
  return (
    typeof outcome === 'string' &&
    ['ran', 'delayed', 'canceled', 'unknown'].includes(outcome)
  );
}

// Validate confidence rating
function isValidConfidence(confidence: unknown): confidence is ConfidenceRating {
  return (
    typeof confidence === 'string' &&
    ['low', 'medium', 'high'].includes(confidence)
  );
}

interface OutcomeLogRequest {
  route_id: string;
  observed_time: string;
  observed_outcome: ObservedOutcome;
  operator_reported_status?: string;
  notes?: string;
  predicted_score?: number;
  predicted_confidence?: ConfidenceRating;
  weather_snapshot?: WeatherSnapshot;
  advisory_level?: string;
  tide_swing_ft?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check for service role key - required for writes
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error: 'SERVICE_KEY_NOT_CONFIGURED',
        message:
          'Outcome logging requires SUPABASE_SERVICE_ROLE_KEY to be configured. ' +
          'This is a server-only environment variable (not NEXT_PUBLIC_*).',
        hint: 'Add SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables.',
      },
      { status: 501 }
    );
  }

  // Parse request body
  let body: OutcomeLogRequest;
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

  if (!body.observed_time || typeof body.observed_time !== 'string') {
    return NextResponse.json(
      { error: 'MISSING_OBSERVED_TIME', message: 'observed_time is required (ISO timestamp)' },
      { status: 400 }
    );
  }

  // Validate observed_time is a valid date
  const observedDate = new Date(body.observed_time);
  if (isNaN(observedDate.getTime())) {
    return NextResponse.json(
      { error: 'INVALID_OBSERVED_TIME', message: 'observed_time must be a valid ISO timestamp' },
      { status: 400 }
    );
  }

  if (!isValidOutcome(body.observed_outcome)) {
    return NextResponse.json(
      {
        error: 'INVALID_OUTCOME',
        message: 'observed_outcome must be one of: ran, delayed, canceled, unknown',
      },
      { status: 400 }
    );
  }

  // Validate optional fields
  if (body.predicted_score !== undefined) {
    if (typeof body.predicted_score !== 'number' || body.predicted_score < 0 || body.predicted_score > 100) {
      return NextResponse.json(
        { error: 'INVALID_PREDICTED_SCORE', message: 'predicted_score must be 0-100' },
        { status: 400 }
      );
    }
  }

  if (body.predicted_confidence !== undefined && !isValidConfidence(body.predicted_confidence)) {
    return NextResponse.json(
      { error: 'INVALID_PREDICTED_CONFIDENCE', message: 'predicted_confidence must be low, medium, or high' },
      { status: 400 }
    );
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: SCHEMA_NAME,
    },
  });

  // If prediction data not provided, try to fetch current prediction for context
  let predictionData = {
    predicted_score: body.predicted_score,
    predicted_confidence: body.predicted_confidence,
    weather_snapshot: body.weather_snapshot,
    advisory_level: body.advisory_level,
    tide_swing_ft: body.tide_swing_ft,
  };

  if (predictionData.predicted_score === undefined) {
    // Try to fetch current forecast for this route to enrich the log
    try {
      const forecastUrl = new URL(`/api/forecast/route/${body.route_id}`, request.url);
      const forecastResponse = await fetch(forecastUrl.toString());

      if (forecastResponse.ok) {
        const forecast = await forecastResponse.json();
        predictionData = {
          predicted_score: forecast.current_risk?.score,
          predicted_confidence: forecast.current_risk?.confidence,
          weather_snapshot: forecast.current_conditions?.weather,
          advisory_level: forecast.current_conditions?.weather?.advisory_level,
          tide_swing_ft: forecast.current_conditions?.tide?.swing_feet,
        };
      }
    } catch {
      // Ignore errors - prediction enrichment is optional
      console.warn('Could not fetch prediction data for outcome log enrichment');
    }
  }

  // Insert the outcome log
  const { data, error } = await supabase
    .from('outcome_logs')
    .insert({
      route_id: body.route_id,
      observed_time: body.observed_time,
      observed_outcome: body.observed_outcome,
      operator_reported_status: body.operator_reported_status || null,
      notes: body.notes || null,
      predicted_score: predictionData.predicted_score ?? null,
      predicted_confidence: predictionData.predicted_confidence ?? null,
      weather_snapshot: predictionData.weather_snapshot ?? null,
      advisory_level: predictionData.advisory_level ?? null,
      tide_swing_ft: predictionData.tide_swing_ft ?? null,
    })
    .select('id, created_at')
    .single();

  if (error) {
    console.error('Failed to insert outcome log:', error);
    return NextResponse.json(
      {
        error: 'INSERT_FAILED',
        message: 'Failed to log outcome',
        details: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: 'Outcome logged successfully',
      id: data.id,
      created_at: data.created_at,
      enriched_with_prediction: predictionData.predicted_score !== undefined,
    },
    { status: 201 }
  );
}

// GET endpoint for reading outcome logs (public access via RLS)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase is not configured' },
      { status: 503 }
    );
  }

  // Use anon key for reads (respects RLS)
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: SCHEMA_NAME,
    },
  });

  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get('route_id');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  let query = supabase
    .from('outcome_logs')
    .select('*')
    .order('observed_time', { ascending: false })
    .limit(limit);

  if (routeId) {
    query = query.eq('route_id', routeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch outcome logs:', error);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: 'Failed to fetch outcome logs', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    outcomes: data,
    count: data.length,
    route_id: routeId || 'all',
  });
}
