/**
 * Manual Status Cache
 *
 * Phase 22: Single-Corridor Truth Lock
 * Phase 24: SSA Observer Extension support
 * Phase 38: Supabase fallback for serverless environments
 * Phase 47: Sticky cancellation preservation in deduplication
 *
 * In-memory cache for manually submitted SSA status data.
 * Used when automated scraping is blocked by Queue-IT.
 *
 * IMPORTANT: On Vercel serverless, each request may hit a different instance.
 * In-memory cache only works within the same instance. Phase 38 adds a
 * Supabase fallback to read persisted sailing_events when memory cache is empty.
 *
 * This module is shared between the API route and schedule fetcher.
 */

import { createServerClient } from '@/lib/supabase/client';

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

// ============================================================
// PHASE 38: SUPABASE FALLBACK FOR SERVERLESS
// ============================================================

// Supabase DB cache - keeps track of what we've fetched from DB this request
// This prevents hitting Supabase multiple times per request
const SUPABASE_CACHE_KEY = Symbol.for('ferry-forecast-db-cache');
const DB_CACHE_TTL_MS = 60 * 1000; // 1 minute TTL for DB cache

interface DbCacheEntry {
  data: StatusCacheData | null;
  fetchedAt: number;
  serviceDateLocal: string;
}

function getDbCache(): DbCacheEntry | null {
  return (globalThis as Record<symbol, DbCacheEntry | null>)[SUPABASE_CACHE_KEY] || null;
}

function setDbCache(entry: DbCacheEntry): void {
  (globalThis as Record<symbol, DbCacheEntry | null>)[SUPABASE_CACHE_KEY] = entry;
}

/**
 * Get today's date in local timezone (America/New_York)
 */
function getTodayLocal(): string {
  const now = new Date();
  // Format as YYYY-MM-DD in America/New_York
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Phase 38: Fetch status from Supabase when in-memory cache is empty.
 * This is the key fix for serverless environments where each request
 * may hit a different instance with empty memory cache.
 *
 * Returns sailing events for today, converted to CachedSailingStatus format.
 */
export async function getStatusFromDatabase(): Promise<StatusCacheData | null> {
  const todayLocal = getTodayLocal();

  // Check if we have a recent DB cache for today
  const dbCache = getDbCache();
  if (dbCache && dbCache.serviceDateLocal === todayLocal) {
    const age = Date.now() - dbCache.fetchedAt;
    if (age < DB_CACHE_TTL_MS) {
      if (DEBUG_CACHE) {
        console.log('[STATUS_CACHE] getStatusFromDatabase: using DB cache', {
          serviceDateLocal: todayLocal,
          ageSeconds: Math.round(age / 1000),
        });
      }
      return dbCache.data;
    }
  }

  const supabase = createServerClient();
  if (!supabase) {
    if (DEBUG_CACHE) {
      console.log('[STATUS_CACHE] getStatusFromDatabase: no Supabase client');
    }
    return null;
  }

  try {
    // Query sailing_events for today, ordered by most recent observation
    // We use observed_at DESC to get the most recent status for each sailing
    const { data, error } = await supabase
      .from('sailing_events')
      .select('*')
      .eq('service_date', todayLocal)
      .order('observed_at', { ascending: false });

    if (error) {
      console.error('[STATUS_CACHE] getStatusFromDatabase: query error', error);
      // Cache the failure to avoid hammering
      setDbCache({ data: null, fetchedAt: Date.now(), serviceDateLocal: todayLocal });
      return null;
    }

    if (!data || data.length === 0) {
      if (DEBUG_CACHE) {
        console.log('[STATUS_CACHE] getStatusFromDatabase: no events for today', { todayLocal });
      }
      setDbCache({ data: null, fetchedAt: Date.now(), serviceDateLocal: todayLocal });
      return null;
    }

    // Phase 47: Smart deduplication - preserve canceled status
    // When merging multiple observations for the same sailing, cancellations
    // are "sticky" - if ANY observation shows canceled, the sailing stays canceled.
    // This prevents losing cancellations when SSA stops showing morning sailings later.
    // Key: from_port + to_port + departure_time
    const eventsByKey = new Map<string, typeof data[0]>();
    for (const event of data) {
      const key = `${event.from_port}|${event.to_port}|${event.departure_time}`;
      const existing = eventsByKey.get(key);

      if (!existing) {
        // First observation for this sailing
        eventsByKey.set(key, event);
      } else if (event.status === 'canceled' && existing.status !== 'canceled') {
        // This observation is canceled but existing is not - use canceled
        // Keep the canceled observation's details (message, observed_at)
        eventsByKey.set(key, event);
      }
      // Otherwise keep the existing (most recent non-canceled, or already canceled)
    }
    const uniqueEvents = Array.from(eventsByKey.values());

    // Convert to CachedSailingStatus format
    const sailings: CachedSailingStatus[] = uniqueEvents.map((event) => ({
      from: slugToPortName(event.from_port),
      fromSlug: event.from_port,
      to: slugToPortName(event.to_port),
      toSlug: event.to_port,
      departureTime: event.departure_time,
      status: event.status as 'on_time' | 'delayed' | 'canceled',
      statusMessage: event.status_message || undefined,
    }));

    // Find the most recent observation time
    const mostRecentObservation = data[0]?.observed_at;

    const cacheData: StatusCacheData = {
      sailings,
      updatedAt: mostRecentObservation || new Date().toISOString(),
      expiresAt: Date.now() + CACHE_TTL_MS,
      source: 'supabase_sailing_events',
      observedAt: mostRecentObservation,
      serviceDateLocal: todayLocal,
    };

    // Also update in-memory cache so subsequent calls in this request are fast
    statusCache = cacheData;
    setGlobalCache(cacheData);

    // Cache the DB result
    setDbCache({ data: cacheData, fetchedAt: Date.now(), serviceDateLocal: todayLocal });

    if (DEBUG_CACHE) {
      console.log('[STATUS_CACHE] getStatusFromDatabase: loaded from Supabase', {
        sailingsCount: sailings.length,
        serviceDateLocal: todayLocal,
        mostRecentObservation,
      });
    }

    return cacheData;
  } catch (err) {
    console.error('[STATUS_CACHE] getStatusFromDatabase: exception', err);
    return null;
  }
}

/**
 * Convert port slug back to display name
 */
function slugToPortName(slug: string): string {
  const map: Record<string, string> = {
    'woods-hole': 'Woods Hole',
    'vineyard-haven': 'Vineyard Haven',
    'oak-bluffs': 'Oak Bluffs',
    'hyannis': 'Hyannis',
    'nantucket': 'Nantucket',
  };
  return map[slug] || slug;
}

/**
 * Phase 38: Get cached status with Supabase fallback.
 * This is the main entry point for getting status data.
 *
 * Priority:
 * 1. In-memory cache (fast, same instance)
 * 2. Supabase sailing_events (cross-instance persistence)
 */
export async function getCachedStatusWithFallback(): Promise<StatusCacheData | null> {
  // First try in-memory cache
  const memoryCache = getCachedStatus();
  if (memoryCache) {
    return memoryCache;
  }

  // Fall back to Supabase
  return getStatusFromDatabase();
}
