/**
 * Steamship Authority Schedule Fetch
 *
 * Fetches today's sailing schedule from SSA website.
 *
 * PHASE 15 RULES:
 * - NO silent static fallback. If fetch fails, return source_type: "unavailable"
 * - Every response includes full provenance metadata
 * - Users see "Schedule unavailable" with link to operator, NOT made-up times
 *
 * IMPORTANT: This is DISPLAY ONLY. We show what the operator publishes.
 * We do NOT predict or infer sailing-level cancellations.
 */

import type {
  Sailing,
  SailingDirection,
  ScheduleFetchResult,
  ScheduleProvenance,
} from './types';

// SSA schedule page URL
const SSA_SCHEDULE_URL = 'https://www.steamshipauthority.com/schedules';
const REQUEST_TIMEOUT = 8000;

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
}

const SSA_ROUTES: Record<string, SSARouteInfo> = {
  'wh-vh-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_SCHEDULE_URL,
    from: 'woods-hole',
    to: 'vineyard-haven',
  },
  'vh-wh-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_SCHEDULE_URL,
    from: 'vineyard-haven',
    to: 'woods-hole',
  },
  'wh-ob-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_SCHEDULE_URL,
    from: 'woods-hole',
    to: 'oak-bluffs',
  },
  'ob-wh-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_SCHEDULE_URL,
    from: 'oak-bluffs',
    to: 'woods-hole',
  },
  'hy-nan-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_SCHEDULE_URL,
    from: 'hyannis',
    to: 'nantucket',
  },
  'nan-hy-ssa': {
    operatorName: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: SSA_SCHEDULE_URL,
    from: 'nantucket',
    to: 'hyannis',
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
 * Get today's date string (YYYY-MM-DD)
 */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
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

  const provenance: ScheduleProvenance = {
    source_type: 'unavailable',
    source_name: route?.operatorName || 'Steamship Authority',
    fetched_at: now,
    source_url: route?.operatorUrl || SSA_SCHEDULE_URL,
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
    scheduleDate: getTodayString(),
    operator: route?.operatorName || 'Steamship Authority',
    operatorScheduleUrl: route?.operatorUrl || SSA_SCHEDULE_URL,
  };
}

// Note: These utility functions are kept for future use when parsing is implemented
// /**
//  * Format time string (HH:MM) to display format (h:mm AM/PM)
//  */
// function formatTimeForDisplay(time24: string): string {
//   const [hours, minutes] = time24.split(':').map(Number);
//   const period = hours >= 12 ? 'PM' : 'AM';
//   const hours12 = hours % 12 || 12;
//   return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
// }
//
// /**
//  * Create ISO datetime from time string for today
//  */
// function createISOTime(time24: string): string {
//   const today = new Date();
//   const [hours, minutes] = time24.split(':').map(Number);
//   today.setHours(hours, minutes, 0, 0);
//   return today.toISOString();
// }

/**
 * Parse sailing times from HTML response
 *
 * TODO: Implement actual HTML parsing when SSA page structure is analyzed.
 * For now, attempts to find schedule data in the response.
 */
