/**
 * Corridor Weather Source Configuration
 *
 * Phase 50: Cancellation Weather Enrichment
 *
 * Maps corridors to their relevant weather observation sources:
 * - NDBC buoys (marine conditions along the route)
 * - NWS land stations (terminal area conditions)
 * - NOAA gridpoints (forecast data)
 *
 * DESIGN PRINCIPLES:
 * - All source IDs are real NDBC/NWS station IDs (no mock data)
 * - Multiple sources per corridor for redundancy
 * - Easy to extend for new corridors
 */

// ============================================================
// TYPES
// ============================================================

export interface BuoySource {
  id: string;           // NDBC station ID (e.g., '44020')
  name: string;         // Human-readable name
  lat: number;
  lon: number;
  priority: number;     // Lower = higher priority, used for primary source selection
}

export interface LandStationSource {
  id: string;           // NWS station ID (e.g., 'KHYA' for Hyannis)
  name: string;
  terminal_slug: string; // Which terminal this station represents
  lat: number;
  lon: number;
}

export interface GridpointSource {
  office: string;       // NWS office (e.g., 'BOX' for Boston)
  gridX: number;
  gridY: number;
  terminal_slug: string; // Which terminal this gridpoint represents
}

export interface CorridorWeatherSources {
  corridor_id: string;
  buoys: BuoySource[];
  land_stations: LandStationSource[];
  gridpoints: GridpointSource[];
}

// ============================================================
// NDBC BUOY SOURCES
// Reference: https://www.ndbc.noaa.gov/
// ============================================================

/**
 * NDBC Buoys relevant to Cape Cod & Islands ferries
 *
 * Station selection criteria:
 * 1. Proximity to ferry routes
 * 2. Data availability/reliability
 * 3. Coverage of Vineyard Sound, Nantucket Sound
 */
const CAPE_COD_BUOYS: Record<string, BuoySource> = {
  // Buzzards Bay Entrance (west of Woods Hole)
  '44020': {
    id: '44020',
    name: 'Nantucket Sound',
    lat: 41.443,
    lon: -70.186,
    priority: 1,
  },
  // Buzzards Bay Tower
  'BUZM3': {
    id: 'BUZM3',
    name: 'Buzzards Bay',
    lat: 41.397,
    lon: -71.033,
    priority: 2,
  },
  // Vineyard Sound (relevant for WH-VH crossing)
  '44097': {
    id: '44097',
    name: 'Block Island',
    lat: 40.969,
    lon: -71.127,
    priority: 3,
  },
};

// ============================================================
// NWS LAND STATION SOURCES
// Reference: https://www.weather.gov/documentation/services-web-api
// ============================================================

/**
 * NWS METAR stations near ferry terminals
 * These provide official airport weather observations
 */
const CAPE_COD_STATIONS: Record<string, LandStationSource> = {
  // Hyannis Barnstable Municipal Airport
  'KHYA': {
    id: 'KHYA',
    name: 'Hyannis Airport',
    terminal_slug: 'hyannis',
    lat: 41.6693,
    lon: -70.2804,
  },
  // Martha's Vineyard Airport
  'KMVY': {
    id: 'KMVY',
    name: "Martha's Vineyard Airport",
    terminal_slug: 'vineyard-haven',
    lat: 41.3931,
    lon: -70.6139,
  },
  // Nantucket Memorial Airport
  'KACK': {
    id: 'KACK',
    name: 'Nantucket Airport',
    terminal_slug: 'nantucket',
    lat: 41.2531,
    lon: -70.0604,
  },
  // Falmouth (closest to Woods Hole - not an airport but CMAN station)
  'BZBM3': {
    id: 'BZBM3',
    name: 'Buzzards Bay CMAN',
    terminal_slug: 'woods-hole',
    lat: 41.3967,
    lon: -70.6683,
  },
};

// ============================================================
// NOAA GRIDPOINT SOURCES
// These are pre-computed from coordinates using weather.gov/points API
// ============================================================

/**
 * NWS gridpoints for forecast data
 * Format: office/gridX,gridY (e.g., BOX/78,54)
 */
const CAPE_COD_GRIDPOINTS: Record<string, GridpointSource> = {
  'woods-hole': {
    office: 'BOX',
    gridX: 78,
    gridY: 54,
    terminal_slug: 'woods-hole',
  },
  'vineyard-haven': {
    office: 'BOX',
    gridX: 80,
    gridY: 52,
    terminal_slug: 'vineyard-haven',
  },
  'hyannis': {
    office: 'BOX',
    gridX: 82,
    gridY: 56,
    terminal_slug: 'hyannis',
  },
  'nantucket': {
    office: 'BOX',
    gridX: 86,
    gridY: 51,
    terminal_slug: 'nantucket',
  },
};

