// Steamship Authority Status Integration
// Best-effort scraping/ingestion of operator-reported status
// This module is designed to fail gracefully - app must not break if parsing fails

import type { OperatorStatusUpdate, OfficialStatus } from '@/types/forecast';

// SSA has a travel alerts page
const SSA_ALERTS_URL = 'https://www.steamshipauthority.com/traveling/alerts';
const REQUEST_TIMEOUT = 8000;

// Route mappings for SSA
const SSA_ROUTE_MAPPINGS: Record<string, string[]> = {
  'wh-vh-ssa': ['Woods Hole', 'Vineyard Haven', 'vineyard'],
  'vh-wh-ssa': ['Vineyard Haven', 'Woods Hole', 'vineyard'],
  'wh-ob-ssa': ['Woods Hole', 'Oak Bluffs', 'oak bluffs'],
  'ob-wh-ssa': ['Oak Bluffs', 'Woods Hole', 'oak bluffs'],
  'hy-nan-ssa': ['Hyannis', 'Nantucket', 'nantucket'],
  'nan-hy-ssa': ['Nantucket', 'Hyannis', 'nantucket'],
};

// Keywords that indicate service disruptions
const CANCELLATION_KEYWORDS = [
  'cancel',
  'cancelled',
  'suspended',
  'out of service',
  'not operating',
  'service suspended',
];

const DELAY_KEYWORDS = [
  'delay',
  'delayed',
  'behind schedule',
  'running late',
  'wait time',
];

const WEATHER_KEYWORDS = [
  'weather',
  'wind',
  'storm',
  'fog',
  'sea conditions',
  'rough seas',
];

export interface SSAStatusResult {
  success: boolean;
  status: OperatorStatusUpdate | null;
  error?: string;
  fetchedAt: string;
}

/**
 * Parse status from page content
 * Looks for alert keywords that might affect specific routes
 */
function parseStatusFromHtml(html: string, routeId: string): OfficialStatus | null {
  const routeTerms = SSA_ROUTE_MAPPINGS[routeId];
  if (!routeTerms) return null;

  const htmlLower = html.toLowerCase();

  // Check if this route is mentioned in the alerts
  const routeMentioned = routeTerms.some(term =>
    htmlLower.includes(term.toLowerCase())
  );

  if (!routeMentioned) {
    // No mention of this route in alerts - likely operating normally
    // But we can't be certain, so return null (unknown)
    return null;
  }

  // Route is mentioned - check what kind of alert
  const hasCancellation = CANCELLATION_KEYWORDS.some(keyword =>
    htmlLower.includes(keyword)
  );

  if (hasCancellation) {
    return 'canceled';
  }

  const hasDelay = DELAY_KEYWORDS.some(keyword =>
    htmlLower.includes(keyword)
  );

  if (hasDelay) {
    return 'delayed';
  }

  const hasWeatherAlert = WEATHER_KEYWORDS.some(keyword =>
    htmlLower.includes(keyword)
  );

  if (hasWeatherAlert) {
    // Weather mentioned but no specific cancel/delay - might be advisory
    return 'delayed'; // Conservative assumption
  }

  // Route mentioned but no clear status indicator
  return null;
}

/**
 * Fetch Steamship Authority service status
 * Returns structured result - never throws, designed for graceful degradation
 */
export async function fetchSSAStatus(routeId: string): Promise<SSAStatusResult> {
  const routeNames = SSA_ROUTE_MAPPINGS[routeId];

  if (!routeNames) {
    return {
      success: false,
      status: null,
      error: `Route ${routeId} is not a Steamship Authority route`,
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Note: In browser context, this will likely fail due to CORS
    // This is designed to work in server-side context (API routes)
    const response = await fetch(SSA_ALERTS_URL, {
      headers: {
        'User-Agent': 'FerryForecast/1.0 (github.com/ferryforecast)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        status: null,
        error: `SSA website returned ${response.status}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const html = await response.text();
    const parsedStatus = parseStatusFromHtml(html, routeId);

    if (parsedStatus === null) {
      // Parsing didn't find status info - likely operating normally
      // Return success but null status (we tried, just no alerts found)
      return {
        success: true,
        status: null,
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      success: true,
      status: {
        route_id: routeId,
        status: parsedStatus,
        source: 'steamship-authority',
        fetched_at: new Date().toISOString(),
      },
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Log but don't throw - graceful degradation
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Don't spam logs for expected failures (CORS, timeout)
    if (!errorMessage.includes('abort') && !errorMessage.includes('CORS')) {
      console.warn('SSA status fetch failed:', errorMessage);
    }

    return {
      success: false,
      status: null,
      error: errorMessage,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check if a route is operated by SSA
 */
export function isSSARoute(routeId: string): boolean {
  return routeId in SSA_ROUTE_MAPPINGS;
}
