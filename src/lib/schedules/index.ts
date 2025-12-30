/**
 * Unified Schedule Service
 *
 * Fetches today's sailing schedule for any supported route.
 * Aggregates SSA and Hy-Line schedules with graceful degradation.
 *
 * IMPORTANT DISTINCTION:
 * - Schedule = individual sailings (what this module provides)
 * - Forecast = weather-based route risk (what the forecast API provides)
 *
 * Users must understand:
 * - High weather risk does NOT mean all sailings are canceled
 * - Individual sailings may be canceled while others run
 * - Always check with operator for confirmed sailing status
 */

import { fetchSSASchedule, isSSAScheduleRoute } from './steamship';
import { fetchHyLineSchedule, isHyLineScheduleRoute } from './hyline';
import type { ScheduleFetchResult, Sailing, SailingStatus } from './types';

// Re-export types
export type { Sailing, SailingDirection, SailingStatus, ScheduleFetchResult } from './types';

// Cache for schedules (short TTL since schedules can change during disruptions)
interface ScheduleCacheEntry {
  result: ScheduleFetchResult;
  expiresAt: number;
}

const scheduleCache = new Map<string, ScheduleCacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Get today's sailing schedule for a route
 *
 * Returns all scheduled sailings for both directions if the route
 * represents a bidirectional pair (e.g., wh-vh-ssa gets VH↔WH sailings)
 */
export async function getTodaySchedule(routeId: string): Promise<ScheduleFetchResult> {
  const now = Date.now();
  const cacheKey = `schedule:${routeId}`;

  // Check cache
  const cached = scheduleCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  let result: ScheduleFetchResult;

  if (isSSAScheduleRoute(routeId)) {
    result = await fetchSSASchedule(routeId);
  } else if (isHyLineScheduleRoute(routeId)) {
    result = await fetchHyLineSchedule(routeId);
  } else {
    result = {
      success: false,
      sailings: [],
      fetchedAt: new Date().toISOString(),
      scheduleDate: new Date().toISOString().split('T')[0],
      error: `Unknown route: ${routeId}`,
      operator: 'Unknown',
      isStaticFallback: true,
    };
  }

  // Cache result
  scheduleCache.set(cacheKey, {
    result,
    expiresAt: now + CACHE_TTL_MS,
  });

  return result;
}

/**
 * Get schedule for both directions of a route
 *
 * For a route like wh-vh-ssa, returns sailings for both:
 * - Woods Hole → Vineyard Haven
 * - Vineyard Haven → Woods Hole
 */
export async function getBidirectionalSchedule(routeId: string): Promise<{
  outbound: ScheduleFetchResult;
  inbound: ScheduleFetchResult;
  combined: Sailing[];
}> {
  // Determine the reverse route ID
  const reverseRouteMap: Record<string, string> = {
    'wh-vh-ssa': 'vh-wh-ssa',
    'vh-wh-ssa': 'wh-vh-ssa',
    'wh-ob-ssa': 'ob-wh-ssa',
    'ob-wh-ssa': 'wh-ob-ssa',
    'hy-nan-ssa': 'nan-hy-ssa',
    'nan-hy-ssa': 'hy-nan-ssa',
    'hy-nan-hlc': 'nan-hy-hlc',
    'nan-hy-hlc': 'hy-nan-hlc',
    'hy-vh-hlc': 'vh-hy-hlc',
    'vh-hy-hlc': 'hy-vh-hlc',
  };

  const reverseRouteId = reverseRouteMap[routeId] || routeId;

  // Fetch both directions in parallel
  const [outbound, inbound] = await Promise.all([
    getTodaySchedule(routeId),
    getTodaySchedule(reverseRouteId),
  ]);

  // Combine and sort by departure time
  const combined = [...outbound.sailings, ...inbound.sailings].sort((a, b) =>
    new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime()
  );

  return { outbound, inbound, combined };
}

/**
 * Filter sailings to only show upcoming ones (not departed)
 */
export function filterUpcomingSailings(sailings: Sailing[]): Sailing[] {
  const now = new Date();
  return sailings.filter((s) => new Date(s.departureTime) > now);
}

/**
 * Apply operator status to sailings
 *
 * If we have a route-level status from the operator (e.g., "all canceled"),
 * apply it to individual sailings that don't already have a status.
 */
export function applySailingStatus(
  sailings: Sailing[],
  routeStatus: SailingStatus | null,
  statusMessage?: string
): Sailing[] {
  if (!routeStatus || routeStatus === 'unknown' || routeStatus === 'scheduled') {
    return sailings;
  }

  return sailings.map((sailing) => {
    // Don't override if sailing already has operator-confirmed status
    if (sailing.statusFromOperator) {
      return sailing;
    }

    return {
      ...sailing,
      status: routeStatus,
      statusMessage: statusMessage || sailing.statusMessage,
      statusFromOperator: false, // Still not per-sailing confirmation
    };
  });
}

/**
 * Get operator name for a route
 */
export function getScheduleOperator(routeId: string): string | null {
  if (isSSAScheduleRoute(routeId)) return 'Steamship Authority';
  if (isHyLineScheduleRoute(routeId)) return 'Hy-Line Cruises';
  return null;
}

/**
 * Clear the schedule cache
 */
export function clearScheduleCache(): void {
  scheduleCache.clear();
}
