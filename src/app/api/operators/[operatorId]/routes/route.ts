/**
 * Routes by Operator API Endpoint
 *
 * Phase 59: Region/Operator/Route Authority
 *
 * GET /api/operators/[operatorId]/routes
 *
 * Returns all routes for a given operator. Routes are EXPLICITLY defined
 * by the operator - never inferred, never shared, never mirrored.
 *
 * AUTHORITY HIERARCHY (ENFORCED):
 * 1. Region (top-level grouping)
 * 2. Operator (region-scoped, source of schedule truth)
 * 3. Route (operator-defined, explicit direction) ← THIS ENDPOINT
 * 4. Sailings (operator-published, NEVER inferred)
 *
 * HARD RULES:
 * - Routes are NEVER shared across operators
 * - Direction is explicit - never inferred
 * - Routes exist even if they have zero sailings today
 */

import { NextRequest, NextResponse } from 'next/server';

// Route type per Phase 59 spec
interface OperatorRoute {
  route_id: string;
  from_terminal: string;
  to_terminal: string;
  display_name: string;
  active: boolean;
}

// Static route config (source of truth until Supabase migration runs)
// These match the operator_routes table seeded in migration 007
const ROUTES_BY_OPERATOR: Record<string, OperatorRoute[]> = {
  ssa: [
    // Woods Hole <-> Vineyard Haven (SSA primary year-round)
    {
      route_id: 'wh-vh',
      from_terminal: 'woods-hole',
      to_terminal: 'vineyard-haven',
      display_name: 'Woods Hole to Vineyard Haven',
      active: true,
    },
    {
      route_id: 'vh-wh',
      from_terminal: 'vineyard-haven',
      to_terminal: 'woods-hole',
      display_name: 'Vineyard Haven to Woods Hole',
      active: true,
    },
    // Woods Hole <-> Oak Bluffs (SSA seasonal)
    {
      route_id: 'wh-ob',
      from_terminal: 'woods-hole',
      to_terminal: 'oak-bluffs',
      display_name: 'Woods Hole to Oak Bluffs',
      active: true,
    },
    {
      route_id: 'ob-wh',
      from_terminal: 'oak-bluffs',
      to_terminal: 'woods-hole',
      display_name: 'Oak Bluffs to Woods Hole',
      active: true,
    },
    // Hyannis <-> Nantucket (SSA year-round)
    {
      route_id: 'hy-nan',
      from_terminal: 'hyannis',
      to_terminal: 'nantucket',
      display_name: 'Hyannis to Nantucket',
      active: true,
    },
    {
      route_id: 'nan-hy',
      from_terminal: 'nantucket',
      to_terminal: 'hyannis',
      display_name: 'Nantucket to Hyannis',
      active: true,
    },
  ],
  hyline: [
    // Hyannis <-> Nantucket (Hy-Line)
    {
      route_id: 'hy-nan',
      from_terminal: 'hyannis',
      to_terminal: 'nantucket',
      display_name: 'Hyannis to Nantucket',
      active: true,
    },
    {
      route_id: 'nan-hy',
      from_terminal: 'nantucket',
      to_terminal: 'hyannis',
      display_name: 'Nantucket to Hyannis',
      active: true,
    },
    // Hyannis <-> Vineyard Haven (Hy-Line seasonal)
    {
      route_id: 'hy-vh',
      from_terminal: 'hyannis',
      to_terminal: 'vineyard-haven',
      display_name: 'Hyannis to Vineyard Haven',
      active: true,
    },
    {
      route_id: 'vh-hy',
      from_terminal: 'vineyard-haven',
      to_terminal: 'hyannis',
      display_name: 'Vineyard Haven to Hyannis',
      active: true,
    },
  ],
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ operatorId: string }> }
): Promise<NextResponse> {
  const { operatorId } = await params;

  // Validate operator ID
  const routes = ROUTES_BY_OPERATOR[operatorId];
  if (!routes) {
    return NextResponse.json(
      {
        success: false,
        routes: null,
        error: `Invalid operator ID: ${operatorId}`,
      },
      { status: 404 }
    );
  }

  // Return all routes for operator
  return NextResponse.json({
    success: true,
    operator_id: operatorId,
    routes,
  });
}
