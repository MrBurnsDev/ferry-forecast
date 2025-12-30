/**
 * Manual Status Cache
 *
 * Phase 22: Single-Corridor Truth Lock
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
}

export interface StatusCacheData {
  sailings: CachedSailingStatus[];
  updatedAt: string;
  expiresAt: number;
}

// Global cache instance
let statusCache: StatusCacheData | null = null;

// Cache TTL: 30 minutes
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Get current cached status
 */
export function getCachedStatus(): StatusCacheData | null {
  if (!statusCache || Date.now() > statusCache.expiresAt) {
    return null;
  }
  return statusCache;
}

/**
 * Set cached status
 */
export function setCachedStatus(sailings: CachedSailingStatus[]): void {
  statusCache = {
    sailings,
    updatedAt: new Date().toISOString(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

/**
 * Clear cached status
 */
export function clearCachedStatus(): void {
  statusCache = null;
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
  if (!cache) return null;

  const normalizedTime = normalizeTime(departureTime);

  return cache.sailings.find(
    (s) =>
      s.fromSlug === fromSlug &&
      s.toSlug === toSlug &&
      normalizeTime(s.departureTime) === normalizedTime
  ) || null;
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
