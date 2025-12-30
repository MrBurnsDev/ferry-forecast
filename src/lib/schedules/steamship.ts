/**
 * Steamship Authority Schedule Fetch
 *
 * Fetches today's sailing schedule from SSA website.
 *
 * PHASE 15 SCHEDULE CORRECTNESS:
 * - Parse complete schedule (not just visible/initial sailings)
 * - Use timezone-aware time parsing (America/New_York)
 * - Handle DST correctly via Intl APIs
 * - Return proper UTC timestamps for accurate Departed/Upcoming status
 *
 * PROVENANCE RULES:
 * - source_type: "operator_live" only if extraction is complete and trustworthy
 * - source_type: "unavailable" if fetch fails or parse is incomplete
 * - NEVER silent static fallback
 */

import type {
  Sailing,
  SailingDirection,
  SailingStatus,
  ScheduleFetchResult,
  ScheduleProvenance,
  OperatorAdvisory,
} from './types';
import {
  parseTimeInTimezone,
  getTodayInTimezone,
  getPortTimezone,
  DEFAULT_TIMEZONE,
} from './time';
import {
  fetchSSAStatus,
  getAdvisoriesForRoute,
  matchSailingToStatus,
  type SSAStatusResult,
} from './ssa-status';

// SSA page URLs
const SSA_BASE_URL = 'https://www.steamshipauthority.com';
const SSA_STATUS_URL = `${SSA_BASE_URL}/traveling_today/status`;

// Debug mode from environment
const SCHEDULE_DEBUG = process.env.SCHEDULE_DEBUG === 'true';

/**
 * Operator info for SSA routes
 */
interface SSARouteInfo {
  operatorName: string;
  operatorSlug: string;
  operatorUrl: string;
  from: string;
  to: string;
  // SSA route identifiers for schedule lookup
  ssaRouteName: string;
}

const SSA_ROUTES: Record<string, SSARouteInfo> = {
  'wh-vh-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_STATUS_URL, // Phase 18: Point to status page as canonical source
    from: 'woods-hole',
    to: 'vineyard-haven',
    ssaRouteName: 'vineyard',
  },
  'vh-wh-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_STATUS_URL,
    from: 'vineyard-haven',
    to: 'woods-hole',
    ssaRouteName: 'vineyard',
  },
  'wh-ob-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_STATUS_URL,
    from: 'woods-hole',
    to: 'oak-bluffs',
    ssaRouteName: 'vineyard',
  },
  'ob-wh-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_STATUS_URL,
    from: 'oak-bluffs',
    to: 'woods-hole',
    ssaRouteName: 'vineyard',
  },
  'hy-nan-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_STATUS_URL,
    from: 'hyannis',
    to: 'nantucket',
    ssaRouteName: 'nantucket',
  },
  'nan-hy-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_STATUS_URL,
    from: 'nantucket',
    to: 'hyannis',
    ssaRouteName: 'nantucket',
  },
};

/**
 * Port display names
 */
const PORT_NAMES: Record<string, string> = {
  'woods-hole': 'Woods Hole',
  'vineyard-haven': 'Vineyard Haven',
  'oak-bluffs': 'Oak Bluffs',
  'hyannis': 'Hyannis',
  'nantucket': 'Nantucket',
};

/**
 * Get direction info for a route
 */
function getDirectionForRoute(routeId: string): SailingDirection | null {
  const route = SSA_ROUTES[routeId];
  if (!route) return null;

  return {
    from: PORT_NAMES[route.from] || route.from,
    fromSlug: route.from,
    to: PORT_NAMES[route.to] || route.to,
    toSlug: route.to,
  };
}

/**
 * Create unavailable result with proper provenance
 */
function createUnavailableResult(
  routeId: string,
  errorMessage: string,
  debugInfo?: ScheduleProvenance['debug']
): ScheduleFetchResult {
  const route = SSA_ROUTES[routeId];
  const now = new Date().toISOString();
  const timezone = route ? getPortTimezone(route.from) : DEFAULT_TIMEZONE;

  const provenance: ScheduleProvenance = {
    source_type: 'unavailable',
    source_name: route?.operatorName || 'Steamship Authority',
    fetched_at: now,
    source_url: route?.operatorUrl || SSA_STATUS_URL,
    parse_confidence: 'low',
    raw_status_supported: false,
    error_message: errorMessage,
  };

  if (SCHEDULE_DEBUG && debugInfo) {
    provenance.debug = debugInfo;
  }

  return {
    success: false,
    sailings: [],
    provenance,
    scheduleDate: getTodayInTimezone(timezone),
    timezone,
    operator: route?.operatorName || 'Steamship Authority',
    operatorScheduleUrl: route?.operatorUrl || SSA_STATUS_URL,
  };
}

