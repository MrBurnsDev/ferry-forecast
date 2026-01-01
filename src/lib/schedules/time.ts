/**
 * Timezone-Aware Time Parsing for Ferry Schedules
 *
 * This module provides DST-safe time parsing using IANA timezone IDs.
 * All Cape Cod / Islands ports use America/New_York timezone.
 *
 * ROOT CAUSE FIX (Phase 15 Schedule Correctness):
 * - Times scraped like "6:00 AM" have no date/timezone context
 * - When compared against server Date() (UTC or server tz), wrong "Departed" labels occur
 * - This module ensures all times are parsed in the correct local timezone with DST handling
 */

/**
 * Port timezone mapping (IANA timezone IDs)
 * All Massachusetts ports are in America/New_York timezone
 */
export const PORT_TIMEZONES: Record<string, string> = {
  'woods-hole': 'America/New_York',
  'vineyard-haven': 'America/New_York',
  'oak-bluffs': 'America/New_York',
  'hyannis': 'America/New_York',
  'nantucket': 'America/New_York',
};

/**
 * Default timezone for Cape Cod region
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Grace period in minutes after departure before marking as "Departed"
 * This accounts for boarding time and minor schedule variations
 */
export const DEPARTURE_GRACE_MINUTES = 5;

/**
 * Result of parsing a time string in a timezone
 */
export interface ParsedTime {
  /** UTC timestamp (ISO string) */
  utc: string;
  /** Unix timestamp in milliseconds */
  timestampMs: number;
  /** Original display string preserved */
  localLabel: string;
  /** Service date in local timezone (YYYY-MM-DD) */
  serviceDateLocal: string;
  /** IANA timezone used */
  timezone: string;
  /** Hour in local time (0-23) */
  localHour: number;
  /** Minute in local time (0-59) */
  localMinute: number;
}

/**
 * Parse a time string (e.g., "6:00 AM") into a timezone-aware timestamp.
 *
 * Uses built-in Intl APIs for DST-safe timezone handling.
 *
 * @param timeString - Time in "h:mm AM/PM" or "HH:mm" format
 * @param serviceDateLocal - Date in YYYY-MM-DD format (local to the port)
 * @param timezone - IANA timezone ID (e.g., "America/New_York")
 * @returns ParsedTime with UTC and local representations
 */
export function parseTimeInTimezone(
  timeString: string,
  serviceDateLocal: string,
  timezone: string = DEFAULT_TIMEZONE
): ParsedTime {
  // Parse the time string
  const { hour24, minute } = parseTimeString(timeString);

  // Get the UTC offset for this specific date/time in the target timezone
  // This correctly handles DST transitions
  const utcTimestamp = getUtcTimestampForLocalTime(serviceDateLocal, hour24, minute, timezone);

  return {
    utc: new Date(utcTimestamp).toISOString(),
    timestampMs: utcTimestamp,
    localLabel: timeString,
    serviceDateLocal,
    timezone,
    localHour: hour24,
    localMinute: minute,
  };
}

/**
 * Parse a time string into 24-hour components
 *
 * Supports formats:
 * - "6:00 AM", "6:00 PM" (12-hour with AM/PM)
 * - "06:00", "18:00" (24-hour)
 * - "6:00AM", "6:00PM" (no space before AM/PM)
 */
export function parseTimeString(timeString: string): { hour24: number; minute: number } {
  const trimmed = timeString.trim().toUpperCase();

  // Check for AM/PM format
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();

    // Convert to 24-hour
    if (period === 'PM' && hour !== 12) {
      hour += 12;
    } else if (period === 'AM' && hour === 12) {
      hour = 0;
    }

    return { hour24: hour, minute };
  }

  // Check for 24-hour format
  const h24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    return {
      hour24: parseInt(h24Match[1], 10),
      minute: parseInt(h24Match[2], 10),
    };
  }

  // Default fallback - try to extract any numbers
  const numbers = trimmed.match(/\d+/g);
  if (numbers && numbers.length >= 2) {
    return {
      hour24: parseInt(numbers[0], 10) % 24,
      minute: parseInt(numbers[1], 10) % 60,
    };
  }

  // Can't parse - return midnight
  console.warn(`[time.ts] Could not parse time string: "${timeString}"`);
  return { hour24: 0, minute: 0 };
}

/**
 * Get UTC timestamp for a local time in a specific timezone.
 *
 * Uses Intl.DateTimeFormat to correctly handle DST.
 */
function getUtcTimestampForLocalTime(
  dateStr: string,
  hour: number,
  minute: number,
  timezone: string
): number {
  // Parse the date parts
  const [year, month, day] = dateStr.split('-').map(Number);

  // Create a date object - we'll use binary search to find the correct UTC time
  // that corresponds to the given local time in the target timezone
  //
  // Start with a rough estimate assuming no DST offset difference
  const roughEstimate = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Get the offset for the target timezone at this rough estimate
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Iterate to find the correct UTC time
  // The offset might be different at the actual target time due to DST
  let utcTimestamp = roughEstimate;
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(utcTimestamp));
    const localParts: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        localParts[part.type] = parseInt(part.value, 10);
      }
    }

    // Calculate the difference between what we want and what we have
    const currentHour = localParts.hour ?? 0;
    const currentMinute = localParts.minute ?? 0;

    const wantedMinutes = hour * 60 + minute;
    const currentMinutes = currentHour * 60 + currentMinute;
    const diffMinutes = wantedMinutes - currentMinutes;

    if (diffMinutes === 0) break;

    // Adjust
    utcTimestamp += diffMinutes * 60 * 1000;
  }

  return utcTimestamp;
}

