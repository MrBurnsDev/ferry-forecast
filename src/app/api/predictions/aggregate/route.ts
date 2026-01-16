import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/predictions/aggregate
 *
 * Phase 98: Community Prediction Breakdown
 *
 * Returns aggregated prediction counts for sailings.
 * Public endpoint - no auth required.
 *
 * Query params:
 *   - sailing_id: Single sailing ID (required if no sailing_ids)
 *   - sailing_ids: Comma-separated list of sailing IDs for batch fetch
 *
 * Response:
 * {
 *   aggregates: {
 *     [sailing_id]: {
 *       total: number,
 *       will_sail: number,
 *       will_cancel: number
 *     }
 *   }
 * }
 *
 * Returns zero counts if no predictions exist for a sailing.
 */

const SCHEMA_NAME = 'ferry_forecast';

interface PredictionAggregate {
  total: number;
  will_sail: number;
  will_cancel: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key to bypass RLS - this endpoint only returns aggregate counts,
  // no personally identifiable information is exposed
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase is not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const singleSailingId = searchParams.get('sailing_id');
  const sailingIdsParam = searchParams.get('sailing_ids');

  // Parse sailing IDs
  let sailingIds: string[] = [];

  if (singleSailingId) {
    sailingIds = [singleSailingId];
  } else if (sailingIdsParam) {
    sailingIds = sailingIdsParam.split(',').map(id => id.trim()).filter(Boolean);
  }

  if (sailingIds.length === 0) {
    return NextResponse.json(
      { error: 'MISSING_SAILING_ID', message: 'Either sailing_id or sailing_ids query parameter is required' },
      { status: 400 }
    );
  }

  // Limit batch size to prevent abuse
  const MAX_BATCH_SIZE = 50;
  if (sailingIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: 'BATCH_TOO_LARGE', message: `Maximum ${MAX_BATCH_SIZE} sailing IDs per request` },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: SCHEMA_NAME,
    },
  });

  // Query bets table grouped by sailing_id and bet_type
  // Only count active bets (status != 'cancelled' if that status exists)
  const { data, error } = await supabase
    .from('bets')
    .select('sailing_id, bet_type')
    .in('sailing_id', sailingIds);

  if (error) {
    console.error('[PREDICTIONS_AGGREGATE] Query failed:', error);
    return NextResponse.json(
      { error: 'QUERY_FAILED', message: 'Failed to fetch prediction aggregates', details: error.message },
      { status: 500 }
    );
  }

  // Initialize aggregates for all requested sailing IDs with zeros
  const aggregates: Record<string, PredictionAggregate> = {};
  for (const id of sailingIds) {
    aggregates[id] = { total: 0, will_sail: 0, will_cancel: 0 };
  }

  // Count predictions
  if (data) {
    for (const bet of data) {
      const agg = aggregates[bet.sailing_id];
      if (agg) {
        agg.total += 1;
        if (bet.bet_type === 'sail') {
          agg.will_sail += 1;
        } else if (bet.bet_type === 'cancel') {
          agg.will_cancel += 1;
        }
      }
    }
  }

  // Add cache headers - short TTL since predictions can change
  const response = NextResponse.json({ aggregates });
  response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  return response;
}
