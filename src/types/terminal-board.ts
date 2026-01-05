/**
 * Daily Terminal Board Types
 *
 * Phase 19: Terminal-Centric Architecture
 * Phase 60: Schedule Authority Lock
 *
 * Ferries operate as terminal departure boards, not abstract routes.
 * Operators (SSA, etc.) think: "What is leaving this terminal today?"
 *
 * A DailyTerminalBoard represents all sailings involving a single terminal
 * on a given date, interleaved and ordered by time.
 *
 * THREE-LAYER TRUTH MODEL (PRESERVED):
 * - Layer 0: Schedule (Base Truth) - canonical template schedule
 * - Layer 1: Operator Status (Sparse Overlay) - updates matching sailings
 * - Layer 2: Ferry Forecast Risk (Interpretive Only) - direction-aware
 *
 * PHASE 60 SCHEDULE AUTHORITY:
 * - "Today" views may ONLY show operator_live or operator_scraped sources
 * - "template" and "forecast_template" may NEVER appear in Today views
 * - Each sailing must declare its schedule_source
 *
 * DESIGN FOR SCALE:
 * - Terminal Board is operator-agnostic
 * - Status overlay logic is operator-specific
 * - Risk logic is operator-independent
 */

import { ScheduleSourceType, isOperatorSource } from '@/lib/schedules/types';

// Re-export for convenience
export type { ScheduleSourceType };
export { isOperatorSource };

// ============================================================
// TERMINAL TYPES
// ============================================================

/**
 * Terminal metadata
 */
export interface Terminal {
  /** Unique terminal identifier (e.g., "woods-hole") */
  id: string;
  /** Display name (e.g., "Woods Hole") */
  name: string;
  /** IANA timezone (e.g., "America/New_York") */
  timezone: string;
  /** Region this terminal belongs to */
  region_id: string;
}

/**
 * Operator metadata
 */
export interface BoardOperator {
  /** Unique operator identifier (e.g., "steamship-authority") */
  id: string;
  /** Display name (e.g., "The Steamship Authority") */
  name: string;
  /** URL to operator's status page (if available) */
  status_url?: string;
}

// ============================================================
// SAILING TYPES (TERMINAL BOARD SPECIFIC)
// ============================================================

/**
 * Operator status for a sailing (Layer 1)
 */
export type OperatorStatus = 'on_time' | 'canceled' | 'delayed' | null;

/**
 * Risk level for weather interpretation (Layer 2)
 * Phase 32: Extended with 'high' and 'severe' levels from prediction engine v2
 */
export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'severe';

/**
 * Wind relation to route bearing
 */
export type WindRelation = 'head' | 'cross' | 'tail';

/**
 * Forecast risk overlay for a sailing (Layer 2 - interpretive only)
 *
 * Phase 32: Enhanced with model version and forecast source metadata
 */
export interface ForecastRisk {
  /** Overall risk level */
  level: RiskLevel;
  /** Explanation factors (e.g., ["High wind gusts", "Cross-wind exposure"]) */
  explanation: string[];
  /** How wind relates to route bearing */
  wind_relation: WindRelation;

  // Phase 32: Prediction metadata (optional, present when using forecast data)
  /** Model version that generated this prediction (e.g., "v2.0.0") */
  model_version?: string;
  /** Weather forecast source (e.g., "gfs", "ecmwf") */
  forecast_source?: 'gfs' | 'ecmwf';
}

/**
 * A single sailing on the terminal board
 *
 * This is directional and concrete - represents one departure
 * from the board's terminal to a destination.
 */
export interface TerminalBoardSailing {
  /** Unique sailing identifier (format: "{operator}_{origin}_{dest}_{time}") */
  sailing_id: string;

  /** Operator running this sailing */
  operator_id: string;

  /** Origin terminal (always the board's terminal for departures) */
  origin_terminal: {
    id: string;
    name: string;
  };

  /** Destination terminal */
  destination_terminal: {
    id: string;
    name: string;
  };

  // ============================================================
  // TIME FIELDS
  // ============================================================

  /** Scheduled departure time for display (e.g., "9:30 AM") */
  scheduled_departure_local: string;

  /** Scheduled departure time in UTC (ISO string) */
  scheduled_departure_utc: string;

  /** Departure timestamp in milliseconds (for sorting/comparison) */
  departure_timestamp_ms: number;

  /** Scheduled arrival time for display (if known) */
  scheduled_arrival_local: string | null;

  /** Scheduled arrival time in UTC (if known) */
  scheduled_arrival_utc: string | null;

  /** IANA timezone for this sailing */
  timezone: string;

  // ============================================================
  // LAYER 1 – OPERATOR STATUS (authoritative)
  // ============================================================

  /** Status from operator (on_time, canceled, delayed, or null if unknown) */
  operator_status: OperatorStatus;

  /** Reason for status (e.g., "Due to weather conditions") */
  operator_status_reason: string | null;

  /** Where status came from */
  // Phase 48: Added 'supabase_sailing_events' for authoritative overlay source
  operator_status_source: 'status_page' | 'supabase_sailing_events' | null;

  // ============================================================
  // LAYER 2 – FERRY FORECAST OVERLAY (interpretive)
  // ============================================================

  /** Weather-based risk assessment (null if not computed) */
  forecast_risk: ForecastRisk | null;

  // ============================================================
  // PROVENANCE (Phase 60: Schedule Authority Lock)
  // ============================================================

  /**
   * Where the schedule data came from
   *
   * PHASE 60 SCHEDULE AUTHORITY:
   * - Today views ONLY allow: 'operator_live' | 'operator_scraped'
   * - Future views may show: 'forecast_template'
   * - 'template' and 'forecast_template' NEVER appear in Today views
   */
  schedule_source: ScheduleSourceType;

