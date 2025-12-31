/**
 * Corridor Coordinate Registry
 *
 * Phase 36: Forecast Coordinate Resolution
 * Phase 36.1: Static Object Pattern for Vercel Serverless
 *
 * Provides geographic coordinates for each ferry corridor.
 * Used by forecast ingestion to fetch weather data from Open-Meteo.
 *
 * DESIGN:
 * - Static exported CORRIDOR_COORDINATES object (no registration, no side effects)
 * - Each corridor has from/to terminal coordinates
 * - Midpoint is computed for Open-Meteo queries (marine weather is location-specific)
 * - Coordinates are sourced from official ferry terminal locations
 *
 * VERCEL SERVERLESS COMPATIBILITY:
 * - All data is statically defined at module level
 * - No dynamic registration or side effects
 * - Object.keys() used for corridor ID enumeration
 */

// ============================================================
// TYPES
// ============================================================

export interface TerminalCoordinates {
  lat: number;
  lon: number;
}

export interface CorridorCoordinateEntry {
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
// TERMINAL COORDINATES (STATIC)
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
export const TERMINAL_COORDINATES: Readonly<Record<string, TerminalCoordinates>> = {
  'woods-hole': { lat: 41.5235, lon: -70.6724 },
  'vineyard-haven': { lat: 41.4532, lon: -70.6024 },
  'oak-bluffs': { lat: 41.456, lon: -70.5583 },
  'hyannis': { lat: 41.6519, lon: -70.2834 },
  'nantucket': { lat: 41.2858, lon: -70.0972 },
} as const;

// ============================================================
// CORRIDOR COORDINATES (STATIC EXPORTED OBJECT)
// ============================================================

/**
 * Static corridor coordinate definitions
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for corridor IDs.
 * All forecast ingestion relies on Object.keys(CORRIDOR_COORDINATES).
 *
 * Corridor IDs match src/lib/config/corridors.ts
 */
export const CORRIDOR_COORDINATES: Readonly<Record<string, CorridorCoordinateEntry>> = {
  'woods-hole-vineyard-haven': {
    from: { lat: 41.5235, lon: -70.6724 },
    to: { lat: 41.4532, lon: -70.6024 },
  },
  'woods-hole-oak-bluffs': {
    from: { lat: 41.5235, lon: -70.6724 },
    to: { lat: 41.456, lon: -70.5583 },
  },
  'hyannis-nantucket': {
    from: { lat: 41.6519, lon: -70.2834 },
    to: { lat: 41.2858, lon: -70.0972 },
  },
  'hyannis-vineyard-haven': {
    from: { lat: 41.6519, lon: -70.2834 },
    to: { lat: 41.4532, lon: -70.6024 },
  },
} as const;

// ============================================================
// FATAL GUARD - Runtime Check at Module Load
// ============================================================

// Runtime guard that runs at module load
const CORRIDOR_IDS = Object.keys(CORRIDOR_COORDINATES);
if (CORRIDOR_IDS.length === 0) {
  throw new Error(
    '[CORRIDOR_REGISTRY] FATAL: CORRIDOR_COORDINATES is empty. ' +
      'This is a build/bundle error - the static corridor definitions are missing. ' +
      'Check src/lib/corridors/registry.ts'
  );
}

// Log at module load for debugging in Vercel
console.log(`[CORRIDOR_REGISTRY] Loaded ${CORRIDOR_IDS.length} corridors: [${CORRIDOR_IDS.join(', ')}]`);

// ============================================================
// LOOKUP FUNCTIONS
// ============================================================

/**
 * Compute midpoint between two coordinates
 *
 * For short distances like ferry routes, simple averaging is sufficient.
 */
function computeMidpoint(from: TerminalCoordinates, to: TerminalCoordinates): TerminalCoordinates {
  return {
    lat: (from.lat + to.lat) / 2,
    lon: (from.lon + to.lon) / 2,
  };
}

/**
 * Get all registered corridor IDs
 *
 * FATAL GUARD: Throws if no corridors are registered.
 * This should never happen unless there's a build/bundle error.
 */
export function getRegisteredCorridorIds(): string[] {
  const ids = Object.keys(CORRIDOR_COORDINATES);

  // Fatal guard - this is a sanity check
  if (ids.length === 0) {
    throw new Error(
      '[CORRIDOR_REGISTRY] FATAL: getRegisteredCorridorIds() returned 0 corridors. ' +
        'CORRIDOR_COORDINATES object is empty at runtime. ' +
        'This indicates a bundling or tree-shaking issue.'
    );
  }

  return ids;
}

/**
 * Get coordinates for a corridor
 *
 * Returns resolved coordinates with midpoint for weather queries.
 * Returns null if corridor is not registered.
 */
export function getCorridorCoordinates(corridorId: string): ResolvedCoordinates | null {
  const entry = CORRIDOR_COORDINATES[corridorId];
  if (!entry) {
    return null;
  }

  const midpoint = computeMidpoint(entry.from, entry.to);

  return {
    corridor_id: corridorId,
    lat: midpoint.lat,
    lon: midpoint.lon,
    from: entry.from,
    to: entry.to,
  };
}

/**
 * Check if a corridor has coordinates registered
 */
export function hasCoordinates(corridorId: string): boolean {
  return corridorId in CORRIDOR_COORDINATES;
}

/**
 * Get all registered corridors with coordinates
 */
export function getAllCorridorCoordinates(): ResolvedCoordinates[] {
  return Object.entries(CORRIDOR_COORDINATES).map(([corridorId, entry]) => {
    const midpoint = computeMidpoint(entry.from, entry.to);
    return {
      corridor_id: corridorId,
      lat: midpoint.lat,
      lon: midpoint.lon,
      from: entry.from,
      to: entry.to,
    };
  });
}

/**
 * Get terminal coordinates by terminal ID
 */
export function getTerminalCoordinates(terminalId: string): TerminalCoordinates | null {
  return TERMINAL_COORDINATES[terminalId] || null;
}
