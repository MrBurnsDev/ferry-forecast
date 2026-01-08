/**
 * Unified Schedule Service
 *
 * Fetches today's sailing schedule for any supported route.
 * Aggregates SSA and Hy-Line schedules with honest provenance.
 *
 * PHASE 15/80.3 RULES:
 * - Every schedule response includes source_type and fetched_at
 * - source_type: "operator_status" = parsed from operator website (Phase 80.3 canonical)
 * - source_type: "operator_snapshot" = full schedule from DB (Phase 80.3 canonical)
 * - source_type: "unavailable" = could not fetch, no sailings shown
 * - We NEVER silently substitute made-up static schedules
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
import type { ScheduleFetchResult, Sailing, SailingStatus, ScheduleProvenance } from './types';
import { DEFAULT_TIMEZONE, getTodayInTimezone, hasSailingDeparted } from './time';

// Re-export types
export type {
  Sailing,
  SailingDirection,
  SailingStatus,
  ScheduleFetchResult,
  ScheduleProvenance,
  ScheduleSourceType,
  ParseConfidence,
  OperatorAdvisory,
} from './types';

// Re-export time utilities for components
export {
  hasSailingDeparted,
  getSailingTimeStatus,
  DEFAULT_TIMEZONE,
} from './time';

// ============================================================
// RATE LIMITING & REQUEST COALESCING
// ============================================================

// Cache for schedules with TTL
interface ScheduleCacheEntry {
  result: ScheduleFetchResult;
  expiresAt: number;
}

const scheduleCache = new Map<string, ScheduleCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (increased from 3)

// In-flight requests for coalescing
const inFlightRequests = new Map<string, Promise<ScheduleFetchResult>>();

// In-flight operator fetches for cross-route coalescing
// When one route for an operator is fetching, other routes for the same operator should wait
const inFlightOperatorFetches = new Map<string, Set<string>>();

// Rate limiting: track last fetch time per operator
const lastFetchTime = new Map<string, number>();
const MIN_FETCH_INTERVAL_MS = 10 * 1000; // 10 seconds between requests to same operator

/**
 * Check if we should rate-limit a request
 *
 * PHASE 71 FIX: Don't rate-limit if there's an in-flight request for this operator.
 * This allows parallel fetches of multiple routes (e.g., wh-vh-ssa and vh-wh-ssa)
 * to proceed without blocking each other on cold start.
 */
function shouldRateLimit(operatorSlug: string): boolean {
  // If there's an in-flight fetch for this operator, don't rate-limit
  // This allows parallel fetches for the same operator to proceed
  const inFlight = inFlightOperatorFetches.get(operatorSlug);
  if (inFlight && inFlight.size > 0) {
    return false;
  }

  const lastTime = lastFetchTime.get(operatorSlug);
  if (!lastTime) return false;
  return Date.now() - lastTime < MIN_FETCH_INTERVAL_MS;
}

/**
 * Record a fetch time for rate limiting
 */
function recordFetchTime(operatorSlug: string): void {
  lastFetchTime.set(operatorSlug, Date.now());
}

// ============================================================
// SCHEDULE FETCHING
// ============================================================

/**
 * Get today's sailing schedule for a route
 *
 * Features:
 * - Caching with 5-minute TTL
 * - Request coalescing (concurrent requests share one fetch)
 * - Rate limiting (10 seconds between requests to same operator)
 */
export async function getTodaySchedule(routeId: string): Promise<ScheduleFetchResult> {
  const now = Date.now();
  const cacheKey = `schedule:${routeId}`;

  // Check cache first
  const cached = scheduleCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  // Check if there's an in-flight request we can reuse
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  // Determine operator for rate limiting
  const operatorSlug = isSSAScheduleRoute(routeId) ? 'ssa' :
                       isHyLineScheduleRoute(routeId) ? 'hlc' : null;

  // Check rate limit
  if (operatorSlug && shouldRateLimit(operatorSlug)) {
    // Return cached result even if stale, or create unavailable
    if (cached) {
      return cached.result;
    }
    return createUnavailableResult(routeId, 'Rate limited - please try again shortly');
  }

  // PHASE 71 FIX: Track this route as in-flight for this operator
  // This allows parallel fetches of different routes for the same operator
  if (operatorSlug) {
    let operatorInFlight = inFlightOperatorFetches.get(operatorSlug);
    if (!operatorInFlight) {
      operatorInFlight = new Set();
      inFlightOperatorFetches.set(operatorSlug, operatorInFlight);
    }
    operatorInFlight.add(routeId);
  }

  // Create the fetch promise
  const fetchPromise = (async () => {
    let result: ScheduleFetchResult;

    try {
      if (isSSAScheduleRoute(routeId)) {
        recordFetchTime('ssa');
        result = await fetchSSASchedule(routeId);
      } else if (isHyLineScheduleRoute(routeId)) {
        recordFetchTime('hlc');
        result = await fetchHyLineSchedule(routeId);
      } else {
        result = createUnavailableResult(routeId, `Unknown route: ${routeId}`);
      }
    } finally {
      // PHASE 71 FIX: Remove from operator in-flight tracking
      if (operatorSlug) {
        const operatorInFlight = inFlightOperatorFetches.get(operatorSlug);
        if (operatorInFlight) {
          operatorInFlight.delete(routeId);
          if (operatorInFlight.size === 0) {
            inFlightOperatorFetches.delete(operatorSlug);
          }
        }
      }
    }

    // Cache result
    scheduleCache.set(cacheKey, {
      result,
      expiresAt: now + CACHE_TTL_MS,
    });

    // Remove from in-flight
    inFlightRequests.delete(cacheKey);

    return result;
  })();

  // Store in-flight for coalescing
  inFlightRequests.set(cacheKey, fetchPromise);

  return fetchPromise;
}

/**
 * Create an unavailable result for unknown routes
 */
function createUnavailableResult(routeId: string, errorMessage: string): ScheduleFetchResult {
  const provenance: ScheduleProvenance = {
    source_type: 'unavailable',
    source_name: 'Unknown',
    fetched_at: new Date().toISOString(),
    source_url: '',
    parse_confidence: 'low',
    raw_status_supported: false,
    error_message: errorMessage,
  };

  return {
    success: false,
    sailings: [],
    provenance,
    scheduleDate: getTodayInTimezone(DEFAULT_TIMEZONE),
    timezone: DEFAULT_TIMEZONE,
    operator: 'Unknown',
    operatorScheduleUrl: '',
  };
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
 * Uses timezone-aware timestamp comparison with grace period
 *
 * Phase 45 IMMUTABLE RULE: Canceled sailings are NEVER filtered out.
 * They must remain visible for the entire service day regardless of time.
 */
export function filterUpcomingSailings(sailings: Sailing[]): Sailing[] {
  return sailings.filter((s) => {
    // IMMUTABLE RULE: Canceled sailings are always included
    if (s.status === 'canceled') {
      return true;
    }
    return !hasSailingDeparted(s.departureTimestampMs);
  });
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
  inFlightRequests.clear();
}
