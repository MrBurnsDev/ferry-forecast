// Supabase Data Access Layer
// Loads configuration data (regions, ports, operators, routes) from Supabase

import { supabase, isSupabaseConfigured } from './client';

// ============================================
// Types matching database schema
// ============================================

export interface DbRegion {
  region_id: string;
  name: string;
  slug: string;
  display_order: number;
  active: boolean;
}

export interface DbPort {
  port_id: string;
  region_id: string;
  name: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  noaa_station_id: string | null;
  display_order: number;
  active: boolean;
}

export interface DbOperator {
  operator_id: string;
  name: string;
  slug: string;
  website_url: string | null;
  status_page_url: string | null;
  active: boolean;
}

export interface DbRoute {
  route_id: string;
  region_id: string;
  origin_port_id: string;
  destination_port_id: string;
  operator_id: string;
  slug: string;
  crossing_type: 'open_water' | 'protected' | 'mixed';
  bearing_degrees: number;
  typical_duration_minutes: number | null;
  distance_nautical_miles: number | null;
  active: boolean;
}

export interface DbVessel {
  vessel_id: string;
  operator_id: string;
  name: string;
  vessel_class: 'large_ferry' | 'fast_ferry' | 'traditional_ferry' | 'high_speed_catamaran';
  year_built: number | null;
  passenger_capacity: number | null;
  vehicle_capacity: number | null;
  active: boolean;
}

export interface DbRouteVessel {
  route_id: string;
  vessel_id: string;
  is_primary: boolean;
}

export interface DbVesselThreshold {
  threshold_id: string;
  vessel_id: string;
  wind_limit_mph: number;
  gust_limit_mph: number;
  wave_height_limit_ft: number | null;
  directional_sensitivity: number;
  advisory_sensitivity: number;
  custom_thresholds: Record<string, unknown> | null;
  notes: string | null;
}

// ============================================
// Full route view (matches routes_full view)
// ============================================

export interface RouteFull {
  route_id: string;
  route_slug: string;
  crossing_type: string;
  bearing_degrees: number;
  typical_duration_minutes: number | null;
  distance_nautical_miles: number | null;
  route_active: boolean;
  region_id: string;
  region_name: string;
  region_slug: string;
  origin_port_id: string;
  origin_port_name: string;
  origin_port_slug: string;
  origin_latitude: number | null;
  origin_longitude: number | null;
  origin_noaa_station: string | null;
  destination_port_id: string;
  destination_port_name: string;
  destination_port_slug: string;
  destination_latitude: number | null;
  destination_longitude: number | null;
  destination_noaa_station: string | null;
  operator_id: string;
  operator_name: string;
  operator_slug: string;
  operator_website: string | null;
  operator_status_page: string | null;
}

// ============================================
// Query Result Types
// ============================================

export interface QueryResult<T> {
  data: T | null;
  error: string | null;
  fromFallback: boolean;
}

// ============================================
// Query Functions
// ============================================

/**
 * Fetch all active regions
 */
export async function fetchRegions(): Promise<QueryResult<DbRegion[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    const { data, error } = await supabase
      .from('regions')
      .select('*')
      .eq('active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Supabase regions query error:', error);
      return { data: null, error: error.message, fromFallback: true };
    }

    return { data, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase regions fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}

/**
 * Fetch ports for a specific region
 */
export async function fetchPortsByRegion(
  regionSlug: string
): Promise<QueryResult<DbPort[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    // First get the region_id from slug
    const { data: region, error: regionError } = await supabase
      .from('regions')
      .select('region_id')
      .eq('slug', regionSlug)
      .single();

    if (regionError || !region) {
      return { data: null, error: 'Region not found', fromFallback: true };
    }

    const { data, error } = await supabase
      .from('ports')
      .select('*')
      .eq('region_id', region.region_id)
      .eq('active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Supabase ports query error:', error);
      return { data: null, error: error.message, fromFallback: true };
    }

    return { data, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase ports fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}

/**
 * Fetch all active operators
 */
export async function fetchOperators(): Promise<QueryResult<DbOperator[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    const { data, error } = await supabase
      .from('operators')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Supabase operators query error:', error);
      return { data: null, error: error.message, fromFallback: true };
    }

    return { data, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase operators fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}

/**
 * Fetch all active routes with full details using the routes_full view
 */
