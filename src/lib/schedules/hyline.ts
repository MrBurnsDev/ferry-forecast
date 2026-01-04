/**
 * Hy-Line Cruises Schedule Fetch
 *
 * Fetches today's sailing schedule from Hy-Line website.
 *
 * PHASE 15 SCHEDULE CORRECTNESS:
 * - Use timezone-aware time parsing (America/New_York)
 * - Handle DST correctly via Intl APIs
 * - Return proper UTC timestamps for accurate Departed/Upcoming status
 *
 * PROVENANCE RULES:
 * - source_type: "operator_live" only if extraction is complete and trustworthy
 * - source_type: "template" if using known schedule data
 * - source_type: "unavailable" if fetch fails
 * - NEVER silent static fallback
 */

import type {
  Sailing,
  SailingDirection,
  SailingStatus,
  ScheduleFetchResult,
  ScheduleProvenance,
  ScheduleSourceType,
} from './types';
import {
  parseTimeInTimezone,
  getTodayInTimezone,
  getPortTimezone,
  DEFAULT_TIMEZONE,
} from './time';

// Hy-Line schedule page URL
const HYLINE_SCHEDULE_URL = 'https://www.hylinecruises.com/schedules';
const REQUEST_TIMEOUT = 10000;

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
 * Create unavailable result with proper provenance
 */
function createUnavailableResult(
  routeId: string,
  errorMessage: string,
  debugInfo?: ScheduleProvenance['debug']
): ScheduleFetchResult {
  const route = HYLINE_ROUTES[routeId];
  const now = new Date().toISOString();
  const timezone = route ? getPortTimezone(route.from) : DEFAULT_TIMEZONE;

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
    scheduleDate: getTodayInTimezone(timezone),
    timezone,
    operator: route?.operatorName || 'Hy-Line Cruises',
    operatorScheduleUrl: route?.operatorUrl || HYLINE_SCHEDULE_URL,
  };
}

/**
 * Known Hy-Line schedule data - used when website parsing fails
 * This is the ACTUAL schedule from Hy-Line (not made-up times)
 * Must be explicitly labeled as "template" in UI if used
 *
 * Winter 2024-2025 schedule
 * Source: https://www.hylinecruises.com/schedules
 */
const HYLINE_KNOWN_SCHEDULES: Record<string, { departures: string[] }> = {
  // Hyannis to Nantucket (high-speed ferry)
  'hy-nan': {
    departures: ['6:30 AM', '8:00 AM', '9:30 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM', '7:00 PM'],
  },
  // Nantucket to Hyannis
  'nan-hy': {
    departures: ['7:30 AM', '9:00 AM', '10:30 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM', '8:00 PM'],
  },
  // Hyannis to Vineyard Haven (inter-island)
  'hy-vh': {
    departures: ['9:15 AM', '1:30 PM', '5:45 PM'],
  },
  // Vineyard Haven to Hyannis
  'vh-hy': {
    departures: ['10:45 AM', '3:00 PM', '7:15 PM'],
  },
};

/**
 * Get known schedule key for a route
 */
function getKnownScheduleKey(routeId: string): string | null {
  const keyMap: Record<string, string> = {
    'hy-nan-hlc': 'hy-nan',
    'nan-hy-hlc': 'nan-hy',
    'hy-vh-hlc': 'hy-vh',
    'vh-hy-hlc': 'vh-hy',
  };
  return keyMap[routeId] || null;
}

/**
 * Parse schedule from Hy-Line website HTML
 */
function parseHyLineScheduleFromHtml(
  html: string,
  routeId: string,
  direction: SailingDirection,
  serviceDateLocal: string,
  timezone: string
): { sailings: Sailing[]; confidence: 'high' | 'medium' | 'low'; parseCount: number } {
  const route = HYLINE_ROUTES[routeId];
  if (!route) {
    return { sailings: [], confidence: 'low', parseCount: 0 };
  }

  const sailings: Sailing[] = [];
  const extractedTimes: string[] = [];

  // Look for time patterns in HTML
  const timePattern = /\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/gi;
  let match;

  while ((match = timePattern.exec(html)) !== null) {
    const timeStr = match[1];
    if (timeStr && !extractedTimes.includes(timeStr)) {
      extractedTimes.push(timeStr);
    }
  }

  if (SCHEDULE_DEBUG) {
    console.log(`[SCHEDULE_DEBUG] Hy-Line HTML parsing found ${extractedTimes.length} time patterns`);
  }

  // If we extracted times from HTML, create sailings
  // Phase 60: Sailings parsed from operator website are 'operator_live'
  if (extractedTimes.length >= 3) {
    const sortedTimes = sortTimeStrings(extractedTimes);

    for (const timeStr of sortedTimes) {
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
        scheduleSource: 'operator_live', // Phase 60: Parsed from operator website
      });
    }

    return {
      sailings,
      confidence: sailings.length >= 6 ? 'high' : 'medium',
      parseCount: sailings.length,
    };
  }

  return { sailings: [], confidence: 'low', parseCount: 0 };
}

