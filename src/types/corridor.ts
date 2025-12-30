/**
 * Service Corridor Types
 *
 * Phase 21: Service Corridor Architecture
 *
 * A Service Corridor is a bidirectional ferry service connecting two terminals,
 * possibly served by one or more operators, viewed as a single operational unit.
 *
 * Examples:
 * - Woods Hole ↔ Vineyard Haven
 * - Hyannis ↔ Nantucket
 *
 * Corridors:
 * - Are bidirectional by definition
 * - Own the "daily operating picture"
 * - Match how operators publish schedules and statuses
 * - Are the correct primary UX unit
 *
 * THREE-LAYER TRUTH MODEL (PRESERVED):
 * - Layer 0: Schedule (Base Truth) - template schedules for both directions
 * - Layer 1: Operator Status (Sparse Overlay) - updates matching sailings
 * - Layer 2: Ferry Forecast Risk (Interpretive Only) - per-sailing risk
 */

import type {
  Terminal,
  BoardOperator,
  TerminalBoardSailing,
  BoardAdvisory,
  BoardProvenance,
} from './terminal-board';

// ============================================================
// SERVICE CORRIDOR DEFINITION
// ============================================================

/**
 * Service Corridor configuration
 *
 * Defines a bidirectional ferry service between two terminals.
 */
export interface ServiceCorridor {
  /** Unique corridor identifier (e.g., "woods-hole-vineyard-haven") */
  id: string;

  /** Display name (e.g., "Woods Hole ↔ Vineyard Haven") */
  display_name: string;

  /** First terminal (alphabetically or by convention) */
  terminal_a: string;

  /** Second terminal */
  terminal_b: string;

  /** Operators serving this corridor */
  supported_operators: string[];

  /** Default timezone for display */
  default_timezone: string;

  /** Region this corridor belongs to */
  region_id: string;

  /** Whether this corridor is currently active */
  active: boolean;

  /** Route IDs that comprise this corridor (both directions) */
  route_ids: string[];
}

// ============================================================
// DAILY CORRIDOR BOARD
// ============================================================

/**
 * DailyCorridorBoard - The primary UX data structure for Phase 21
 *
 * Represents all sailings in both directions for a corridor on a given date,
 * interleaved and ordered by departure time.
 *
 * This matches how SSA's "Traveling Today" page works - showing all sailings
 * between two points, regardless of direction.
 */
export interface DailyCorridorBoard {
  // ============================================================
  // BOARD METADATA
  // ============================================================

  /** Corridor this board is for */
  corridor: ServiceCorridor;

  /** The two terminals in this corridor */
  terminals: {
    a: Terminal;
    b: Terminal;
  };

  /** Service date in local timezone (YYYY-MM-DD) */
  service_date_local: string;

  /** When this board was generated (UTC ISO string) */
  generated_at_utc: string;

  /** Operators serving this corridor */
  operators: BoardOperator[];

  // ============================================================
  // SAILINGS (THE HEART OF THE BOARD)
  // ============================================================

  /**
   * All sailings in BOTH directions, ordered by departure time
   *
   * This includes sailings from A→B and B→A, interleaved chronologically.
   * This is what users want to see: "What's running today between these two places?"
   */
  sailings: TerminalBoardSailing[];

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

  /** URL to operator's official status page */
  operator_status_url?: string;
}

// ============================================================
// API RESPONSE TYPE
// ============================================================

/**
 * API response for corridor board endpoint
 */
export interface CorridorBoardResponse {
  success: boolean;
  board: DailyCorridorBoard | null;
  error?: string;
}

/**
 * Corridor summary for discovery (used in terminal pages)
 */
export interface CorridorSummary {
  id: string;
  display_name: string;
  other_terminal: Terminal;
  operators: BoardOperator[];
  /** Next sailing in either direction (for preview) */
  next_sailing?: {
    departure_local: string;
    direction: string;
    operator_id: string;
  };
}
