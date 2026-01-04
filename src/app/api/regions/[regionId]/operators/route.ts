/**
 * Operators by Region API Endpoint
 *
 * Phase 59: Region/Operator/Route Authority
 *
 * GET /api/regions/[regionId]/operators
 *
 * Returns all active operators for a given region. This is the second level
 * of the Region → Operator → Route navigation hierarchy.
 *
 * AUTHORITY HIERARCHY (ENFORCED):
 * 1. Region (top-level grouping)
 * 2. Operator (region-scoped, source of schedule truth) ← THIS ENDPOINT
 * 3. Route (operator-defined, explicit direction)
 * 4. Sailings (operator-published, NEVER inferred)
 */

import { NextRequest, NextResponse } from 'next/server';

// Operator type per Phase 59 spec
interface Operator {
  operator_id: string;
  display_name: string;
  slug: string;
  official_url: string;
  active_today: boolean;
}

// Static operator config (source of truth until Supabase migration runs)
// Note: active_today would normally be computed from sailing_events
const OPERATORS_BY_REGION: Record<string, Operator[]> = {
  cci: [
    {
      operator_id: 'ssa',
      display_name: 'The Steamship Authority',
      slug: 'steamship-authority',
      official_url: 'https://www.steamshipauthority.com',
      active_today: true, // Year-round service
    },
    {
      operator_id: 'hyline',
      display_name: 'Hy-Line Cruises',
      slug: 'hy-line-cruises',
      official_url: 'https://hylinecruises.com',
      active_today: true, // Seasonal - would be computed dynamically
    },
  ],
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ regionId: string }> }
): Promise<NextResponse> {
  const { regionId } = await params;

  // Validate region ID
  const operators = OPERATORS_BY_REGION[regionId];
  if (!operators) {
    return NextResponse.json(
      {
        success: false,
        operators: null,
        error: `Invalid region ID: ${regionId}`,
      },
      { status: 404 }
    );
  }

  // Return all active operators for region
  return NextResponse.json({
    success: true,
    region_id: regionId,
    operators,
  });
}