/**
 * Get the current time in a specific timezone
 */
export function getNowInTimezone(timezone: string = DEFAULT_TIMEZONE): {
  date: Date;
  localDateStr: string;
  localTimeStr: string;
  timestamp: number;
} {
  const now = new Date();
  const timestamp = now.getTime();

  // Format the current time in the target timezone
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    date: now,
    localDateStr: dateFormatter.format(now), // YYYY-MM-DD
    localTimeStr: timeFormatter.format(now), // h:mm AM/PM
    timestamp,
  };
}

/**
 * Get today's date string in a specific timezone (YYYY-MM-DD)
 */
export function getTodayInTimezone(timezone: string = DEFAULT_TIMEZONE): string {
  return getNowInTimezone(timezone).localDateStr;
}

/**
 * Check if a sailing has departed based on timezone-aware comparison
 *
 * @param departureTimestampMs - Departure time as Unix timestamp (ms)
 * @param graceMinutes - Grace period after departure (default: 5 minutes)
 * @param nowTimestamp - Current time as Unix timestamp (optional, defaults to Date.now())
 */
export function hasSailingDeparted(
  departureTimestampMs: number,
  graceMinutes: number = DEPARTURE_GRACE_MINUTES,
  nowTimestamp: number = Date.now()
): boolean {
  const graceMs = graceMinutes * 60 * 1000;
  return nowTimestamp >= departureTimestampMs + graceMs;
}

/**
 * Determine sailing status based on time comparison
 *
 * @returns 'departed' | 'upcoming' | 'boarding' (within grace period)
 */
export function getSailingTimeStatus(
  departureTimestampMs: number,
  graceMinutes: number = DEPARTURE_GRACE_MINUTES,
  nowTimestamp: number = Date.now()
): 'departed' | 'upcoming' | 'boarding' {
  const graceMs = graceMinutes * 60 * 1000;

  if (nowTimestamp >= departureTimestampMs + graceMs) {
    return 'departed';
  } else if (nowTimestamp >= departureTimestampMs) {
    return 'boarding';
  } else {
    return 'upcoming';
  }
}

/**
 * Phase 45: Determine sailing display status respecting operator status.
 *
 * IMMUTABLE RULE: Canceled sailings are ALWAYS shown as 'canceled', never 'departed'.
 * This ensures canceled sailings remain visible in the "upcoming" section all day.
 *
 * @param departureTimestampMs - Departure time as Unix timestamp (ms)
 * @param operatorStatus - Operator status if known ('canceled', 'delayed', 'on_time', null)
 * @param graceMinutes - Grace period after departure (default: 5 minutes)
 * @returns 'canceled' | 'departed' | 'upcoming' | 'boarding'
 */
export function getSailingDisplayStatus(
  departureTimestampMs: number,
  operatorStatus: 'canceled' | 'delayed' | 'on_time' | null | undefined,
  graceMinutes: number = DEPARTURE_GRACE_MINUTES,
  nowTimestamp: number = Date.now()
): 'canceled' | 'departed' | 'upcoming' | 'boarding' {
  // IMMUTABLE RULE: Canceled sailings are NEVER "departed"
  // They must remain visible in the main section for the entire service day
  if (operatorStatus === 'canceled') {
    return 'canceled';
  }

  // For non-canceled sailings, use time-based status
  return getSailingTimeStatus(departureTimestampMs, graceMinutes, nowTimestamp);
}

/**
 * Phase 45: Check if a sailing should be shown in the "upcoming" section.
 *
 * RULE: Canceled sailings are ALWAYS "upcoming" for display purposes.
 * They should never be hidden in a collapsed "departed" section.
 *
 * @returns true if sailing should be in upcoming/main section
 */
export function isSailingUpcomingForDisplay(
  departureTimestampMs: number,
  operatorStatus: 'canceled' | 'delayed' | 'on_time' | null | undefined,
  graceMinutes: number = DEPARTURE_GRACE_MINUTES,
  nowTimestamp: number = Date.now()
): boolean {
  const status = getSailingDisplayStatus(
    departureTimestampMs,
    operatorStatus,
    graceMinutes,
    nowTimestamp
  );
  // Canceled, upcoming, and boarding all go in the main section
  return status !== 'departed';
}

/**
 * Format a time for display in 12-hour format
 */
export function formatTimeForDisplay(hour24: number, minute: number): string {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

/**
 * Get port timezone, with fallback to default
 */
export function getPortTimezone(portSlug: string): string {
  return PORT_TIMEZONES[portSlug] || DEFAULT_TIMEZONE;
}
