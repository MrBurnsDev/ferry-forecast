// Route Configuration - Data-driven route definitions
// Adding new routes requires only adding to this config, not UI changes

import type { FerryRoute, Region, Port, RouteConfig } from '@/types/forecast';

export const REGIONS: Region[] = [
  {
    id: 'cape-cod-islands',
    name: 'cape-cod-islands',
    display_name: 'Cape Cod & Islands',
  },
];

export const PORTS: Port[] = [
  // Cape Cod
  {
    id: 'woods-hole',
    name: 'woods-hole',
    display_name: 'Woods Hole',
    region_id: 'cape-cod-islands',
  },
  {
    id: 'hyannis',
    name: 'hyannis',
    display_name: 'Hyannis',
    region_id: 'cape-cod-islands',
  },
  // Martha's Vineyard
  {
    id: 'vineyard-haven',
    name: 'vineyard-haven',
    display_name: 'Vineyard Haven',
    region_id: 'cape-cod-islands',
  },
  {
    id: 'oak-bluffs',
    name: 'oak-bluffs',
    display_name: 'Oak Bluffs',
    region_id: 'cape-cod-islands',
  },
  // Nantucket
  {
    id: 'nantucket',
    name: 'nantucket',
    display_name: 'Nantucket',
    region_id: 'cape-cod-islands',
  },
];

export const OPERATORS = {
  STEAMSHIP_AUTHORITY: 'steamship-authority',
  HYLINE_CRUISES: 'hy-line-cruises',
} as const;

export const OPERATOR_DISPLAY_NAMES: Record<string, string> = {
  'steamship-authority': 'The Steamship Authority',
  'hy-line-cruises': 'Hy-Line Cruises',
};

// Initial route definitions for Cape Cod & Islands
// These will be synced to Supabase and can be extended via database
export const ROUTES: FerryRoute[] = [
  // Steamship Authority Routes
  {
    route_id: 'wh-vh-ssa',
    region: 'cape-cod-islands',
    origin_port: 'woods-hole',
    destination_port: 'vineyard-haven',
    operator: 'steamship-authority',
    crossing_type: 'open_water',
    bearing_degrees: 180, // Roughly south
    display_name: 'Woods Hole → Vineyard Haven',
    active: true,
  },
  {
    route_id: 'vh-wh-ssa',
    region: 'cape-cod-islands',
    origin_port: 'vineyard-haven',
    destination_port: 'woods-hole',
    operator: 'steamship-authority',
    crossing_type: 'open_water',
    bearing_degrees: 0, // Roughly north
    display_name: 'Vineyard Haven → Woods Hole',
    active: true,
  },
  {
    route_id: 'wh-ob-ssa',
    region: 'cape-cod-islands',
    origin_port: 'woods-hole',
    destination_port: 'oak-bluffs',
    operator: 'steamship-authority',
    crossing_type: 'open_water',
    bearing_degrees: 165,
    display_name: 'Woods Hole → Oak Bluffs',
    active: true,
  },
  {
    route_id: 'ob-wh-ssa',
    region: 'cape-cod-islands',
    origin_port: 'oak-bluffs',
    destination_port: 'woods-hole',
    operator: 'steamship-authority',
    crossing_type: 'open_water',
    bearing_degrees: 345,
    display_name: 'Oak Bluffs → Woods Hole',
    active: true,
  },
  {
    route_id: 'hy-nan-ssa',
    region: 'cape-cod-islands',
    origin_port: 'hyannis',
    destination_port: 'nantucket',
    operator: 'steamship-authority',
    crossing_type: 'open_water',
    bearing_degrees: 135, // Southeast
    display_name: 'Hyannis → Nantucket',
    active: true,
  },
  {
    route_id: 'nan-hy-ssa',
    region: 'cape-cod-islands',
    origin_port: 'nantucket',
    destination_port: 'hyannis',
    operator: 'steamship-authority',
    crossing_type: 'open_water',
    bearing_degrees: 315, // Northwest
    display_name: 'Nantucket → Hyannis',
    active: true,
  },
  // Hy-Line Cruises Routes
  {
    route_id: 'hy-nan-hlc',
    region: 'cape-cod-islands',
    origin_port: 'hyannis',
    destination_port: 'nantucket',
    operator: 'hy-line-cruises',
    crossing_type: 'open_water',
    bearing_degrees: 135,
    display_name: 'Hyannis → Nantucket',
    active: true,
  },
  {
    route_id: 'nan-hy-hlc',
    region: 'cape-cod-islands',
    origin_port: 'nantucket',
    destination_port: 'hyannis',
    operator: 'hy-line-cruises',
    crossing_type: 'open_water',
    bearing_degrees: 315,
    display_name: 'Nantucket → Hyannis',
    active: true,
  },
  {
    route_id: 'hy-vh-hlc',
    region: 'cape-cod-islands',
    origin_port: 'hyannis',
    destination_port: 'vineyard-haven',
    operator: 'hy-line-cruises',
    crossing_type: 'open_water',
    bearing_degrees: 200, // Southwest
    display_name: 'Hyannis → Vineyard Haven',
    active: true,
  },
  {
    route_id: 'vh-hy-hlc',
    region: 'cape-cod-islands',
    origin_port: 'vineyard-haven',
    destination_port: 'hyannis',
    operator: 'hy-line-cruises',
    crossing_type: 'open_water',
    bearing_degrees: 20, // Northeast
    display_name: 'Vineyard Haven → Hyannis',
    active: true,
  },
];

// Helper functions for data-driven selection

export function getRegions(): Region[] {
  return REGIONS;
}

export function getPortsByRegion(regionId: string): Port[] {
  return PORTS.filter((p) => p.region_id === regionId);
}

export function getRoutesByOrigin(originPortId: string): FerryRoute[] {
  return ROUTES.filter((r) => r.origin_port === originPortId && r.active);
}

export function getRoutesByDestination(
  originPortId: string,
  destinationPortId: string
): FerryRoute[] {
  return ROUTES.filter(
    (r) =>
      r.origin_port === originPortId &&
      r.destination_port === destinationPortId &&
      r.active
  );
}

export function getRouteById(routeId: string): FerryRoute | undefined {
  return ROUTES.find((r) => r.route_id === routeId);
}

export function getOperatorsForRoute(
  originPortId: string,
  destinationPortId: string
): string[] {
  const routes = getRoutesByDestination(originPortId, destinationPortId);
  return [...new Set(routes.map((r) => r.operator))];
}

export function getAvailableDestinations(originPortId: string): Port[] {
  const routes = getRoutesByOrigin(originPortId);
  const destinationIds = [...new Set(routes.map((r) => r.destination_port))];
  return PORTS.filter((p) => destinationIds.includes(p.id));
}

export function getOperatorDisplayName(operatorId: string): string {
  return OPERATOR_DISPLAY_NAMES[operatorId] || operatorId;
}

export function getPortDisplayName(portId: string): string {
  const port = PORTS.find((p) => p.id === portId);
  return port?.display_name || portId;
}

export const routeConfig: RouteConfig = {
  routes: ROUTES,
  regions: REGIONS,
  ports: PORTS,
};