export async function fetchAllRoutes(): Promise<QueryResult<RouteFull[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    const { data, error } = await supabase
      .from('routes_full')
      .select('*')
      .eq('route_active', true);

    if (error) {
      console.error('Supabase routes query error:', error);
      return { data: null, error: error.message, fromFallback: true };
    }

    return { data, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase routes fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}

/**
 * Fetch all routes with full details using the routes_full view
 */
export async function fetchRoutesFull(): Promise<QueryResult<RouteFull[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    const { data, error } = await supabase
      .from('routes_full')
      .select('*');

    if (error) {
      console.error('Supabase routes_full query error:', error);
      return { data: null, error: error.message, fromFallback: true };
    }

    return { data, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase routes_full fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}

/**
 * Fetch a single route by slug
 */
export async function fetchRouteBySlug(
  routeSlug: string
): Promise<QueryResult<RouteFull>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    const { data, error } = await supabase
      .from('routes_full')
      .select('*')
      .eq('route_slug', routeSlug)
      .single();

    if (error) {
      console.error('Supabase route query error:', error);
      return { data: null, error: error.message, fromFallback: true };
    }

    return { data, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase route fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}

/**
 * Fetch vessels for a specific route
 */
export async function fetchVesselsForRoute(
  routeId: string
): Promise<QueryResult<(DbVessel & { is_primary: boolean; threshold?: DbVesselThreshold })[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    // Get route_vessels with vessel details
    const { data: routeVessels, error: rvError } = await supabase
      .from('route_vessels')
      .select(`
        vessel_id,
        is_primary,
        vessels (
          vessel_id,
          operator_id,
          name,
          vessel_class,
          year_built,
          passenger_capacity,
          vehicle_capacity,
          active
        )
      `)
      .eq('route_id', routeId);

    if (rvError) {
      console.error('Supabase route_vessels query error:', rvError);
      return { data: null, error: rvError.message, fromFallback: true };
    }

    if (!routeVessels || routeVessels.length === 0) {
      return { data: [], error: null, fromFallback: false };
    }

    // Get thresholds for these vessels
    const vesselIds = routeVessels.map((rv) => rv.vessel_id);
    const { data: thresholds, error: thError } = await supabase
      .from('vessel_thresholds')
      .select('*')
      .in('vessel_id', vesselIds);

    if (thError) {
      console.error('Supabase vessel_thresholds query error:', thError);
      // Continue without thresholds
    }

    const thresholdMap = new Map<string, DbVesselThreshold>();
    if (thresholds) {
      for (const t of thresholds) {
        thresholdMap.set(t.vessel_id, t);
      }
    }

    // Combine data - vessels comes as a single object due to the FK relationship
    const result = routeVessels
      .filter((rv) => {
        const vessel = rv.vessels as unknown as DbVessel | null;
        return vessel && vessel.active;
      })
      .map((rv) => {
        const vessel = rv.vessels as unknown as DbVessel;
        return {
          ...vessel,
          is_primary: rv.is_primary,
          threshold: thresholdMap.get(rv.vessel_id),
        };
      });

    return { data: result, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase vessels fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}

/**
 * Fetch routes from a specific origin port
 */
export async function fetchRoutesFromOrigin(
  originPortSlug: string
): Promise<QueryResult<RouteFull[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    const { data, error } = await supabase
      .from('routes_full')
      .select('*')
      .eq('origin_port_slug', originPortSlug);

    if (error) {
      console.error('Supabase routes from origin query error:', error);
      return { data: null, error: error.message, fromFallback: true };
    }

    return { data, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase routes from origin fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}

/**
 * Fetch all ports in a region with their route availability
 */
export async function fetchPortsWithRoutes(
  regionSlug: string
): Promise<QueryResult<{ port: DbPort; hasOutboundRoutes: boolean; hasInboundRoutes: boolean }[]>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'Supabase not configured', fromFallback: true };
  }

  try {
    // Get all ports
    const portsResult = await fetchPortsByRegion(regionSlug);
    if (portsResult.error || !portsResult.data) {
      return { data: null, error: portsResult.error, fromFallback: true };
    }

    // Get all routes for this region
    const routesResult = await fetchRoutesFull();
    if (routesResult.error || !routesResult.data) {
      return { data: null, error: routesResult.error, fromFallback: true };
    }

    const regionRoutes = routesResult.data.filter(
      (r) => r.region_slug === regionSlug
    );

    const result = portsResult.data.map((port) => ({
      port,
      hasOutboundRoutes: regionRoutes.some(
        (r) => r.origin_port_slug === port.slug
      ),
      hasInboundRoutes: regionRoutes.some(
        (r) => r.destination_port_slug === port.slug
      ),
    }));

    return { data: result, error: null, fromFallback: false };
  } catch (err) {
    console.error('Supabase ports with routes fetch error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
      fromFallback: true,
    };
  }
}
