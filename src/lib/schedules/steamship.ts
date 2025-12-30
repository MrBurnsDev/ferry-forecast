/**
 * Steamship Authority Schedule Fetch
 *
 * Best-effort fetching of today's sailing schedule from SSA website.
 * Designed for graceful degradation - returns static fallback if fetch fails.
 *
 * IMPORTANT: This is DISPLAY ONLY. We show what the operator publishes.
 * We do NOT predict or infer sailing-level cancellations.
 */

import type {
  Sailing,
  SailingDirection,
  SailingStatus,
  ScheduleFetchResult,
  StaticScheduleTemplate,
} from './types';

const SSA_SCHEDULE_URL = 'https://www.steamshipauthority.com/schedules';
const REQUEST_TIMEOUT = 8000;

/**
 * Static schedule templates for SSA routes
 * These are approximate winter/shoulder season times - actual varies by season
 * Used as fallback when live fetch fails
 */
const SSA_STATIC_SCHEDULES: Record<string, StaticScheduleTemplate> = {
  'wh-vh-ssa': {
    operator: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: 'https://www.steamshipauthority.com/schedules',
    departureTimes: ['07:00', '08:30', '10:30', '12:30', '14:30', '16:00', '17:30', '19:30'],
  },
  'vh-wh-ssa': {
    operator: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: 'https://www.steamshipauthority.com/schedules',
    departureTimes: ['06:00', '07:30', '09:30', '11:30', '13:30', '15:00', '16:30', '18:30'],
  },
  'wh-ob-ssa': {
    operator: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: 'https://www.steamshipauthority.com/schedules',
    departureTimes: ['09:00', '12:00', '15:00', '18:00'],
  },
  'ob-wh-ssa': {
    operator: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: 'https://www.steamshipauthority.com/schedules',
    departureTimes: ['08:00', '11:00', '14:00', '17:00'],
  },
  'hy-nan-ssa': {
    operator: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: 'https://www.steamshipauthority.com/schedules',
    departureTimes: ['06:15', '09:15', '12:45', '15:45', '18:30'],
  },
  'nan-hy-ssa': {
    operator: 'Steamship Authority',
    operatorSlug: 'ssa',
    operatorUrl: 'https://www.steamshipauthority.com/schedules',
    departureTimes: ['06:30', '10:00', '13:15', '16:00', '18:45'],
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
  const routeParts: Record<string, { from: string; to: string }> = {
    'wh-vh-ssa': { from: 'woods-hole', to: 'vineyard-haven' },
    'vh-wh-ssa': { from: 'vineyard-haven', to: 'woods-hole' },
    'wh-ob-ssa': { from: 'woods-hole', to: 'oak-bluffs' },
    'ob-wh-ssa': { from: 'oak-bluffs', to: 'woods-hole' },
    'hy-nan-ssa': { from: 'hyannis', to: 'nantucket' },
    'nan-hy-ssa': { from: 'nantucket', to: 'hyannis' },
  };

  const parts = routeParts[routeId];
  if (!parts) return null;

  return {
    from: PORT_NAMES[parts.from] || parts.from,
    fromSlug: parts.from,
    to: PORT_NAMES[parts.to] || parts.to,
    toSlug: parts.to,
  };
}

/**
 * Format time string (HH:MM) to display format (h:mm AM/PM)
 */
function formatTimeForDisplay(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Create ISO datetime from time string for today
 */
function createISOTime(time24: string): string {
  const today = new Date();
  const [hours, minutes] = time24.split(':').map(Number);
  today.setHours(hours, minutes, 0, 0);
  return today.toISOString();
}

/**
 * Get today's date string (YYYY-MM-DD)
 */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate static fallback schedule
 */
function generateStaticSchedule(routeId: string): ScheduleFetchResult {
  const template = SSA_STATIC_SCHEDULES[routeId];
  const direction = getDirectionForRoute(routeId);

  if (!template || !direction) {
    return {
      success: false,
      sailings: [],
      fetchedAt: new Date().toISOString(),
      scheduleDate: getTodayString(),
      error: `Unknown SSA route: ${routeId}`,
      operator: 'Steamship Authority',
      isStaticFallback: true,
    };
  }

  const sailings: Sailing[] = template.departureTimes.map((time) => ({
    departureTime: createISOTime(time),
    departureTimeDisplay: formatTimeForDisplay(time),
    direction,
    operator: template.operator,
    operatorSlug: template.operatorSlug,
    status: 'scheduled' as SailingStatus,
    statusFromOperator: false,
  }));

  return {
    success: true,
    sailings,
    fetchedAt: new Date().toISOString(),
    scheduleDate: getTodayString(),
    operator: template.operator,
    operatorScheduleUrl: template.operatorUrl,
    isStaticFallback: true,
  };
}

/**
 * Fetch SSA schedule for a route
 *
 * Currently returns static fallback - live parsing to be added
 * when SSA schedule page structure is analyzed.
 *
 * Design: Fail gracefully, always return usable result
 */
export async function fetchSSASchedule(routeId: string): Promise<ScheduleFetchResult> {
  const template = SSA_STATIC_SCHEDULES[routeId];

  if (!template) {
    return {
      success: false,
      sailings: [],
      fetchedAt: new Date().toISOString(),
      scheduleDate: getTodayString(),
      error: `Route ${routeId} is not an SSA route`,
      operator: 'Steamship Authority',
      isStaticFallback: true,
    };
  }

  // TODO: Implement live schedule parsing from SSA website
  // For now, return static fallback with a note
  //
  // The SSA website uses JavaScript-rendered content which makes
  // server-side parsing challenging. Options for future:
  // 1. Use SSA's mobile API if available
  // 2. Use a headless browser service
  // 3. Parse the SSA email alerts or RSS feed
  //
  // For MVP, static schedule with live status from alerts is sufficient.

  try {
    // Attempt to fetch the page (will likely fail due to CORS in browser, works server-side)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(SSA_SCHEDULE_URL, {
      headers: {
        'User-Agent': 'FerryForecast/1.0 (github.com/ferryforecast)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Return static fallback on HTTP error
      return generateStaticSchedule(routeId);
    }

    // For now, just return static schedule
    // TODO: Parse the response HTML for actual schedule
    return generateStaticSchedule(routeId);

  } catch {
    // Any error (network, timeout, etc) - return static fallback
    return generateStaticSchedule(routeId);
  }
}

/**
 * Check if a route is an SSA route
 */
export function isSSAScheduleRoute(routeId: string): boolean {
  return routeId in SSA_STATIC_SCHEDULES;
}
