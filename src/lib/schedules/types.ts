/**
 * Sailing Schedule Types
 *
 * Types for sailing-level schedule data fetched from operator websites.
 * This is DISPLAY ONLY - no predictions or inferences about individual sailings.
 *
 * PROVENANCE RULES (Phase 15):
 * - Every schedule must declare its source_type
 * - source_type: "operator_live" = parsed from operator website/API
 * - source_type: "template" = user-configured template (must be labeled in UI)
 * - source_type: "unavailable" = could not fetch, no sailings shown
 * - We NEVER silently substitute made-up schedules
 *
 * TIMEZONE RULES (Phase 15 - Schedule Correctness):
 * - All times must be parsed in the correct IANA timezone
 * - DST is handled automatically via Intl APIs
 * - Each sailing stores both UTC timestamp and local display string
 */

/**
 * Source type for schedule data
 */
export type ScheduleSourceType =
  | 'operator_live'   // Parsed from operator website/API
  | 'template'        // User-configured template (explicitly labeled)
  | 'unavailable';    // Could not fetch, no schedule available

/**
 * Parse confidence level
 */
export type ParseConfidence =
  | 'high'    // Structured data, clear format
  | 'medium'  // Semi-structured, some ambiguity
  | 'low';    // Best-effort parsing, may be unreliable

/**
 * Schedule provenance metadata
 */
export interface ScheduleProvenance {
  /** How the schedule data was obtained */
  source_type: ScheduleSourceType;

  /** Operator name for attribution */
  source_name: string;

  /** When the data was fetched (ISO timestamp) */
  fetched_at: string;

  /** Link to operator's official schedule page */
  source_url: string;

  /** Confidence level in parsed data */
  parse_confidence: ParseConfidence;

  /** Whether operator provides per-sailing status */
  raw_status_supported: boolean;

  /** Error message if fetch failed */
  error_message?: string;

  /** Debug info (only populated when SCHEDULE_DEBUG=true) */
  debug?: {
    parse_count?: number;
    raw_html_size?: number;
    parse_duration_ms?: number;
    failure_reason?: string;
  };
}

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
  /** Scheduled departure time in UTC (ISO string) */
  departureTime: string;

  /** Departure timestamp in milliseconds (for accurate comparisons) */
  departureTimestampMs: number;

  /** Formatted departure time for display (e.g., "7:00 AM") - LOCAL TIME */
  departureTimeDisplay: string;

  /** Service date in local timezone (YYYY-MM-DD) */
  serviceDateLocal: string;

  /** IANA timezone for this sailing (e.g., "America/New_York") */
  timezone: string;

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

  /** Arrival time in UTC (ISO string) if available */
  arrivalTime?: string;

  /** Arrival timestamp in milliseconds if available */
  arrivalTimestampMs?: number;
}

/**
 * Result of fetching schedule for a route
 */
export interface ScheduleFetchResult {
  /** Whether fetch succeeded (does NOT mean sailings exist) */
  success: boolean;

  /** Sailings for today (empty if unavailable or none scheduled) */
  sailings: Sailing[];

  /** Schedule provenance metadata (REQUIRED in Phase 15+) */
  provenance: ScheduleProvenance;

  /** Date the schedule is for (YYYY-MM-DD in local timezone) */
  scheduleDate: string;

  /** IANA timezone for the schedule */
  timezone: string;

  /** Operator name for display */
  operator: string;

  /** Link to operator's schedule page */
  operatorScheduleUrl: string;
}