function parseSSASchedule(
  html: string,
  routeId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _direction: SailingDirection
): { sailings: Sailing[]; confidence: 'high' | 'medium' | 'low'; parseCount: number } {
  const route = SSA_ROUTES[routeId];
  if (!route) {
    return { sailings: [], confidence: 'low', parseCount: 0 };
  }

  // SSA's website uses JavaScript rendering, making direct HTML parsing difficult.
  // Look for any embedded schedule data in script tags or structured data.

  // Check for JSON-LD structured data
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      if (SCHEDULE_DEBUG) {
        console.log('[SCHEDULE_DEBUG] Found JSON-LD data:', typeof jsonData);
      }
      // TODO: Parse structured data if available
    } catch {
      // JSON parse failed, continue with other methods
    }
  }

  // Look for schedule tables or time patterns
  // Pattern: times like "7:00 AM", "10:30 AM", etc.
  const timePattern = /\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi;
  const times: string[] = [];
  let match;

  while ((match = timePattern.exec(html)) !== null) {
    const hour = parseInt(match[1]);
    const minute = match[2];
    const period = match[3].toUpperCase();

    // Convert to 24h format
    let hour24 = hour;
    if (period === 'PM' && hour !== 12) hour24 += 12;
    if (period === 'AM' && hour === 12) hour24 = 0;

    const time24 = `${hour24.toString().padStart(2, '0')}:${minute}`;
    if (!times.includes(time24)) {
      times.push(time24);
    }
  }

  // If we found times, they might be schedule times, but we can't be sure
  // without proper context. For now, return empty to avoid false data.
  //
  // NOTE: This is intentionally conservative. We'd rather show "unavailable"
  // than mislead users with potentially incorrect times.

  if (SCHEDULE_DEBUG && times.length > 0) {
    console.log(`[SCHEDULE_DEBUG] Found ${times.length} time patterns, but cannot confirm they are schedule times`);
  }

  // Return empty - we cannot reliably parse the schedule without more work
  return { sailings: [], confidence: 'low', parseCount: 0 };
}

/**
 * Fetch SSA schedule for a route
 *
 * Returns source_type: "operator_live" if successfully parsed
 * Returns source_type: "unavailable" if fetch or parse fails
 *
 * NEVER returns silent static fallback schedules
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

  const startTime = Date.now();
  let htmlSize = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(SSA_SCHEDULE_URL, {
      headers: {
        'User-Agent': 'FerryForecast/1.0 (weather risk advisory tool)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return createUnavailableResult(
        routeId,
        `SSA returned HTTP ${response.status}`,
        SCHEDULE_DEBUG ? { failure_reason: `HTTP ${response.status}` } : undefined
      );
    }

    const html = await response.text();
    htmlSize = html.length;

    // Attempt to parse schedule from HTML
    const parseResult = parseSSASchedule(html, routeId, direction);
    const parseDuration = Date.now() - startTime;

    if (parseResult.sailings.length > 0) {
      // Successfully parsed sailings
      const provenance: ScheduleProvenance = {
        source_type: 'operator_live',
        source_name: route.operatorName,
        fetched_at: new Date().toISOString(),
        source_url: SSA_SCHEDULE_URL,
        parse_confidence: parseResult.confidence,
        raw_status_supported: false, // SSA doesn't provide per-sailing status in schedule
      };

      if (SCHEDULE_DEBUG) {
        provenance.debug = {
          parse_count: parseResult.parseCount,
          raw_html_size: htmlSize,
          parse_duration_ms: parseDuration,
        };
        console.log(`[SCHEDULE_DEBUG] SSA ${routeId}: parsed ${parseResult.sailings.length} sailings in ${parseDuration}ms`);
      }

      return {
        success: true,
        sailings: parseResult.sailings,
        provenance,
        scheduleDate: getTodayString(),
        operator: route.operatorName,
        operatorScheduleUrl: SSA_SCHEDULE_URL,
      };
    }

    // Could not parse schedule - return unavailable
    return createUnavailableResult(
      routeId,
      'Could not parse schedule from SSA website. The page may use JavaScript rendering.',
      SCHEDULE_DEBUG ? {
        raw_html_size: htmlSize,
        parse_duration_ms: parseDuration,
        failure_reason: 'No schedule data found in HTML',
      } : undefined
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('abort');

    if (SCHEDULE_DEBUG) {
      console.log(`[SCHEDULE_DEBUG] SSA ${routeId}: fetch failed - ${errorMessage}`);
    }

    return createUnavailableResult(
      routeId,
      isTimeout ? 'Request timed out' : `Fetch failed: ${errorMessage}`,
      SCHEDULE_DEBUG ? {
        failure_reason: errorMessage,
        parse_duration_ms: Date.now() - startTime,
      } : undefined
    );
  }
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
