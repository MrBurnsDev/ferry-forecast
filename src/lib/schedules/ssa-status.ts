/**
 * SSA Status Page Scraper
 *
 * Phase 22: Single-Corridor Truth Lock
 *
 * Scrapes https://www.steamshipauthority.com/traveling_today/status
 * for real-time per-sailing status.
 *
 * CRITICAL CHANGE FROM PHASE 18:
 * The status page IS the authoritative schedule for today.
 * We do NOT overlay onto a template - the status page defines what sailings exist.
 *
 * If a sailing appears on the status page, it's a real sailing.
 * If it says "Cancelled", it was cancelled.
 * If it says "On Time", it's running.
 *
 * PHASE 22 LOCK: Woods Hole ↔ Vineyard Haven only.
 */

import type { Sailing, SailingStatus, SailingDirection } from './types';
import { parseTimeInTimezone, getTodayInTimezone, DEFAULT_TIMEZONE } from './time';

// SSA status page URL
const SSA_STATUS_URL = 'https://www.steamshipauthority.com/traveling_today/status';
const REQUEST_TIMEOUT = 20000;

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
  /** Whether this sailing has departed */
  departed?: boolean;
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
  /** Raw HTML for debugging */
  rawHtmlLength?: number;
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
 * Port slug to display name mapping
 */
const PORT_DISPLAY_NAMES: Record<string, string> = {
  'woods-hole': 'Woods Hole',
  'vineyard-haven': 'Vineyard Haven',
  'oak-bluffs': 'Oak Bluffs',
  'hyannis': 'Hyannis',
  'nantucket': 'Nantucket',
};

/**
 * Normalize port name to slug
 */
function portNameToSlug(name: string): string {
  const normalized = name.toLowerCase().trim();
  return PORT_SLUG_MAP[normalized] || normalized.replace(/\s+/g, '-');
}

/**
 * Parse status class and text to SailingStatus
 */