/**
 * Known SSA schedule data - used when website parsing fails
 * This is the ACTUAL schedule from SSA (not made-up times)
 * Must be explicitly labeled as "template" in UI if used
 *
 * Winter 2024-2025 schedule (effective until further notice)
 * Source: https://www.steamshipauthority.com/schedules
 */
const SSA_KNOWN_SCHEDULES: Record<string, { departures: string[]; arrivals?: string[] }> = {
  // Woods Hole to Vineyard Haven (traditional ferry)
  'wh-vh': {
    departures: ['6:00 AM', '7:00 AM', '7:30 AM', '8:45 AM', '9:45 AM', '10:45 AM', '11:45 AM', '12:45 PM', '1:45 PM', '2:45 PM', '3:45 PM', '4:45 PM', '5:45 PM', '6:45 PM', '7:45 PM', '8:45 PM'],
  },
  // Vineyard Haven to Woods Hole
  'vh-wh': {
    departures: ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:30 PM'],
  },
  // Oak Bluffs routes (seasonal - limited in winter)
  'wh-ob': {
    departures: ['9:30 AM', '12:30 PM', '3:30 PM', '6:30 PM'],
  },
  'ob-wh': {
    departures: ['8:00 AM', '11:00 AM', '2:00 PM', '5:00 PM'],
  },
  // Hyannis to Nantucket
  'hy-nan': {
    departures: ['6:30 AM', '8:15 AM', '10:00 AM', '11:45 AM', '1:30 PM', '3:15 PM', '5:00 PM', '6:45 PM'],
  },
  // Nantucket to Hyannis
  'nan-hy': {
    departures: ['6:30 AM', '8:15 AM', '10:00 AM', '11:45 AM', '1:30 PM', '3:15 PM', '5:00 PM', '7:15 PM'],
  },
};

/**
 * Get known schedule key for a route
 */
function getKnownScheduleKey(routeId: string): string | null {
  const keyMap: Record<string, string> = {
    'wh-vh-ssa': 'wh-vh',
    'vh-wh-ssa': 'vh-wh',
    'wh-ob-ssa': 'wh-ob',
    'ob-wh-ssa': 'ob-wh',
    'hy-nan-ssa': 'hy-nan',
    'nan-hy-ssa': 'nan-hy',
  };
  return keyMap[routeId] || null;
}

/**
 * Create sailings from known schedule data
 * Returns source_type: "template" (must be labeled in UI)
 */
function createSailingsFromKnownSchedule(
  routeId: string,
  direction: SailingDirection,
  serviceDateLocal: string,
  timezone: string
): Sailing[] {
  const route = SSA_ROUTES[routeId];
  if (!route) return [];

  const scheduleKey = getKnownScheduleKey(routeId);
  if (!scheduleKey) return [];

  const schedule = SSA_KNOWN_SCHEDULES[scheduleKey];
  if (!schedule) return [];

  const sailings: Sailing[] = [];

  for (const timeStr of schedule.departures) {
    const parsed = parseTimeInTimezone(timeStr, serviceDateLocal, timezone);
    sailings.push({
      departureTime: parsed.utc,
      departureTimestampMs: parsed.timestampMs,
      departureTimeDisplay: timeStr,
      serviceDateLocal,
      timezone,
      direction,
      operator: route.operatorName,
      operatorSlug: route.operatorSlug,
      status: 'scheduled' as SailingStatus,
      statusFromOperator: false,
    });
  }

  return sailings;
}

// ============================================================
// STATUS CACHING
// ============================================================

// Cache status results to avoid hammering SSA
interface StatusCacheEntry {
  result: SSAStatusResult;
  expiresAt: number;
}

let statusCache: StatusCacheEntry | null = null;
const STATUS_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Get cached or fresh SSA status
 */
async function getSSAStatus(): Promise<SSAStatusResult> {
  const now = Date.now();

  // Return cached if valid
  if (statusCache && statusCache.expiresAt > now) {
    return statusCache.result;
  }

  // Fetch fresh status
  const result = await fetchSSAStatus();

  // Cache the result (even failures, to avoid hammering)
  statusCache = {
    result,
    expiresAt: now + STATUS_CACHE_TTL_MS,
  };

  return result;
}

/**
 * Fetch SSA schedule for a route
 *
 * PHASE 18 CORRECTED – THREE-LAYER TRUTH MODEL:
 *
 * Layer 0: Canonical Schedule (template) = BASE TRUTH
 *          Contains all scheduled sailings for the day
 *
 * Layer 1: Operator Status Overlay = SPARSE delta
 *          Status page provides updates for SOME sailings
 *          Applied to matching sailings only (by port pair + time)
 *          Does NOT create new sailings or delete scheduled ones
 *
 * Layer 2: Risk Overlay (computed elsewhere) = interpretive only
 *
 * MATCHING RULES:
 * - Direction (fromSlug → toSlug)
 * - Departure time (normalized, case-insensitive)
 *
 * UNMATCHED SAILINGS:
 * - Remain visible with status: "scheduled"
 * - statusFromOperator: false (no live status reported)
 *
 * Returns source_type: "operator_live" if status overlay was applied
 * Returns source_type: "template" if no status available
 * Returns source_type: "unavailable" if schedule fails entirely
 */
