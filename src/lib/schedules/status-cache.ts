/**
 * Manual Status Cache
 *
 * Phase 22: Single-Corridor Truth Lock
 * Phase 24: SSA Observer Extension support
 *
 * In-memory cache for manually submitted SSA status data.
 * Used when automated scraping is blocked by Queue-IT.
 *
 * This module is shared between the API route and schedule fetcher.
 */

export interface CachedSailingStatus {
  from: string;
  fromSlug: string;
  to: string;
  toSlug: string;
  departureTime: string;
  status: 'on_time' | 'delayed' | 'canceled';
  statusMessage?: string;
  boardId?: string; // Phase 24: which board this came from (vineyard_trips, nantucket_trips)
}

export interface StatusCacheMetadata {
  source?: string;
  observedAt?: string;
  operatorId?: string;
  serviceDateLocal?: string;
  timezone?: string;
  pageHash?: string;
}

export interface StatusCacheData {
  sailings: CachedSailingStatus[];
  updatedAt: string;
  expiresAt: number;
  // Phase 24: Extended metadata from extension
  source?: string;
  observedAt?: string;
  operatorId?: string;
  serviceDateLocal?: string;
  timezone?: string;
  pageHash?: string;
}

// Global cache instance - use globalThis to persist across module reloads in dev
// This is necessary because Next.js can hot-reload modules independently
const CACHE_KEY = Symbol.for('ferry-forecast-status-cache');

function getGlobalCache(): StatusCacheData | null {
  return (globalThis as Record<symbol, StatusCacheData | null>)[CACHE_KEY] || null;
}

function setGlobalCache(data: StatusCacheData | null): void {
  (globalThis as Record<symbol, StatusCacheData | null>)[CACHE_KEY] = data;
}

// Keep local variable for type checking but always sync with globalThis
let statusCache: StatusCacheData | null = getGlobalCache();

// Cache TTL: 30 minutes
const CACHE_TTL_MS = 30 * 60 * 1000;

// Debug flag
const DEBUG_CACHE = process.env.DEBUG_STATUS_CACHE === 'true' || process.env.NODE_ENV === 'development';

/**
 * Get current cached status
 */
export function getCachedStatus(): StatusCacheData | null {
  // Always read from globalThis to handle module reloads
  statusCache = getGlobalCache();

  if (!statusCache) {
    if (DEBUG_CACHE) {
      console.log('[STATUS_CACHE] getCachedStatus: cache is null');
    }
    return null;
  }

  if (Date.now() > statusCache.expiresAt) {
    if (DEBUG_CACHE) {
      console.log('[STATUS_CACHE] getCachedStatus: cache expired', {
        expiresAt: new Date(statusCache.expiresAt).toISOString(),
        now: new Date().toISOString(),
      });
    }
    return null;
  }

  if (DEBUG_CACHE) {
    console.log('[STATUS_CACHE] getCachedStatus: returning cache', {
      sailingsCount: statusCache.sailings.length,
      source: statusCache.source,
      updatedAt: statusCache.updatedAt,
      expiresIn: Math.round((statusCache.expiresAt - Date.now()) / 1000) + 's',
    });
  }
  return statusCache;
}

/**
 * Set cached status (basic)
 */
export function setCachedStatus(sailings: CachedSailingStatus[]): void {
  statusCache = {
    sailings,
    updatedAt: new Date().toISOString(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  // Persist to globalThis for cross-module access
  setGlobalCache(statusCache);
}

/**
 * Set cached status with extended metadata (Phase 24)
 */
export function setExtendedCachedStatus(
  sailings: CachedSailingStatus[],
  metadata: StatusCacheMetadata
): void {
  statusCache = {
    sailings,
    updatedAt: new Date().toISOString(),
    expiresAt: Date.now() + CACHE_TTL_MS,
    source: metadata.source,
    observedAt: metadata.observedAt,
    operatorId: metadata.operatorId,
    serviceDateLocal: metadata.serviceDateLocal,
    timezone: metadata.timezone,
    pageHash: metadata.pageHash,
  };
  // Persist to globalThis for cross-module access
  setGlobalCache(statusCache);

  if (DEBUG_CACHE) {
    console.log('[STATUS_CACHE] setExtendedCachedStatus: cache updated', {
      sailingsCount: sailings.length,
      source: metadata.source,
      operatorId: metadata.operatorId,
      serviceDateLocal: metadata.serviceDateLocal,
      expiresAt: new Date(statusCache.expiresAt).toISOString(),
      sailingsSummary: sailings.map(s => ({
        from: s.fromSlug,
        to: s.toSlug,
        time: s.departureTime,
        status: s.status,
      })),
    });
  }
}

/**
 * Clear cached status
 */
export function clearCachedStatus(): void {
  statusCache = null;
  setGlobalCache(null);
}

/**
 * Get status for a specific sailing by port pair and time
 */
export function getStatusForSailing(
  fromSlug: string,
  toSlug: string,
  departureTime: string
): CachedSailingStatus | null {
  const cache = getCachedStatus();
  if (!cache) {
    if (DEBUG_CACHE) {
      console.log('[STATUS_CACHE] getStatusForSailing: no cache', { fromSlug, toSlug, departureTime });
    }
    return null;
  }

  const normalizedTime = normalizeTime(departureTime);

  const match = cache.sailings.find(
    (s) =>
      s.fromSlug === fromSlug &&
      s.toSlug === toSlug &&
      normalizeTime(s.departureTime) === normalizedTime
  ) || null;

  if (DEBUG_CACHE) {
    console.log('[STATUS_CACHE] getStatusForSailing:', {
      query: { fromSlug, toSlug, departureTime, normalizedTime },
      match: match ? { status: match.status, fromSlug: match.fromSlug, toSlug: match.toSlug, time: match.departureTime } : null,
      cacheHasSailings: cache.sailings.length,
    });
  }

  return match;
}

/**
 * Normalize time for comparison
 */
function normalizeTime(time: string): string {
  return time.toLowerCase().replace(/\s+/g, '');
}

/**
 * Convert port name to slug
 */
export function portNameToSlug(name: string): string {
  const map: Record<string, string> = {
    'woods hole': 'woods-hole',
    'vineyard haven': 'vineyard-haven',
    'oak bluffs': 'oak-bluffs',
    'hyannis': 'hyannis',
    'nantucket': 'nantucket',
  };
  return map[name.toLowerCase().trim()] || name.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Normalize status value
 */
export function normalizeStatus(status: string): 'on_time' | 'delayed' | 'canceled' {
  const lower = status.toLowerCase();
  if (lower.includes('cancel')) return 'canceled';
  if (lower.includes('delay')) return 'delayed';
  return 'on_time';
}
