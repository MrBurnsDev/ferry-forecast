/**
 * Hy-Line Cruises Schedule Fetch
 *
 * Fetches today's sailing schedule from Hy-Line website.
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

// Hy-Line schedule page URL
const HYLINE_SCHEDULE_URL = 'https://www.hylinecruises.com/schedules';
const REQUEST_TIMEOUT = 8000;

// Debug mode from environment
const SCHEDULE_DEBUG = process.env.SCHEDULE_DEBUG === 'true';

/**
 * Operator info for Hy-Line routes
 */
interface HyLineRouteInfo {
  operatorName: string;
  operatorSlug: string;
  operatorUrl: string;
  from: string;
  to: string;
}

const HYLINE_ROUTES: Record<string, HyLineRouteInfo> = {
  'hy-nan-hlc': {
    operatorName: 'Hy-Line Cruises',
    operatorSlug: 'hlc',
    operatorUrl: HYLINE_SCHEDULE_URL,
    from: 'hyannis',
    to: 'nantucket',
  },
  'nan-hy-hlc': {
    operatorName: 'Hy-Line Cruises',
    operatorSlug: 'hlc',
    operatorUrl: HYLINE_SCHEDULE_URL,
    from: 'nantucket',
    to: 'hyannis',
  },
  'hy-vh-hlc': {
    operatorName: 'Hy-Line Cruises',
    operatorSlug: 'hlc',
    operatorUrl: HYLINE_SCHEDULE_URL,
    from: 'hyannis',
    to: 'vineyard-haven',
  },
  'vh-hy-hlc': {
    operatorName: 'Hy-Line Cruises',
    operatorSlug: 'hlc',
    operatorUrl: HYLINE_SCHEDULE_URL,
    from: 'vineyard-haven',
    to: 'hyannis',
  },
};

/**
 * Port display names
 */
const PORT_NAMES: Record<string, string> = {
  'hyannis': 'Hyannis',
  'nantucket': 'Nantucket',
  'vineyard-haven': 'Vineyard Haven',
};

/**
 * Get direction info for a route
 */
function getDirectionForRoute(routeId: string): SailingDirection | null {
  const route = HYLINE_ROUTES[routeId];
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
  const route = HYLINE_ROUTES[routeId];
  const now = new Date().toISOString();

  const provenance: ScheduleProvenance = {
    source_type: 'unavailable',
    source_name: route?.operatorName || 'Hy-Line Cruises',
    fetched_at: now,
    source_url: route?.operatorUrl || HYLINE_SCHEDULE_URL,
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
    operator: route?.operatorName || 'Hy-Line Cruises',
    operatorScheduleUrl: route?.operatorUrl || HYLINE_SCHEDULE_URL,
  };
}

/**
 * Parse sailing times from HTML response
 *
 * TODO: Implement actual HTML parsing when Hy-Line page structure is analyzed.
 */
function parseHyLineSchedule(
  html: string,
  routeId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _direction: SailingDirection
): { sailings: Sailing[]; confidence: 'high' | 'medium' | 'low'; parseCount: number } {
  const route = HYLINE_ROUTES[routeId];
  if (!route) {
    return { sailings: [], confidence: 'low', parseCount: 0 };
  }

  // Hy-Line's website may also use JavaScript rendering
  // Look for any embedded schedule data

  // Check for JSON-LD structured data
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      if (SCHEDULE_DEBUG) {
        console.log('[SCHEDULE_DEBUG] Found JSON-LD data:', typeof jsonData);
      }
    } catch {
      // JSON parse failed
    }
  }

  // Look for time patterns
  const timePattern = /\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi;
  const times: string[] = [];
  let match;

  while ((match = timePattern.exec(html)) !== null) {
    const hour = parseInt(match[1]);
    const minute = match[2];
    const period = match[3].toUpperCase();

    let hour24 = hour;
    if (period === 'PM' && hour !== 12) hour24 += 12;
    if (period === 'AM' && hour === 12) hour24 = 0;

    const time24 = `${hour24.toString().padStart(2, '0')}:${minute}`;
    if (!times.includes(time24)) {
      times.push(time24);
    }
  }

  if (SCHEDULE_DEBUG && times.length > 0) {
    console.log(`[SCHEDULE_DEBUG] Found ${times.length} time patterns, but cannot confirm they are schedule times`);
  }

  // Return empty - we cannot reliably parse without more work
  return { sailings: [], confidence: 'low', parseCount: 0 };
}

/**
 * Fetch Hy-Line schedule for a route
 *
 * Returns source_type: "operator_live" if successfully parsed
 * Returns source_type: "unavailable" if fetch or parse fails
 *
 * NEVER returns silent static fallback schedules
 */
export async function fetchHyLineSchedule(routeId: string): Promise<ScheduleFetchResult> {
  const route = HYLINE_ROUTES[routeId];
  const direction = getDirectionForRoute(routeId);

  if (!route || !direction) {
    return createUnavailableResult(
      routeId,
      `Route ${routeId} is not a recognized Hy-Line route`
    );
  }

  const startTime = Date.now();
  let htmlSize = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(HYLINE_SCHEDULE_URL, {
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
        `Hy-Line returned HTTP ${response.status}`,
        SCHEDULE_DEBUG ? { failure_reason: `HTTP ${response.status}` } : undefined
      );
    }

    const html = await response.text();
    htmlSize = html.length;

    // Attempt to parse schedule from HTML
    const parseResult = parseHyLineSchedule(html, routeId, direction);
    const parseDuration = Date.now() - startTime;

    if (parseResult.sailings.length > 0) {
      // Successfully parsed sailings
      const provenance: ScheduleProvenance = {
        source_type: 'operator_live',
        source_name: route.operatorName,
        fetched_at: new Date().toISOString(),
        source_url: HYLINE_SCHEDULE_URL,
        parse_confidence: parseResult.confidence,
        raw_status_supported: false,
      };

      if (SCHEDULE_DEBUG) {
        provenance.debug = {
          parse_count: parseResult.parseCount,
          raw_html_size: htmlSize,
          parse_duration_ms: parseDuration,
        };
        console.log(`[SCHEDULE_DEBUG] Hy-Line ${routeId}: parsed ${parseResult.sailings.length} sailings in ${parseDuration}ms`);
      }

      return {
        success: true,
        sailings: parseResult.sailings,
        provenance,
        scheduleDate: getTodayString(),
        operator: route.operatorName,
        operatorScheduleUrl: HYLINE_SCHEDULE_URL,
      };
    }

    // Could not parse schedule - return unavailable
    return createUnavailableResult(
      routeId,
      'Could not parse schedule from Hy-Line website. The page may use JavaScript rendering.',
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
      console.log(`[SCHEDULE_DEBUG] Hy-Line ${routeId}: fetch failed - ${errorMessage}`);
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
 * Check if a route is a Hy-Line route
 */
export function isHyLineScheduleRoute(routeId: string): boolean {
  return routeId in HYLINE_ROUTES;
}

/**
 * Get Hy-Line route info
 */
export function getHyLineRouteInfo(routeId: string): HyLineRouteInfo | null {
  return HYLINE_ROUTES[routeId] || null;
}
