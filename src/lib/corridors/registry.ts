/**
 * Corridor Coordinate Registry
 *
 * Phase 36: Forecast Coordinate Resolution
 *
 * Provides geographic coordinates for each ferry corridor.
 * Used by forecast ingestion to fetch weather data from Open-Meteo.
 *
 * DESIGN:
 * - Each corridor has from/to terminal coordinates
 * - Midpoint is computed for Open-Meteo queries (marine weather is location-specific)
 * - Coordinates are sourced from official ferry terminal locations
 */

// ============================================================
// TYPES
// ============================================================

export interface TerminalCoordinates {
  lat: number;
  lon: number;
}

export interface CorridorCoordinates {
  corridor_id: string;
  from: TerminalCoordinates;
  to: TerminalCoordinates;
}

export interface ResolvedCoordinates {
  corridor_id: string;
  lat: number;
  lon: number;
  from: TerminalCoordinates;
  to: TerminalCoordinates;
}

// ============================================================
// TERMINAL COORDINATES
// ============================================================

/**
 * Terminal coordinates from official sources
 *
 * Sources:
 * - Woods Hole: 41.5235° N, 70.6724° W (SSA terminal)
 * - Vineyard Haven: 41.4532° N, 70.6024° W (SSA terminal)
 * - Oak Bluffs: 41.4560° N, 70.5583° W (SSA terminal)
 * - Hyannis: 41.6519° N, 70.2834° W (Ocean Street Dock)
 * - Nantucket: 41.2858° N, 70.0972° W (Steamship Wharf)
 */
const TERMINAL_COORDS: Record<string, TerminalCoordinates> = {
  'woods-hole': { lat: 41.5235, lon: -70.6724 },
  'vineyard-haven': { lat: 41.4532, lon: -70.6024 },
  'oak-bluffs': { lat: 41.4560, lon: -70.5583 },
  'hyannis': { lat: 41.6519, lon: -70.2834 },
  'nantucket': { lat: 41.2858, lon: -70.0972 },
};

// ============================================================
// CORRIDOR DEFINITIONS
// ============================================================

/**
 * All corridor coordinate definitions
 *
 * Uses terminal IDs that match src/lib/config/corridors.ts
 */
const CORRIDOR_REGISTRY: CorridorCoordinates[] = [
  {
    corridor_id: 'woods-hole-vineyard-haven',
    from: TERMINAL_COORDS['woods-hole'],
    to: TERMINAL_COORDS['vineyard-haven'],
  },
  {
    corridor_id: 'woods-hole-oak-bluffs',
    from: TERMINAL_COORDS['woods-hole'],
    to: TERMINAL_COORDS['oak-bluffs'],
  },
  {
    corridor_id: 'hyannis-nantucket',
    from: TERMINAL_COORDS['hyannis'],
    to: TERMINAL_COORDS['nantucket'],
  },
  {
    corridor_id: 'hyannis-vineyard-haven',
    from: TERMINAL_COORDS['hyannis'],
    to: TERMINAL_COORDS['vineyard-haven'],
  },
];

// ============================================================
// LOOKUP FUNCTIONS
// ============================================================

/**
 * Compute midpoint between two coordinates
 *
 * For short distances like ferry routes, simple averaging is sufficient.
 * For longer routes, use proper great circle midpoint calculation.
 */
function computeMidpoint(from: TerminalCoordinates, to: TerminalCoordinates): TerminalCoordinates {
  return {
    lat: (from.lat + to.lat) / 2,
    lon: (from.lon + to.lon) / 2,
  };
}

/**
 * Get coordinates for a corridor
 *
 * Returns resolved coordinates with midpoint for weather queries.
 * Returns null if corridor is not registered.
 */
export function getCorridorCoordinates(corridorId: string): ResolvedCoordinates | null {
  const corridor = CORRIDOR_REGISTRY.find((c) => c.corridor_id === corridorId);
  if (!corridor) {
    return null;
  }

  const midpoint = computeMidpoint(corridor.from, corridor.to);

  return {
    corridor_id: corridorId,
    lat: midpoint.lat,
    lon: midpoint.lon,
    from: corridor.from,
    to: corridor.to,
  };
}

/**
 * Get all registered corridor IDs
 */
export function getRegisteredCorridorIds(): string[] {
  return CORRIDOR_REGISTRY.map((c) => c.corridor_id);
}

/**
 * Check if a corridor has coordinates registered
 */
export function hasCoordinates(corridorId: string): boolean {
  return CORRIDOR_REGISTRY.some((c) => c.corridor_id === corridorId);
}

/**
 * Get all registered corridors with coordinates
 */
export function getAllCorridorCoordinates(): ResolvedCoordinates[] {
  return CORRIDOR_REGISTRY.map((corridor) => {
    const midpoint = computeMidpoint(corridor.from, corridor.to);
    return {
      corridor_id: corridor.corridor_id,
      lat: midpoint.lat,
      lon: midpoint.lon,
      from: corridor.from,
      to: corridor.to,
    };
  });
}

/**
 * Get terminal coordinates by terminal ID
 */
export function getTerminalCoordinates(terminalId: string): TerminalCoordinates | null {
  return TERMINAL_COORDS[terminalId] || null;
}
