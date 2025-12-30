import { NextResponse } from 'next/server';
import { fetchAllRoutes } from '@/lib/supabase/queries';
import { ROUTES } from '@/lib/config/routes';
import type { FerryRoute } from '@/types/forecast';

/**
 * GET /api/routes
 *
 * Returns list of available ferry routes.
 * Tries Supabase first, falls back to static config.
 */
export async function GET(): Promise<NextResponse> {
  // Try Supabase first
  const supabaseResult = await fetchAllRoutes();

  if (supabaseResult.data && supabaseResult.data.length > 0) {
    const routes: FerryRoute[] = supabaseResult.data.map((r) => ({
      route_id: r.route_slug,
      region: r.region_slug,
      origin_port: r.origin_port_slug,
      destination_port: r.destination_port_slug,
      operator: r.operator_slug,
      crossing_type: r.crossing_type as 'open_water' | 'protected' | 'mixed',
      bearing_degrees: r.bearing_degrees,
      active: r.route_active,
    }));

    return NextResponse.json(
      {
        routes,
        source: 'supabase',
        count: routes.length,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=300', // 5 minutes
        },
      }
    );
  }

  // Fall back to static config
  const staticRoutes = ROUTES.filter((r) => r.active);

  return NextResponse.json(
    {
      routes: staticRoutes,
      source: 'static',
      count: staticRoutes.length,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}
