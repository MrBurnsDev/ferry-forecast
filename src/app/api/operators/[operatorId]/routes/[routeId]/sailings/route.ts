/**
 * Sailings by Route API Endpoint
 *
 * Phase 59: Region/Operator/Route Authority
 *
 * GET /api/operators/[operatorId]/routes/[routeId]/sailings
 *
 * Returns sailings for a specific route on a given date. Sailings come
 * EXCLUSIVELY from the operator - never inferred, never mirrored.
 *
 * Query Parameters:
 * - date: Service date in YYYY-MM-DD format (default: today)
 *
 * AUTHORITY HIERARCHY (ENFORCED):
 * 1. Region (top-level grouping)
 * 2. Operator (region-scoped, source of schedule truth)
 * 3. Route (operator-defined, explicit direction)
 * 4. Sailings (operator-published, NEVER inferred) ← THIS ENDPOINT
 *
 * HARD RULES:
 * - Sailings are NEVER inferred from the reverse direction
 * - If operator shows ZERO sailings → this API returns ZERO sailings
 * - Canceled sailings are included with status="canceled"
 * - status_message preserves operator's exact reason
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// Sailing type per Phase 59 spec
interface Sailing {
  id: string;
  departure_time_local: string;
  arrival_time_local: string | null;
  status: 'scheduled' | 'on_time' | 'delayed' | 'canceled';
  status_message: string | null;
  vessel_name: string | null;
}

// Route lookup for validation
const ROUTE_EXISTS: Record<string, Record<string, boolean>> = {
  ssa: {
    'wh-vh': true, 'vh-wh': true,
    'wh-ob': true, 'ob-wh': true,
    'hy-nan': true, 'nan-hy': true,
  },
  hyline: {
    'hy-nan': true, 'nan-hy': true,
    'hy-vh': true, 'vh-hy': true,
  },
};

// Route to terminal mapping
const ROUTE_TERMINALS: Record<string, Record<string, { from: string; to: string }>> = {
  ssa: {
    'wh-vh': { from: 'woods-hole', to: 'vineyard-haven' },
    'vh-wh': { from: 'vineyard-haven', to: 'woods-hole' },
    'wh-ob': { from: 'woods-hole', to: 'oak-bluffs' },
    'ob-wh': { from: 'oak-bluffs', to: 'woods-hole' },
    'hy-nan': { from: 'hyannis', to: 'nantucket' },
    'nan-hy': { from: 'nantucket', to: 'hyannis' },
  },
  hyline: {
    'hy-nan': { from: 'hyannis', to: 'nantucket' },
    'nan-hy': { from: 'nantucket', to: 'hyannis' },
    'hy-vh': { from: 'hyannis', to: 'vineyard-haven' },
    'vh-hy': { from: 'vineyard-haven', to: 'hyannis' },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ operatorId: string; routeId: string }> }
): Promise<NextResponse> {
  const { operatorId, routeId } = await params;
  const { searchParams } = new URL(request.url);

  // Get date parameter (default to today in ET)
  const dateParam = searchParams.get('date');
  const serviceDate = dateParam || new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });

  // Validate operator and route
  if (!ROUTE_EXISTS[operatorId]) {
    return NextResponse.json(
      {
        success: false,
        sailings: null,
        error: `Invalid operator ID: ${operatorId}`,
      },
      { status: 404 }
    );
  }

  if (!ROUTE_EXISTS[operatorId][routeId]) {
    return NextResponse.json(
      {
        success: false,
        sailings: null,
        error: `Invalid route ID: ${routeId} for operator: ${operatorId}`,
      },
      { status: 404 }
    );
  }

  const terminals = ROUTE_TERMINALS[operatorId][routeId];

  try {
    // Query sailing_events from Supabase
    const supabase = createServerClient();

    // If Supabase is not configured, return empty sailings (graceful degradation)
    if (!supabase) {
      console.warn('[SAILINGS_API] Supabase not configured, returning empty sailings');
      return NextResponse.json({
        success: true,
        operator_id: operatorId,
        route_id: routeId,
        service_date: serviceDate,
        from_terminal: terminals.from,
        to_terminal: terminals.to,
        sailings: [],
        sailing_count: 0,
        source: 'supabase_unavailable',
      });
    }

    const { data: sailingEvents, error } = await supabase
      .from('sailing_events')
      .select('*')
      .eq('operator_id', operatorId)
      .eq('from_port', terminals.from)
      .eq('to_port', terminals.to)
      .eq('service_date', serviceDate)
      .order('departure_time', { ascending: true });

    if (error) {
      console.error('[SAILINGS_API] Supabase error:', error);
      // Return empty sailings if DB fails (graceful degradation)
      return NextResponse.json({
        success: true,
        operator_id: operatorId,
        route_id: routeId,
        service_date: serviceDate,
        sailings: [],
        source: 'supabase_unavailable',
      });
    }

    // Map sailing_events to API response format
    const sailings: Sailing[] = (sailingEvents || []).map((event) => ({
      id: event.id,
      departure_time_local: event.departure_time,
      arrival_time_local: event.arrival_time || null,
      status: event.status || 'scheduled',
      status_message: event.status_message || null,
      vessel_name: event.vessel_name || null,
    }));

    return NextResponse.json({
      success: true,
      operator_id: operatorId,
      route_id: routeId,
      service_date: serviceDate,
      from_terminal: terminals.from,
      to_terminal: terminals.to,
      sailings,
      sailing_count: sailings.length,
      source: 'supabase',
    });
  } catch (err) {
    console.error('[SAILINGS_API] Error:', err);
    return NextResponse.json(
      {
        success: false,
        sailings: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
