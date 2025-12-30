/**
 * SSA Status Page Scraper
 *
 * Phase 17: Authoritative Sailing Status Integration
 *
 * Scrapes https://www.steamshipauthority.com/traveling_today/status
 * for real-time per-sailing status (Operating, Cancelled, Delayed).
 *
 * IMPORTANT DISTINCTIONS:
 * - Schedule = what is planned (times, routes) from /schedules
 * - Status = what operator declares (on_time, delayed, canceled) from /traveling_today/status
 * - Risk = Ferry Forecast's weather interpretation (never overrides operator status)
 *
 * PRECEDENCE (strict):
 * 1. Operator Status Page → authoritative, display as-is
 * 2. Schedule Page → if status not available, show "scheduled"
 * 3. Weather Risk → overlay only, never changes status
 */

import type { SailingStatus } from './types';

// SSA status page URL
const SSA_STATUS_URL = 'https://www.steamshipauthority.com/traveling_today/status';
const REQUEST_TIMEOUT = 15000;

// Debug mode
const STATUS_DEBUG = process.env.SCHEDULE_DEBUG === 'true';

/**
 * Individual sailing status from operator
 */
export interface SSASailingStatus {
  /** Departure port display name */
  from: string;
  /** Departure port slug */
  fromSlug: string;
  /** Arrival port display name */
  to: string;
  /** Arrival port slug */
  toSlug: string;
  /** Departure time display (e.g., "9:30 am") */
  departureTimeDisplay: string;
  /** Arrival time display (e.g., "10:15 am") */
  arrivalTimeDisplay?: string;
  /** Status as parsed */
  status: SailingStatus;
  /** Status message (e.g., "Cancelled due to Weather conditions") */
  statusMessage?: string;
  /** Vessel type for Nantucket (Vehicle/Passenger vs High-Speed) */
  vesselType?: string;
}

/**
 * Travel advisory from operator
 */
export interface SSAAdvisory {
  /** Advisory title (e.g., "Travel Advisory") */
  title: string;
  /** Advisory text (verbatim from operator) */
  text: string;
  /** Applies to: 'vineyard' | 'nantucket' | 'both' */
  appliesTo: 'vineyard' | 'nantucket' | 'both';
}

/**
 * Result of fetching SSA status page
 */
export interface SSAStatusResult {
  success: boolean;
  /** Per-sailing statuses */
  sailings: SSASailingStatus[];
  /** Travel advisories */
  advisories: SSAAdvisory[];
  /** When the status was fetched */
  fetchedAt: string;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Port name to slug mapping
 */
const PORT_SLUG_MAP: Record<string, string> = {
  'woods hole': 'woods-hole',
  'vineyard haven': 'vineyard-haven',
  'oak bluffs': 'oak-bluffs',
  'hyannis': 'hyannis',
  'nantucket': 'nantucket',
};

/**
 * Normalize port name to slug
 */
function portNameToSlug(name: string): string {
  const normalized = name.toLowerCase().trim();
  return PORT_SLUG_MAP[normalized] || normalized.replace(/\s+/g, '-');
}

/**
 * Parse status class to SailingStatus
 */
function parseStatusClass(statusClass: string, statusText: string): { status: SailingStatus; message?: string } {
  const classLower = statusClass.toLowerCase();
  const textLower = statusText.toLowerCase();

  if (classLower.includes('cancelled') || classLower.includes('canceled')) {
    return {
      status: 'canceled',
      message: statusText.includes('due to') ? statusText : undefined,
    };
  }

  if (classLower.includes('delayed')) {
    return {
      status: 'delayed',
      message: statusText,
    };
  }

  if (classLower.includes('on_time') || classLower.includes('on-time') || textLower.includes('on time')) {
    return { status: 'on_time' };
  }

  if (classLower.includes('departed')) {
    // Departed can also have cancelled status (e.g., "departed cancelled")
    if (classLower.includes('cancelled') || classLower.includes('canceled')) {
      return {
        status: 'canceled',
        message: statusText.includes('due to') ? statusText : undefined,
      };
    }
    return { status: 'on_time' }; // Departed means it ran
  }

  return { status: 'unknown' };
}

/**
 * Parse time from cell text (e.g., "Woods Hole at 9:30 am")
 */
function parseTimeFromCell(cellText: string): { port: string; time: string } | null {
  // Pattern: "Port Name at H:MM am/pm"
  const match = cellText.match(/^(.+?)\s+at\s+(\d{1,2}:\d{2}\s*(?:am|pm))$/i);
  if (!match) return null;

  return {
    port: match[1].trim(),
    time: match[2].trim(),
  };
}

/**
 * Parse Vineyard trips table
 * Format: <td>Origin at time</td><td>Destination at time</td><td class="status">Status</td>
 */
function parseVineyardTrips(html: string): SSASailingStatus[] {
  const sailings: SSASailingStatus[] = [];

  // Find the vineyard_trips table
  const tableMatch = html.match(/<table[^>]*id="vineyard_trips"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    if (STATUS_DEBUG) console.log('[STATUS_DEBUG] No vineyard_trips table found');
    return sailings;
  }

  const tableHtml = tableMatch[1];

  // Parse each row
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];