// ============================================================
// CORRIDOR CONFIGURATION
// ============================================================

/**
 * Weather sources for each corridor
 *
 * Each corridor specifies:
 * - Which buoys are relevant (route-level marine data)
 * - Which land stations to query (terminal conditions)
 * - Which gridpoints for forecast (departure window context)
 */
export const CORRIDOR_WEATHER_SOURCES: CorridorWeatherSources[] = [
  // Woods Hole ↔ Vineyard Haven
  {
    corridor_id: 'woods-hole-vineyard-haven',
    buoys: [
      CAPE_COD_BUOYS['44020'],   // Nantucket Sound - primary
      CAPE_COD_BUOYS['BUZM3'],   // Buzzards Bay - secondary
    ],
    land_stations: [
      CAPE_COD_STATIONS['BZBM3'],  // Woods Hole area
      CAPE_COD_STATIONS['KMVY'],   // Martha's Vineyard
    ],
    gridpoints: [
      CAPE_COD_GRIDPOINTS['woods-hole'],
      CAPE_COD_GRIDPOINTS['vineyard-haven'],
    ],
  },

  // Woods Hole ↔ Oak Bluffs (same sources as WH-VH)
  {
    corridor_id: 'woods-hole-oak-bluffs',
    buoys: [
      CAPE_COD_BUOYS['44020'],
      CAPE_COD_BUOYS['BUZM3'],
    ],
    land_stations: [
      CAPE_COD_STATIONS['BZBM3'],
      CAPE_COD_STATIONS['KMVY'],
    ],
    gridpoints: [
      CAPE_COD_GRIDPOINTS['woods-hole'],
      CAPE_COD_GRIDPOINTS['vineyard-haven'],
    ],
  },

  // Hyannis ↔ Nantucket
  {
    corridor_id: 'hyannis-nantucket',
    buoys: [
      CAPE_COD_BUOYS['44020'],   // Nantucket Sound - right on the route
    ],
    land_stations: [
      CAPE_COD_STATIONS['KHYA'],  // Hyannis
      CAPE_COD_STATIONS['KACK'],  // Nantucket
    ],
    gridpoints: [
      CAPE_COD_GRIDPOINTS['hyannis'],
      CAPE_COD_GRIDPOINTS['nantucket'],
    ],
  },

  // Hyannis ↔ Vineyard Haven
  {
    corridor_id: 'hyannis-vineyard-haven',
    buoys: [
      CAPE_COD_BUOYS['44020'],
    ],
    land_stations: [
      CAPE_COD_STATIONS['KHYA'],
      CAPE_COD_STATIONS['KMVY'],
    ],
    gridpoints: [
      CAPE_COD_GRIDPOINTS['hyannis'],
      CAPE_COD_GRIDPOINTS['vineyard-haven'],
    ],
  },
];

// ============================================================
// LOOKUP HELPERS
// ============================================================

/**
 * Get weather sources for a corridor
 */
export function getWeatherSourcesForCorridor(
  corridorId: string
): CorridorWeatherSources | null {
  return CORRIDOR_WEATHER_SOURCES.find(c => c.corridor_id === corridorId) || null;
}

/**
 * Get primary buoy for a corridor (highest priority)
 */
export function getPrimaryBuoyForCorridor(corridorId: string): BuoySource | null {
  const sources = getWeatherSourcesForCorridor(corridorId);
  if (!sources || sources.buoys.length === 0) return null;

  // Sort by priority (lower = higher priority)
  const sorted = [...sources.buoys].sort((a, b) => a.priority - b.priority);
  return sorted[0];
}

/**
 * Get land station for a specific terminal
 */
export function getLandStationForTerminal(terminalSlug: string): LandStationSource | null {
  for (const sources of CORRIDOR_WEATHER_SOURCES) {
    const station = sources.land_stations.find(s => s.terminal_slug === terminalSlug);
    if (station) return station;
  }
  return null;
}

/**
 * Get gridpoint for a specific terminal
 */
export function getGridpointForTerminal(terminalSlug: string): GridpointSource | null {
  for (const sources of CORRIDOR_WEATHER_SOURCES) {
    const gridpoint = sources.gridpoints.find(g => g.terminal_slug === terminalSlug);
    if (gridpoint) return gridpoint;
  }
  return null;
}

/**
 * Check if a corridor has weather sources configured
 */
export function hasWeatherSourcesForCorridor(corridorId: string): boolean {
  return getWeatherSourcesForCorridor(corridorId) !== null;
}
