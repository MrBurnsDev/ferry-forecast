// Hy-Line Cruises Status Integration
// Best-effort scraping/ingestion of operator-reported status
// This module is designed to fail gracefully - app must not break if parsing fails

import type { OperatorStatusUpdate, OfficialStatus } from '@/types/forecast';

// Hy-Line main page (they post alerts prominently)
const HYLINE_URL = 'https://www.hylinecruises.com';
const REQUEST_TIMEOUT = 8000;

// Route mappings for Hy-Line
const HYLINE_ROUTE_MAPPINGS: Record<string, string[]> = {
  'hy-nan-hlc': ['Hyannis', 'Nantucket', 'high-speed ferry', 'grey lady'],
  'nan-hy-hlc': ['Nantucket', 'Hyannis', 'high-speed ferry', 'grey lady'],
  'hy-vh-hlc': ['Hyannis', "Martha's Vineyard", 'vineyard'],
  'vh-hy-hlc': ["Martha's Vineyard", 'Hyannis', 'vineyard'],
};

// Keywords that indicate service disruptions
const CANCELLATION_KEYWORDS = [
  'cancel',
  'cancelled',
  'suspended',
  'out of service',
  'not operating',
];

const DELAY_KEYWORDS = [
  'delay',
  'delayed',
  'behind schedule',
  'running late',
];

const WEATHER_KEYWORDS = [
  'weather',
  'wind',
  'storm',
  'sea conditions',
  'rough seas',
  'high winds',
];

export interface HyLineStatusResult {
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
  const routeTerms = HYLINE_ROUTE_MAPPINGS[routeId];
  if (!routeTerms) return null;

  const htmlLower = html.toLowerCase();

  // Check if this route is mentioned in alerts
  const routeMentioned = routeTerms.some(term =>
    htmlLower.includes(term.toLowerCase())
  );

  if (!routeMentioned) {
    // No mention of this route - likely operating normally
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
    return 'delayed'; // Conservative assumption
  }

  return null;
}

/**
 * Fetch Hy-Line Cruises service status
 * Returns structured result - never throws, designed for graceful degradation
 */
export async function fetchHyLineStatus(
  routeId: string
): Promise<HyLineStatusResult> {
  const routeNames = HYLINE_ROUTE_MAPPINGS[routeId];

  if (!routeNames) {
    return {
      success: false,
      status: null,
      error: `Route ${routeId} is not a Hy-Line Cruises route`,
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Note: In browser context, this will likely fail due to CORS
    // This is designed to work in server-side context (API routes)
    const response = await fetch(HYLINE_URL, {
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
        error: `Hy-Line website returned ${response.status}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const html = await response.text();
    const parsedStatus = parseStatusFromHtml(html, routeId);

    if (parsedStatus === null) {
      // Parsing didn't find status info - likely operating normally
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
        source: 'hy-line-cruises',
        fetched_at: new Date().toISOString(),
      },
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Don't spam logs for expected failures
    if (!errorMessage.includes('abort') && !errorMessage.includes('CORS')) {
      console.warn('Hy-Line status fetch failed:', errorMessage);
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
 * Check if a route is operated by Hy-Line
 */
export function isHyLineRoute(routeId: string): boolean {
  return routeId in HYLINE_ROUTE_MAPPINGS;
}
