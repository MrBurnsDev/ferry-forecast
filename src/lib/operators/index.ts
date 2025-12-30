// Unified Operator Status Service
// Aggregates status from all ferry operators with graceful degradation
// If operator status cannot be fetched, forecast continues with 'unknown' status

import { fetchSSAStatus, isSSARoute, type SSAStatusResult } from './steamship';
import { fetchHyLineStatus, isHyLineRoute, type HyLineStatusResult } from './hyline';
import type { OfficialStatus } from '@/types/forecast';

// In-memory cache for operator status
interface StatusCacheEntry {
  status: OfficialStatus;
  source: string;
  timestamp: number;
  expiresAt: number;
}

const statusCache = new Map<string, StatusCacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for operator status (changes frequently during disruptions)

export interface OperatorStatusResult {
  status: OfficialStatus;
  source: string | null;
  message: string | null;
  updated_at: string | null;
  fetchError: string | null;
}

/**
 * Get operator status for a route
 * Returns structured result with status or 'unknown' - never throws
 */
export async function getOperatorStatus(routeId: string): Promise<OperatorStatusResult> {
  const cacheKey = `operator:${routeId}`;
  const now = Date.now();

  // Check cache first
  const cached = statusCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      status: cached.status,
      source: cached.source,
      message: null,
      updated_at: new Date(cached.timestamp).toISOString(),
      fetchError: null,
    };
  }

  // Determine which operator serves this route
  let result: SSAStatusResult | HyLineStatusResult;
  let operatorName: string;

  if (isSSARoute(routeId)) {
    operatorName = 'Steamship Authority';
    result = await fetchSSAStatus(routeId);
  } else if (isHyLineRoute(routeId)) {
    operatorName = 'Hy-Line Cruises';
    result = await fetchHyLineStatus(routeId);
  } else {
    // Unknown operator
    return {
      status: 'unknown',
      source: null,
      message: 'Unknown ferry operator for this route',
      updated_at: null,
      fetchError: 'No operator mapping found',
    };
  }

  // Process result
  if (result.success && result.status) {
    // Successfully fetched status
    const entry: StatusCacheEntry = {
      status: result.status.status,
      source: operatorName,
      timestamp: now,
      expiresAt: now + CACHE_TTL_MS,
    };
    statusCache.set(cacheKey, entry);

    return {
      status: result.status.status,
      source: operatorName,
      message: null,
      updated_at: result.fetchedAt,
      fetchError: null,
    };
  }

  // Fetch failed or no status found - return unknown
  // If we have stale cache, use it
  if (cached) {
    console.warn(`Using stale operator status for ${routeId}:`, result.error);
    return {
      status: cached.status,
      source: cached.source,
      message: 'Using cached status (live fetch failed)',
      updated_at: new Date(cached.timestamp).toISOString(),
      fetchError: result.error || null,
    };
  }

  return {
    status: 'unknown',
    source: operatorName,
    message: 'Unable to fetch current operator status',
    updated_at: null,
    fetchError: result.error || null,
  };
}

/**
 * Get operator name for a route
 */
export function getOperatorName(routeId: string): string | null {
  if (isSSARoute(routeId)) return 'Steamship Authority';
  if (isHyLineRoute(routeId)) return 'Hy-Line Cruises';
  return null;
}

/**
 * Clear the operator status cache (for testing or forced refresh)
 */
export function clearOperatorStatusCache(): void {
  statusCache.clear();
}

/**
 * Get cache stats (for monitoring)
 */
export function getOperatorStatusCacheStats(): { size: number; keys: string[] } {
  return {
    size: statusCache.size,
    keys: Array.from(statusCache.keys()),
  };
}

// Re-export route checking functions
export { isSSARoute, isHyLineRoute };