  /** Whether operator status overlay was applied to this sailing */
  status_overlay_applied: boolean;

  /** Vessel name if known (e.g., "M/V Island Home") */
  vessel_name?: string;

  /** Vessel type for display (e.g., "High-Speed", "Traditional") */
  vessel_type?: string;

  // ============================================================
  // PHASE 74: REMOVED SAILING TRACKING
  // ============================================================

  /**
   * Phase 74: Origin marker for removed sailings
   *
   * PHASE 74 SSA DISAPPEARING CANCELLATION INGESTION:
   * - 'operator_removed': Sailing was in the full schedule but NOT in the active list
   *   (SSA removes canceled sailings instead of marking them as canceled)
   * - undefined/null: Normal sailing from operator scrape
   *
   * UI TREATMENT:
   * - When sailing_origin is 'operator_removed': show muted + strikethrough
   * - The sailing should display as canceled but with visual distinction
   *   indicating it was inferred from disappearance, not explicitly marked
   */
  sailing_origin?: 'operator_removed' | null;
}

// ============================================================
// DAILY TERMINAL BOARD
// ============================================================

/**
 * Advisory from operator (passed through verbatim)
 */
export interface BoardAdvisory {
  /** Advisory title */
  title: string;
  /** Advisory text (verbatim from operator) */
  text: string;
  /** When advisory was fetched */
  fetched_at: string;
  /** Which operator issued this advisory */
  operator_id: string;
}

/**
 * Provenance metadata for the board
 *
 * Phase 60: Schedule Authority Lock
 * - Today boards MUST have schedule_source of 'operator_live' | 'operator_scraped' | 'mixed'
 * - 'mixed' allowed only if ALL components are operator sources
 * - 'unavailable' returned if no operator data
 *
 * Phase 65: Operator Filter Tracking
 * - When operator filter is applied, track original vs filtered counts
 */
export interface BoardProvenance {
  /**
   * Overall data freshness indicator
   *
   * Phase 60: For Today views, only operator sources allowed
   */
  schedule_source: ScheduleSourceType | 'mixed';

  /** Whether any operator status overlays were applied */
  status_overlay_available: boolean;

  /** When the board was generated */
  generated_at: string;

  /** Per-operator status fetch info (Phase 26: observer_cache added) */
  operator_status_sources: Array<{
    operator_id: string;
    source: 'status_page' | 'observer_cache' | 'unavailable';
    fetched_at: string;
    url?: string;
  }>;

  // ============================================================
  // PHASE 65: OPERATOR FILTER TRACKING
  // ============================================================

  /** Operator filter applied (if any) - internal operator ID */
  operator_filter_applied?: string;

  /** Original sailing count before filtering */
  original_sailing_count?: number;

  /** Sailing count after operator filtering */
  filtered_sailing_count?: number;

  // ============================================================
  // PHASE 73: HARD SEPARATION OF OPERATOR TRUTH VS TEMPLATES
  // ============================================================

  /**
   * Today's data authority mode
   *
   * PHASE 73 RULE: Today is EITHER 100% operator-driven OR 100% template-driven.
   * - 'operator_only': Operator sailings exist, templates are EXCLUDED from Today
   * - 'template_only': No operator sailings, templates are used as fallback
   *
   * This field is ONLY set for Today views. Future views don't have this constraint.
   */
  today_authority?: 'operator_only' | 'template_only';

  /**
   * Reason templates were excluded (if today_authority is 'operator_only')
   *
   * Explains WHY templates were not shown, for debugging and transparency.
   * Examples:
   * - "Operator sailings exist for wh-vh-ssa"
   * - "Operator schedule (wh-vh-ssa) takes precedence"
   */
  template_excluded_reason?: string | null;
}

/**
 * DailyTerminalBoard - The core data structure for Phase 19
 *
 * Represents all sailings involving a single terminal on a given date,
 * interleaved and ordered by departure time.
 *
 * This mirrors how operators publish schedules and statuses.
 */
export interface DailyTerminalBoard {
  // ============================================================
  // BOARD METADATA
  // ============================================================

  /** Terminal this board is for */
  terminal: Terminal;

  /** Service date in local timezone (YYYY-MM-DD) */
  service_date_local: string;

  /** When this board was generated (UTC ISO string) */
  generated_at_utc: string;

  /** Operators serving this terminal */
  operators: BoardOperator[];

  // ============================================================
  // SAILINGS (THE HEART OF THE BOARD)
  // ============================================================

  /**
   * All departures from this terminal, ordered by time
   *
   * This includes sailings to ALL destinations served by ALL operators.
   * Interleaved chronologically as they would appear on a departure board.
   */
  departures: TerminalBoardSailing[];

  /**
   * All arrivals to this terminal, ordered by time
   *
   * Optional - may not be populated if arrivals aren't tracked.
   */
  arrivals?: TerminalBoardSailing[];

  // ============================================================
  // ADVISORIES
  // ============================================================

  /** Travel advisories from operators (verbatim) */
  advisories: BoardAdvisory[];

  // ============================================================
  // PROVENANCE
  // ============================================================

  /** Data source and freshness metadata */
  provenance: BoardProvenance;

  // ============================================================
  // LINKS
  // ============================================================

  /** URL to operator's official status page for this terminal */
  operator_status_url?: string;
}

// ============================================================
// API RESPONSE TYPE
// ============================================================

/**
 * API response for terminal board endpoint
 */
export interface TerminalBoardResponse {
  success: boolean;
  board: DailyTerminalBoard | null;
  error?: string;
}
