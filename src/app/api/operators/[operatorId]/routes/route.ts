/**
 * Routes by Operator API Endpoint
 *
 * Phase 66: Corridor-Based Selection
 *
 * GET /api/operators/[operatorId]/routes
 *
 * Returns all CORRIDORS (bidirectional crossings) for a given operator.
 * Each corridor is a single entry representing both directions.
 *
 * DESIGN PRINCIPLE:
 * Users think in terms of crossings, not directions.
 * "I want to go between Woods Hole and Vineyard Haven" - the direction
 * is determined when viewing sailings, not when selecting the crossing.
 *
 * AUTHORITY HIERARCHY (ENFORCED):
 * 1. Region (top-level grouping)
 * 2. Operator (region-scoped, source of schedule truth)
 * 3. Corridor (bidirectional crossing) ← THIS ENDPOINT
 * 4. Sailings (both directions shown together)
 */

import { NextRequest, NextResponse } from 'next/server';

// Corridor type - bidirectional crossing
interface OperatorCorridor {
  corridor_id: string;
  terminal_a: string;
  terminal_b: string;
  display_name: string; // "Woods Hole ↔ Vineyard Haven"
  active: boolean;
}

// Static corridor config per operator
// Each corridor represents BOTH directions as a single selectable unit
const CORRIDORS_BY_OPERATOR: Record<string, OperatorCorridor[]> = {
  ssa: [
    // Woods Hole <-> Vineyard Haven (SSA primary year-round)
    {
      corridor_id: 'woods-hole-vineyard-haven',
      terminal_a: 'woods-hole',
      terminal_b: 'vineyard-haven',
      display_name: 'Woods Hole ↔ Vineyard Haven',
      active: true,
    },
    // Woods Hole <-> Oak Bluffs (SSA seasonal)
    {
      corridor_id: 'woods-hole-oak-bluffs',
      terminal_a: 'woods-hole',
      terminal_b: 'oak-bluffs',
      display_name: 'Woods Hole ↔ Oak Bluffs',
      active: true,
    },
    // Hyannis <-> Nantucket (SSA year-round)
    {
      corridor_id: 'hyannis-nantucket',
      terminal_a: 'hyannis',
      terminal_b: 'nantucket',
      display_name: 'Hyannis ↔ Nantucket',
      active: true,
    },
  ],
  hyline: [
    // Hyannis <-> Nantucket (Hy-Line)
    {
      corridor_id: 'hyannis-nantucket',
      terminal_a: 'hyannis',
      terminal_b: 'nantucket',
      display_name: 'Hyannis ↔ Nantucket',
      active: true,
    },
    // Hyannis <-> Vineyard Haven (Hy-Line seasonal)
    {
      corridor_id: 'hyannis-vineyard-haven',
      terminal_a: 'hyannis',
      terminal_b: 'vineyard-haven',
      display_name: 'Hyannis ↔ Vineyard Haven',
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
  const corridors = CORRIDORS_BY_OPERATOR[operatorId];
  if (!corridors) {
    return NextResponse.json(
      {
        success: false,
        corridors: null,
        error: `Invalid operator ID: ${operatorId}`,
      },
      { status: 404 }
    );
  }

  // Return all corridors for operator
  return NextResponse.json({
    success: true,
    operator_id: operatorId,
    corridors,
  });
}