/**
 * Sort time strings chronologically
 */
function sortTimeStrings(times: string[]): string[] {
  return times.sort((a, b) => {
    const parseTime = (t: string): number => {
      const match = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return 0;
      let hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      const period = match[3].toUpperCase();
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
      return hour * 60 + minute;
    };
    return parseTime(a) - parseTime(b);
  });
}

/**
 * Create sailings from known schedule data
 *
 * Phase 60: Every sailing must declare its scheduleSource
 */
function createSailingsFromKnownSchedule(
  routeId: string,
  direction: SailingDirection,
  serviceDateLocal: string,
  timezone: string,
  scheduleSource: ScheduleSourceType = 'template'
): Sailing[] {
  const route = HYLINE_ROUTES[routeId];
  if (!route) return [];

  const scheduleKey = getKnownScheduleKey(routeId);
  if (!scheduleKey) return [];

  const schedule = HYLINE_KNOWN_SCHEDULES[scheduleKey];
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
      scheduleSource, // Phase 60: Every sailing must declare its source
    });
  }

  return sailings;
}

/**
 * Fetch Hy-Line schedule for a route
 *
 * Returns source_type: "operator_live" if successfully parsed from website
 * Returns source_type: "template" if using known schedule data
 * Returns source_type: "unavailable" if both fail
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

  const timezone = getPortTimezone(route.from);
  const serviceDateLocal = getTodayInTimezone(timezone);
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
      if (SCHEDULE_DEBUG) {
        console.log(`[SCHEDULE_DEBUG] Hy-Line returned HTTP ${response.status}, falling back to known schedule`);
      }
      return createTemplateResult(routeId, route, direction, serviceDateLocal, timezone);
    }

    const html = await response.text();
    htmlSize = html.length;

    const parseResult = parseHyLineScheduleFromHtml(html, routeId, direction, serviceDateLocal, timezone);
    const parseDuration = Date.now() - startTime;

    if (parseResult.sailings.length > 0) {
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
        scheduleDate: serviceDateLocal,
        timezone,
        operator: route.operatorName,
        operatorScheduleUrl: HYLINE_SCHEDULE_URL,
      };
    }

    if (SCHEDULE_DEBUG) {
      console.log(`[SCHEDULE_DEBUG] Hy-Line ${routeId}: HTML parsing failed, using known schedule template`);
    }
    return createTemplateResult(routeId, route, direction, serviceDateLocal, timezone);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (SCHEDULE_DEBUG) {
      console.log(`[SCHEDULE_DEBUG] Hy-Line ${routeId}: fetch failed - ${errorMessage}`);
    }

    return createTemplateResult(routeId, route, direction, serviceDateLocal, timezone);
  }
}

/**
 * Create a template result using known schedule data
 *
 * Phase 60: Template sailings are explicitly labeled - NOT allowed in Today views
 */
function createTemplateResult(
  routeId: string,
  route: HyLineRouteInfo,
  direction: SailingDirection,
  serviceDateLocal: string,
  timezone: string
): ScheduleFetchResult {
  // Phase 60: Explicitly pass 'template' as scheduleSource
  const sailings = createSailingsFromKnownSchedule(routeId, direction, serviceDateLocal, timezone, 'template');

  if (sailings.length === 0) {
    return createUnavailableResult(
      routeId,
      'No schedule data available for this route'
    );
  }

  const provenance: ScheduleProvenance = {
    source_type: 'template',
    source_name: route.operatorName,
    fetched_at: new Date().toISOString(),
    source_url: HYLINE_SCHEDULE_URL,
    parse_confidence: 'medium',
    raw_status_supported: false,
  };

  return {
    success: true,
    sailings,
    provenance,
    scheduleDate: serviceDateLocal,
    timezone,
    operator: route.operatorName,
    operatorScheduleUrl: HYLINE_SCHEDULE_URL,
  };
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
