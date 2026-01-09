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
 * PHASE 60/80.3 SCHEDULE AUTHORITY:
 * - "Today" views may ONLY show operator_snapshot or operator_status sources
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
   * PHASE 60/80.3 SCHEDULE AUTHORITY:
   * - Today views ONLY allow: 'operator_snapshot' | 'operator_status'
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

  // ============================================================
  // PHASE 81: LIKELIHOOD TO RUN PREDICTION
  // ============================================================

  /**
   * Phase 81: Predicted likelihood this sailing will run (0-100%)
   *
   * Based on historical data + current weather conditions.
   * This is INTERPRETIVE, not authoritative.
   */
  likelihood_to_run_pct?: number | null;

  /**
   * Phase 81: Confidence level of the likelihood prediction
   *
   * - 'high': >= 100 historical samples
   * - 'medium': 30-99 samples
   * - 'low': < 30 samples
   */
  likelihood_confidence?: 'high' | 'medium' | 'low' | null;

  /**
   * Phase 81: Basis for the likelihood calculation
   *
   * - 'same_operator': Based on this operator's historical data
   * - 'cross_operator': Based on similar routes from other operators
   * - 'limited_data': Insufficient data, using defaults
   */
  likelihood_basis?: 'same_operator' | 'cross_operator' | 'limited_data' | null;

  /**
   * Phase 81: Sample size used for likelihood calculation
   * Useful for debugging and transparency
   */
  likelihood_sample_size?: number | null;

  // ============================================================
  // PHASE 81.3: PER-SAILING WEATHER FORECAST
  // ============================================================

  /**
   * Phase 81.3: Forecasted wind speed for this sailing's departure time (mph)
   * Each sailing has its own weather forecast, not shared current conditions.
   */
  forecast_wind_speed?: number | null;

  /**
   * Phase 81.3: Forecasted wind gusts for this sailing's departure time (mph)
   */
  forecast_wind_gusts?: number | null;

  /**
   * Phase 81.3: Forecasted wind direction for this sailing's departure time (degrees)
   */
  forecast_wind_direction?: number | null;

  /**
   * Phase 81.3: Wind direction as cardinal text (e.g., "NNW", "E")
   */
  forecast_wind_direction_text?: string | null;
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
 * Phase 60/80.3: Schedule Authority Lock
 * - Today boards MUST have schedule_source of 'operator_snapshot' | 'operator_status' | 'mixed'
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

  /** Per-operator status fetch info (Phase 26: observer_cache added, Phase 80.2: supabase added) */
  operator_status_sources: Array<{
    operator_id: string;
    source: 'status_page' | 'observer_cache' | 'supabase_sailing_events' | 'unavailable';
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

  // ============================================================
  // PHASE 78.1: DEBUG AUDIT INFO
  // ============================================================

  /**
   * Debug audit information for schedule authority decisions.
   * Only populated when SCHEDULE_DEBUG is enabled or for diagnostics.
   *
   * Phase 78.1: Uses canonical schedule_source values
   */
  debug?: {
    phase78_operator_schedule?: boolean;
    operator_sailing_count?: number;
    template_sailing_count?: number;
    templates_included?: boolean;
    base_schedule_source?: 'operator' | 'template';
    // Phase 81.3 debug
    prediction_context?: {
      source: 'database' | 'heuristic_baseline' | 'none';
      predictions_size: number;
      sample_keys: string[];
      load_trace: string;
    } | null;
  };

  /**
   * Phase 77: Detailed schedule authority audit
   * Records which operators had schedules and the decision logic.
   */
  schedule_authority_audit?: {
    operator_checks: Array<{
      operator_id: string;
      has_schedule: boolean;
      sailing_count: number;
      distinct_times: string[];
    }>;
    today_authority: 'operator_only' | 'template_only';
    operator_sailing_count: number;
    template_sailing_count: number;
    templates_included: boolean;
    base_schedule_source: 'operator' | 'template';
  };

  // ============================================================
  // PHASE 81: OPERATOR LIVE STATUS AVAILABILITY
  // ============================================================

  /**
   * Phase 81: Which operators have live status feeds available
   *
   * Used to show appropriate UI messaging for operators like Hy-Line
   * that don't publish real-time status updates.
   */
  operators_with_live_status?: string[];

  /**
   * Phase 81: Which operators are using cross-operator likelihood modeling
   *
   * When an operator doesn't have enough historical data, we use
   * data from similar routes on other operators.
   */
  operators_using_cross_operator_model?: string[];
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