function parseStatusClass(statusClass: string, statusText: string): { status: SailingStatus; message?: string; departed?: boolean } {
  const classLower = statusClass.toLowerCase();
  const textLower = statusText.toLowerCase();

  const departed = classLower.includes('departed');

  if (classLower.includes('cancelled') || classLower.includes('canceled') || textLower.includes('cancelled')) {
    return {
      status: 'canceled',
      message: statusText.includes('due to') ? statusText.replace(/<[^>]*>/g, '').trim() : undefined,
      departed,
    };
  }

  if (classLower.includes('delayed') || textLower.includes('delayed')) {
    return {
      status: 'delayed',
      message: statusText.replace(/<[^>]*>/g, '').trim(),
      departed,
    };
  }

  if (classLower.includes('on_time') || classLower.includes('on-time') || textLower.includes('on time')) {
    return { status: 'on_time', departed };
  }

  // If departed without cancel/delay, it ran successfully
  if (departed) {
    return { status: 'on_time', departed: true };
  }

  return { status: 'unknown', departed };
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

    // Extract cells with their classes
    const cellPattern = /<td[^>]*(?:class="([^"]*)")?[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: Array<{ class: string; text: string; raw: string }> = [];
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push({
        class: cellMatch[1] || '',
        text: cellMatch[2].replace(/<[^>]*>/g, '').trim(),
        raw: cellMatch[2],
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
          departed: statusInfo.departed,
        });
      }
    }
  }

  if (STATUS_DEBUG) {
    console.log(`[STATUS_DEBUG] Parsed ${sailings.length} Vineyard sailings`);
    const canceled = sailings.filter(s => s.status === 'canceled');
    if (canceled.length > 0) {
      console.log(`[STATUS_DEBUG] CANCELLED: ${canceled.map(s => `${s.from} ${s.departureTimeDisplay}`).join(', ')}`);
    }
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
          departed: statusInfo.departed,
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
 * PHASE 22: This is THE authoritative source for today's sailings.
 * The status page defines what sailings exist, not a template.
 */
export async function fetchSSAStatus(): Promise<SSAStatusResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Use fetch with redirect following and proper headers
    // Key: Send accept-encoding and other headers that browsers send
    const response = await fetch(SSA_STATUS_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (STATUS_DEBUG) {
        console.log(`[STATUS_DEBUG] SSA HTTP error: ${response.status} ${response.statusText}`);
      }
      return {
        success: false,
        sailings: [],
        advisories: [],
        fetchedAt,
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();

    if (STATUS_DEBUG) {
      console.log(`[STATUS_DEBUG] SSA response length: ${html.length} chars`);
    }

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
        rawHtmlLength: html.length,
      };
    }

    // Check if we got the actual status page
    if (!html.includes('vineyard_trips') && !html.includes('nantucket_trips')) {
      if (STATUS_DEBUG) {
        console.log('[STATUS_DEBUG] SSA response does not contain status tables');
        console.log('[STATUS_DEBUG] First 500 chars:', html.substring(0, 500));
      }
      return {
        success: false,
        sailings: [],
        advisories: [],
        fetchedAt,
        errorMessage: 'SSA status page content not found',
        rawHtmlLength: html.length,
      };
    }

    // Parse the page
    const vineyardSailings = parseVineyardTrips(html);
    const nantucketSailings = parseNantucketTrips(html);
    const advisories = parseAdvisories(html);

    const allSailings = [...vineyardSailings, ...nantucketSailings];

    if (STATUS_DEBUG) {
      console.log(`[STATUS_DEBUG] SSA status: ${allSailings.length} total sailings, ${advisories.length} advisories`);
      const whvh = allSailings.filter(s =>
        (s.fromSlug === 'woods-hole' && s.toSlug === 'vineyard-haven') ||
        (s.fromSlug === 'vineyard-haven' && s.toSlug === 'woods-hole')
      );
      console.log(`[STATUS_DEBUG] WH<->VH sailings: ${whvh.length}`);
    }

    return {
      success: true,
      sailings: allSailings,
      advisories,
      fetchedAt,
      rawHtmlLength: html.length,
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

// ============================================================
// PHASE 22: Status Page AS Canonical Schedule
// ============================================================

/**
 * Convert SSASailingStatus objects to full Sailing objects.
 *
 * PHASE 22: The status page IS the canonical list of today's sailings.
 * Each row in the status table becomes a Sailing.
 * No template overlay - what's on the status page is what exists.
 *
 * @param statusSailings - Parsed rows from SSA status tables
 * @param routeId - Route ID to filter for (e.g., 'wh-vh-ssa')
 * @returns Array of Sailing objects for the specified route direction
 */
export function convertStatusToSailings(
  statusSailings: SSASailingStatus[],
  routeId: string
): Sailing[] {
  const timezone = DEFAULT_TIMEZONE;
  const serviceDateLocal = getTodayInTimezone(timezone);

  // Parse route ID to determine which direction we want
  // e.g., 'wh-vh-ssa' = Woods Hole → Vineyard Haven
  const routeParts = routeId.split('-');
  if (routeParts.length < 3) return [];

  const fromSlugFromRoute = expandPortSlug(routeParts[0]);
  const toSlugFromRoute = expandPortSlug(routeParts[1]);

  if (!fromSlugFromRoute || !toSlugFromRoute) return [];

  // Filter status sailings to match this route direction
  const matchingSailings = statusSailings.filter(s => {
    return s.fromSlug === fromSlugFromRoute && s.toSlug === toSlugFromRoute;
  });

  // Convert to Sailing objects
  return matchingSailings.map(statusSailing => {
    // Parse time into proper timestamp
    const parsed = parseTimeInTimezone(
      statusSailing.departureTimeDisplay,
      serviceDateLocal,
      timezone
    );

    // Build direction object
    const direction: SailingDirection = {
      from: PORT_DISPLAY_NAMES[statusSailing.fromSlug] || statusSailing.from,
      fromSlug: statusSailing.fromSlug,
      to: PORT_DISPLAY_NAMES[statusSailing.toSlug] || statusSailing.to,
      toSlug: statusSailing.toSlug,
    };

    // Normalize the display time format
    const normalizedTimeDisplay = normalizeTimeDisplay(statusSailing.departureTimeDisplay);

    const sailing: Sailing = {
      departureTime: parsed.utc,
      departureTimestampMs: parsed.timestampMs,
      departureTimeDisplay: normalizedTimeDisplay,
      serviceDateLocal,
      timezone,
      direction,
      operator: 'Steamship Authority',
      operatorSlug: 'ssa',
      status: statusSailing.status,
      statusMessage: statusSailing.statusMessage,
      statusFromOperator: true, // Always true - this IS from operator status page
    };

    // Add arrival time if available
    if (statusSailing.arrivalTimeDisplay) {
      const arrivalParsed = parseTimeInTimezone(
        statusSailing.arrivalTimeDisplay,
        serviceDateLocal,
        timezone
      );
      sailing.arrivalTime = arrivalParsed.utc;
      sailing.arrivalTimestampMs = arrivalParsed.timestampMs;
    }

    // Add vessel type if available (for Nantucket high-speed vs traditional)
    if (statusSailing.vesselType) {
      sailing.vesselName = statusSailing.vesselType;
    }

    return sailing;
  });
}

/**
 * Expand abbreviated port slug to full slug
 * e.g., 'wh' → 'woods-hole', 'vh' → 'vineyard-haven'
 */
function expandPortSlug(abbrev: string): string | null {
  const expansions: Record<string, string> = {
    'wh': 'woods-hole',
    'vh': 'vineyard-haven',
    'ob': 'oak-bluffs',
    'hy': 'hyannis',
    'nan': 'nantucket',
  };
  return expansions[abbrev] || null;
}

/**
 * Normalize time display format for consistency
 * e.g., "9:30 am" → "9:30 AM", "6:00 pm" → "6:00 PM"
 */
function normalizeTimeDisplay(time: string): string {
  return time
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/am$/i, 'AM')
    .replace(/pm$/i, 'PM');
}

/**
 * Get all sailings for a route from the status page result.
 *
 * PHASE 22: This is THE authoritative source for SSA sailings.
 * Returns sailings ONLY if the status page was successfully fetched.
 *
 * @param statusResult - Result from fetchSSAStatus()
 * @param routeId - Route ID (e.g., 'wh-vh-ssa')
 * @returns Array of Sailing objects, or empty array if status unavailable
 */
export function getSailingsFromStatus(
  statusResult: SSAStatusResult,
  routeId: string
): Sailing[] {
  if (!statusResult.success || statusResult.sailings.length === 0) {
    return [];
  }

  return convertStatusToSailings(statusResult.sailings, routeId);
}
