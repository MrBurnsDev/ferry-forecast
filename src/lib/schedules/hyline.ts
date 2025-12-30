/**
 * Hy-Line Cruises Schedule Fetch
 *
 * Best-effort fetching of today's sailing schedule from Hy-Line website.
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

const HYLINE_SCHEDULE_URL = 'https://www.hylinecruises.com/schedules';
const REQUEST_TIMEOUT = 8000;

/**
 * Static schedule templates for Hy-Line routes
 * These are approximate times - actual varies by season
 * Hy-Line runs high-speed ferries with shorter crossing times
 */
const HYLINE_STATIC_SCHEDULES: Record<string, StaticScheduleTemplate> = {
  'hy-nan-hlc': {
    operator: 'Hy-Line Cruises',
    operatorSlug: 'hlc',
    operatorUrl: 'https://www.hylinecruises.com/schedules',
    departureTimes: ['06:30', '08:00', '09:30', '11:00', '13:00', '15:00', '17:00', '19:00'],
  },
  'nan-hy-hlc': {
    operator: 'Hy-Line Cruises',
    operatorSlug: 'hlc',
    operatorUrl: 'https://www.hylinecruises.com/schedules',
    departureTimes: ['07:30', '09:00', '10:30', '12:00', '14:00', '16:00', '18:00', '20:00'],
  },
  'hy-vh-hlc': {
    operator: 'Hy-Line Cruises',
    operatorSlug: 'hlc',
    operatorUrl: 'https://www.hylinecruises.com/schedules',
    departureTimes: ['09:15', '13:30', '17:45'],
  },
  'vh-hy-hlc': {
    operator: 'Hy-Line Cruises',
    operatorSlug: 'hlc',
    operatorUrl: 'https://www.hylinecruises.com/schedules',
    departureTimes: ['10:45', '15:00', '19:15'],
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
  const routeParts: Record<string, { from: string; to: string }> = {
    'hy-nan-hlc': { from: 'hyannis', to: 'nantucket' },
    'nan-hy-hlc': { from: 'nantucket', to: 'hyannis' },
    'hy-vh-hlc': { from: 'hyannis', to: 'vineyard-haven' },
    'vh-hy-hlc': { from: 'vineyard-haven', to: 'hyannis' },
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
  const template = HYLINE_STATIC_SCHEDULES[routeId];
  const direction = getDirectionForRoute(routeId);

  if (!template || !direction) {
    return {
      success: false,
      sailings: [],
      fetchedAt: new Date().toISOString(),
      scheduleDate: getTodayString(),
      error: `Unknown Hy-Line route: ${routeId}`,
      operator: 'Hy-Line Cruises',
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
 * Fetch Hy-Line schedule for a route
 *
 * Currently returns static fallback - live parsing to be added
 * when Hy-Line schedule page structure is analyzed.
 */
export async function fetchHyLineSchedule(routeId: string): Promise<ScheduleFetchResult> {
  const template = HYLINE_STATIC_SCHEDULES[routeId];

  if (!template) {
    return {
      success: false,
      sailings: [],
      fetchedAt: new Date().toISOString(),
      scheduleDate: getTodayString(),
      error: `Route ${routeId} is not a Hy-Line route`,
      operator: 'Hy-Line Cruises',
      isStaticFallback: true,
    };
  }

  // TODO: Implement live schedule parsing from Hy-Line website
  // Similar to SSA, the website may use JS rendering

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(HYLINE_SCHEDULE_URL, {
      headers: {
        'User-Agent': 'FerryForecast/1.0 (github.com/ferryforecast)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return generateStaticSchedule(routeId);
    }

    // TODO: Parse the response HTML for actual schedule
    return generateStaticSchedule(routeId);

  } catch {
    return generateStaticSchedule(routeId);
  }
}

/**
 * Check if a route is a Hy-Line route
 */
export function isHyLineScheduleRoute(routeId: string): boolean {
  return routeId in HYLINE_STATIC_SCHEDULES;
}
