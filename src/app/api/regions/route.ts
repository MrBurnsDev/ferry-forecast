/**
 * Regions API Endpoint
 *
 * Phase 59: Region/Operator/Route Authority
 *
 * GET /api/regions
 *
 * Returns all active regions. This is the top-level entry point for the
 * Region → Operator → Route navigation hierarchy.
 */

import { NextResponse } from 'next/server';

// Region type
interface Region {
  id: string;
  slug: string;
  display_name: string;
}

// Static region config (source of truth until Supabase migration runs)
const REGIONS: Region[] = [
  {
    id: 'cci',
    slug: 'cape-cod-islands',
    display_name: 'Cape Cod & Islands',
  },
];

export async function GET(): Promise<NextResponse> {
  // Return all active regions
  return NextResponse.json({
    success: true,
    regions: REGIONS,
  });
}
