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
 *
 * PHASE 60 SCHEDULE AUTHORITY:
 * - "Today" views may ONLY show operator_live or operator_scraped sources
 * - "template" and "forecast_template" may NEVER appear in Today views
 * - Each sailing must declare its schedule_source
 */
export type ScheduleSourceType =
  | 'operator_live'       // Real-time from operator website/API (observer cache, scraping)
  | 'operator_scraped'    // From Supabase sailing_events (operator ingested via scraper)
  | 'template'            // Static template (NOT allowed in Today views)
  | 'forecast_template'   // Template for future dates only (NOT allowed in Today views)
  | 'unavailable';        // Could not fetch, no schedule available

/**
 * Check if a schedule source is allowed for Today views
 * Phase 60: Only operator sources are allowed for current date
 */
export function isOperatorSource(source: ScheduleSourceType): boolean {
  return source === 'operator_live' || source === 'operator_scraped';
}

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

  /** Phase 26: Whether status overlay data is currently available */
  status_overlay_available?: boolean;

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

  /**
   * Phase 60: Source of schedule data for this sailing
   * REQUIRED - every sailing must declare its source
   */
  scheduleSource?: ScheduleSourceType;

  /** Vessel name if known */
  vesselName?: string;

  /** Arrival time in UTC (ISO string) if available */
  arrivalTime?: string;

  /** Arrival timestamp in milliseconds if available */
  arrivalTimestampMs?: number;
}

/**
 * Travel advisory from operator (Phase 17)
 */
export interface OperatorAdvisory {
  /** Advisory title (e.g., "Travel Advisory") */
  title: string;
  /** Advisory text (verbatim from operator) */
  text: string;
  /** When the advisory was fetched */
  fetchedAt: string;
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

  /** Travel advisories from operator (Phase 17) */
  advisories?: OperatorAdvisory[];

  /** Status source info (Phase 17, Phase 26: observer_cache) */
  statusSource?: {
    /** Where sailing status came from */
    source: 'operator_status_page' | 'schedule_page' | 'observer_cache' | 'unavailable';
    /** URL of the status page */
    url?: string;
    /** When status was fetched */
    fetchedAt?: string;
  };
}
