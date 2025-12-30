/**
 * Sailing Schedule Types
 *
 * Types for sailing-level schedule data fetched from operator websites.
 * This is DISPLAY ONLY - no predictions or inferences about individual sailings.
 */

/**
 * Status of an individual sailing as reported by the operator
 */
export type SailingStatus =
  | 'scheduled'   // Normal scheduled sailing
  | 'on_time'     // Confirmed running on time
  | 'delayed'     // Operator reports delay
  | 'canceled'    // Operator reports cancellation
  | 'unknown';    // Status not available

/**
 * Direction of travel
 */
export interface SailingDirection {
  from: string;       // Port name (display)
  fromSlug: string;   // Port slug
  to: string;         // Port name (display)
  toSlug: string;     // Port slug
}

/**
 * A single scheduled sailing
 */
export interface Sailing {
  /** Scheduled departure time (ISO string) */
  departureTime: string;

  /** Formatted departure time for display (e.g., "7:00 AM") */
  departureTimeDisplay: string;

  /** Direction of this sailing */
  direction: SailingDirection;

  /** Operator name */
  operator: string;

  /** Operator slug for linking */
  operatorSlug: string;

  /** Status of this sailing as reported by operator */
  status: SailingStatus;

  /** Status message if available (e.g., "Canceled due to weather") */
  statusMessage?: string;

  /** Whether this status came from the operator (vs inferred) */
  statusFromOperator: boolean;

  /** Vessel name if known */
  vesselName?: string;
}

/**
 * Result of fetching schedule for a route
 */
export interface ScheduleFetchResult {
  success: boolean;

  /** Sailings for today (may be empty if none scheduled or fetch failed) */
  sailings: Sailing[];

  /** When the schedule was fetched */
  fetchedAt: string;

  /** Date the schedule is for (YYYY-MM-DD) */
  scheduleDate: string;

  /** Error message if fetch failed */
  error?: string;

  /** Operator name for display */
  operator: string;

  /** Link to operator's schedule page */
  operatorScheduleUrl?: string;

  /** Whether schedule data is from a static fallback */
  isStaticFallback: boolean;
}

/**
 * Static schedule template for when live fetch fails
 * These are approximate times - actual schedules vary by season
 */
export interface StaticScheduleTemplate {
  operator: string;
  operatorSlug: string;
  operatorUrl: string;
  /** Approximate departure times (local time, 24h format) */
  departureTimes: string[];
}