    // Skip header rows
    if (rowHtml.includes('<th')) continue;

    // Extract cells
    const cellPattern = /<td[^>]*(?:class="([^"]*)")?[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: Array<{ class: string; text: string }> = [];
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push({
        class: cellMatch[1] || '',
        text: cellMatch[2].replace(/<[^>]*>/g, '').trim(),
      });
    }

    // Vineyard format: Origin | Destination | Status
    if (cells.length >= 3) {
      const origin = parseTimeFromCell(cells[0].text);
      const destination = parseTimeFromCell(cells[1].text);
      const statusInfo = parseStatusClass(cells[2].class, cells[2].text);

      if (origin && destination) {
        sailings.push({
          from: origin.port,
          fromSlug: portNameToSlug(origin.port),
          to: destination.port,
          toSlug: portNameToSlug(destination.port),
          departureTimeDisplay: origin.time,
          arrivalTimeDisplay: destination.time,
          status: statusInfo.status,
          statusMessage: statusInfo.message,
        });
      }
    }
  }

  if (STATUS_DEBUG) {
    console.log(`[STATUS_DEBUG] Parsed ${sailings.length} Vineyard sailings`);
  }

  return sailings;
}

/**
 * Parse Nantucket trips table
 * Format: <td>Origin at time</td><td>Destination at time</td><td>Type</td><td class="status">Status</td>
 */
function parseNantucketTrips(html: string): SSASailingStatus[] {
  const sailings: SSASailingStatus[] = [];

  // Find the nantucket_trips table
  const tableMatch = html.match(/<table[^>]*id="nantucket_trips"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    if (STATUS_DEBUG) console.log('[STATUS_DEBUG] No nantucket_trips table found');
    return sailings;
  }

  const tableHtml = tableMatch[1];

  // Parse each row
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];

    // Skip header rows
    if (rowHtml.includes('<th')) continue;

    // Extract cells
    const cellPattern = /<td[^>]*(?:class="([^"]*)")?[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: Array<{ class: string; text: string }> = [];
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push({
        class: cellMatch[1] || '',
        text: cellMatch[2].replace(/<[^>]*>/g, '').trim(),
      });
    }

    // Nantucket format: Origin | Destination | Type | Status
    if (cells.length >= 4) {
      const origin = parseTimeFromCell(cells[0].text);
      const destination = parseTimeFromCell(cells[1].text);
      const vesselType = cells[2].text;
      const statusInfo = parseStatusClass(cells[3].class, cells[3].text);

      if (origin && destination) {
        sailings.push({
          from: origin.port,
          fromSlug: portNameToSlug(origin.port),
          to: destination.port,
          toSlug: portNameToSlug(destination.port),
          departureTimeDisplay: origin.time,
          arrivalTimeDisplay: destination.time,
          status: statusInfo.status,
          statusMessage: statusInfo.message,
          vesselType,
        });
      }
    }
  }

  if (STATUS_DEBUG) {
    console.log(`[STATUS_DEBUG] Parsed ${sailings.length} Nantucket sailings`);
  }

  return sailings;
}

/**
 * Parse travel advisories from the page
 */