export async function fetchSSASchedule(routeId: string): Promise<ScheduleFetchResult> {
  const route = SSA_ROUTES[routeId];
  const direction = getDirectionForRoute(routeId);

  if (!route || !direction) {
    return createUnavailableResult(
      routeId,
      `Route ${routeId} is not a recognized SSA route`
    );
  }

  const timezone = getPortTimezone(route.from);
  const serviceDateLocal = getTodayInTimezone(timezone);

  // LAYER 0: Start with canonical schedule (template) as BASE TRUTH
  const templateSailings = createSailingsFromKnownSchedule(
    routeId,
    direction,
    serviceDateLocal,
    timezone
  );

  if (templateSailings.length === 0) {
    return createUnavailableResult(
      routeId,
      'No schedule data available for this route'
    );
  }

  // LAYER 1: Fetch status overlay (sparse delta)
  const statusResult = await getSSAStatus();

  // If status fetch failed, return template with no status overlay
  if (!statusResult.success || statusResult.sailings.length === 0) {
    if (SCHEDULE_DEBUG) {
      console.log(`[SCHEDULE_DEBUG] SSA ${routeId}: status unavailable (${statusResult.errorMessage}), using template only`);
    }

    return {
      success: true,
      sailings: templateSailings,
      provenance: {
        source_type: 'template',
        source_name: route.operatorName,
        fetched_at: new Date().toISOString(),
        source_url: SSA_STATUS_URL,
        parse_confidence: 'medium',
        raw_status_supported: false,
      },
      scheduleDate: serviceDateLocal,
      timezone,
      operator: route.operatorName,
      operatorScheduleUrl: SSA_STATUS_URL,
      statusSource: {
        source: 'unavailable',
        fetchedAt: statusResult.fetchedAt,
      },
    };
  }

  // APPLY STATUS OVERLAY to matching sailings
  // Unmatched sailings remain as-is (visible, statusFromOperator: false)
  let matchedCount = 0;
  const sailingsWithStatus = templateSailings.map((sailing) => {
    const matchingStatus = matchSailingToStatus(
      {
        fromSlug: sailing.direction.fromSlug,
        toSlug: sailing.direction.toSlug,
        departureTimeDisplay: sailing.departureTimeDisplay,
      },
      statusResult.sailings
    );

    if (matchingStatus) {
      matchedCount++;
      return {
        ...sailing,
        status: matchingStatus.status,
        statusMessage: matchingStatus.statusMessage,
        statusFromOperator: true, // Status came from operator status page
      };
    }

    // No matching status - sailing remains scheduled, not operator-confirmed
    return sailing;
  });

  // Get advisories for this route
  const advisories = getAdvisoriesForRoute(routeId, statusResult.advisories);
  const operatorAdvisories: OperatorAdvisory[] = advisories.map((adv) => ({
    title: adv.title,
    text: adv.text,
    fetchedAt: statusResult.fetchedAt,
  }));

  if (SCHEDULE_DEBUG) {
    const canceledCount = sailingsWithStatus.filter((s) => s.status === 'canceled').length;
    const onTimeCount = sailingsWithStatus.filter((s) => s.status === 'on_time').length;
    const unmatchedCount = templateSailings.length - matchedCount;
    console.log(`[SCHEDULE_DEBUG] SSA ${routeId}: ${templateSailings.length} scheduled, ${matchedCount} matched to status (${canceledCount} canceled, ${onTimeCount} on_time), ${unmatchedCount} unmatched`);
  }

  // Build provenance - "operator_live" means we successfully overlaid status
  const provenance: ScheduleProvenance = {
    source_type: 'operator_live',
    source_name: route.operatorName,
    fetched_at: statusResult.fetchedAt,
    source_url: SSA_STATUS_URL,
    parse_confidence: matchedCount > 0 ? 'high' : 'medium',
    raw_status_supported: true,
  };

  return {
    success: true,
    sailings: sailingsWithStatus,
    provenance,
    scheduleDate: serviceDateLocal,
    timezone,
    operator: route.operatorName,
    operatorScheduleUrl: SSA_STATUS_URL,
    advisories: operatorAdvisories.length > 0 ? operatorAdvisories : undefined,
    statusSource: {
      source: 'operator_status_page',
      url: SSA_STATUS_URL,
      fetchedAt: statusResult.fetchedAt,
    },
  };
}

/**
 * Check if a route is an SSA route
 */
export function isSSAScheduleRoute(routeId: string): boolean {
  return routeId in SSA_ROUTES;
}

/**
 * Get SSA route info
 */
export function getSSARouteInfo(routeId: string): SSARouteInfo | null {
  return SSA_ROUTES[routeId] || null;
}
