/**
 * Daily Terminal Board Types
 *
 * Phase 19: Terminal-Centric Architecture
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
 * DESIGN FOR SCALE:
 * - Terminal Board is operator-agnostic
 * - Status overlay logic is operator-specific
 * - Risk logic is operator-independent
 */

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
 */
export type RiskLevel = 'low' | 'moderate' | 'elevated';

/**
 * Wind relation to route bearing
 */
export type WindRelation = 'head' | 'cross' | 'tail';

/**
 * Forecast risk overlay for a sailing (Layer 2 - interpretive only)
 */
export interface ForecastRisk {
  /** Overall risk level */
  level: RiskLevel;
  /** Explanation factors (e.g., ["High wind gusts", "Cross-wind exposure"]) */
  explanation: string[];
  /** How wind relates to route bearing */
  wind_relation: WindRelation;
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
  operator_status_source: 'status_page' | null;

  // ============================================================
  // LAYER 2 – FERRY FORECAST OVERLAY (interpretive)
  // ============================================================

  /** Weather-based risk assessment (null if not computed) */
  forecast_risk: ForecastRisk | null;

  // ============================================================
  // PROVENANCE
  // ============================================================

  /** Where the schedule data came from */
  schedule_source: 'template' | 'operator_live';

  /** Whether operator status overlay was applied to this sailing */
  status_overlay_applied: boolean;

  /** Vessel name if known (e.g., "M/V Island Home") */
  vessel_name?: string;

  /** Vessel type for display (e.g., "High-Speed", "Traditional") */
  vessel_type?: string;
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
 */
export interface BoardProvenance {
  /** Overall data freshness indicator */
  schedule_source: 'template' | 'operator_live' | 'mixed';

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