function parseAdvisories(html: string): SSAAdvisory[] {
  const advisories: SSAAdvisory[] = [];

  // Pattern 1: Alert highlight with advisories div
  const alertPattern = /<div[^>]*class="[^"]*alert_highlight[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let alertMatch;

  while ((alertMatch = alertPattern.exec(html)) !== null) {
    const alertHtml = alertMatch[1];

    // Get title
    const titleMatch = alertHtml.match(/<p[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Travel Advisory';

    // Get advisory text from nested div
    const advisoriesMatch = alertHtml.match(/<div[^>]*class="[^"]*advisories[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (advisoriesMatch) {
      // Extract all <p> tags
      const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      const texts: string[] = [];
      let pMatch;

      while ((pMatch = paragraphPattern.exec(advisoriesMatch[1])) !== null) {
        const text = pMatch[1].replace(/<[^>]*>/g, '').trim();
        if (text) texts.push(text);
      }

      if (texts.length > 0) {
        // Determine which routes this applies to
        let appliesTo: 'vineyard' | 'nantucket' | 'both' = 'both';
        const alertClass = alertMatch[0].toLowerCase();
        if (alertClass.includes('vineyard-only')) {
          appliesTo = 'vineyard';
        } else if (alertClass.includes('nantucket-only')) {
          appliesTo = 'nantucket';
        }

        advisories.push({
          title,
          text: texts.join(' '),
          appliesTo,
        });
      }
    }
  }

  // Pattern 2: Trip-specific advisories (ul.trip_advisories)
  const tripAdvisoriesMatch = html.match(/<ul[^>]*class="[^"]*trip_advisories[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
  if (tripAdvisoriesMatch) {
    const liPattern = /<li[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;

    while ((liMatch = liPattern.exec(tripAdvisoriesMatch[1])) !== null) {
      const liClass = liMatch[1];
      const text = liMatch[2].replace(/<[^>]*>/g, '').trim();

      if (text) {
        let appliesTo: 'vineyard' | 'nantucket' | 'both' = 'both';
        if (liClass.includes('vineyard')) {
          appliesTo = 'vineyard';
        } else if (liClass.includes('nantucket')) {
          appliesTo = 'nantucket';
        }

        advisories.push({
          title: 'Trip Update',
          text,
          appliesTo,
        });
      }
    }
  }

  if (STATUS_DEBUG) {
    console.log(`[STATUS_DEBUG] Parsed ${advisories.length} advisories`);
  }

  return advisories;
}

/**
 * Fetch and parse SSA status page
 *
 * Note: SSA uses Queue-IT for traffic management.
 * This function attempts a direct fetch which may not always succeed.
 * Consider caching results for short periods.
 */
export async function fetchSSAStatus(): Promise<SSAStatusResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(SSA_STATUS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        sailings: [],
        advisories: [],
        fetchedAt,
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();

    // Check for Queue-IT redirect (indicates we didn't get the real page)
    if (html.includes('queue-it') || html.includes('Queue-it') || html.includes('queueit')) {
      if (STATUS_DEBUG) {
        console.log('[STATUS_DEBUG] SSA status page blocked by Queue-IT');
      }
      return {
        success: false,
        sailings: [],
        advisories: [],
        fetchedAt,
        errorMessage: 'SSA status page access restricted (queue system)',
      };
    }

    // Check if we got the actual status page
    if (!html.includes('vineyard_trips') && !html.includes('nantucket_trips')) {
      if (STATUS_DEBUG) {
        console.log('[STATUS_DEBUG] SSA response does not contain status tables');
      }
      return {
        success: false,
        sailings: [],
        advisories: [],
        fetchedAt,
        errorMessage: 'SSA status page content not found',
      };
    }

    // Parse the page
    const vineyardSailings = parseVineyardTrips(html);
    const nantucketSailings = parseNantucketTrips(html);
    const advisories = parseAdvisories(html);

    const allSailings = [...vineyardSailings, ...nantucketSailings];

    if (STATUS_DEBUG) {
      console.log(`[STATUS_DEBUG] SSA status: ${allSailings.length} total sailings, ${advisories.length} advisories`);
    }

    return {
      success: true,
      sailings: allSailings,
      advisories,
      fetchedAt,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (STATUS_DEBUG) {
      console.log(`[STATUS_DEBUG] SSA status fetch failed: ${errorMessage}`);
    }

    return {
      success: false,
      sailings: [],
      advisories: [],
      fetchedAt,
      errorMessage,
    };
  }
}

/**
 * Match a schedule sailing to a status sailing
 *
 * Matching criteria:
 * - Same origin port (slug)
 * - Same departure time (normalized)
 * - Same direction
 */
export function matchSailingToStatus(
  scheduleSailing: { fromSlug: string; toSlug: string; departureTimeDisplay: string },
  statusSailings: SSASailingStatus[]
): SSASailingStatus | null {
  const normalizeTime = (time: string): string => {
    return time.toLowerCase().replace(/\s+/g, '');
  };

  const scheduleTime = normalizeTime(scheduleSailing.departureTimeDisplay);

  for (const status of statusSailings) {
    // Match port slugs
    if (status.fromSlug !== scheduleSailing.fromSlug) continue;
    if (status.toSlug !== scheduleSailing.toSlug) continue;

    // Match time
    const statusTime = normalizeTime(status.departureTimeDisplay);
    if (statusTime === scheduleTime) {
      return status;
    }
  }

  return null;
}

/**
 * Get advisories applicable to a route
 */
export function getAdvisoriesForRoute(
  routeId: string,
  advisories: SSAAdvisory[]
): SSAAdvisory[] {
  const isVineyard = routeId.includes('wh-') || routeId.includes('vh-') || routeId.includes('ob-');
  const isNantucket = routeId.includes('nan-') || routeId.includes('hy-nan');

  return advisories.filter(advisory => {
    if (advisory.appliesTo === 'both') return true;
    if (advisory.appliesTo === 'vineyard' && isVineyard) return true;
    if (advisory.appliesTo === 'nantucket' && isNantucket) return true;
    return false;
  });
}
