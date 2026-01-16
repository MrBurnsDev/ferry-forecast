/**
 * Terminal Board Service
 *
 * Phase 19: Terminal-Centric Architecture
 *
 * Produces DailyTerminalBoard - all sailings departing from a terminal,
 * interleaved and ordered by time, across all operators.
 *
 * THREE-LAYER TRUTH MODEL:
 * - Layer 0: Schedule (template) - defines which sailings exist
 * - Layer 1: Operator Status - sparse overlay, updates matching sailings
 * - Layer 2: Forecast Risk - interpretive, never predicts cancellation
 */

import type {
  DailyTerminalBoard,
  TerminalBoardSailing,
  BoardAdvisory,
  BoardProvenance,
  ForecastRisk,
  OperatorStatus,
  RiskLevel,
  WindRelation,
} from '@/types/terminal-board';
import {
  getTerminalById,
  getOperatorsForTerminal,
  getAllRoutesForTerminalByOperator,
} from '@/lib/config/terminals';
import { getTodaySchedule } from '@/lib/schedules';
import type { Sailing, ScheduleFetchResult } from '@/lib/schedules/types';
import { getTodayInTimezone } from '@/lib/schedules/time';
import {
  computeSailingRisk,
  type WeatherContext,
} from '@/lib/scoring/sailing-risk';

// ============================================================
// TERMINAL BOARD GENERATION
// ============================================================

/**
 * Generate a DailyTerminalBoard for a terminal
 *
 * This is the main entry point for terminal-centric data.
 *
 * @param terminalId - Terminal identifier (e.g., "woods-hole")
 * @param weather - Optional weather context for risk computation
 * @returns Complete DailyTerminalBoard
 */
export async function getDailyTerminalBoard(
  terminalId: string,
  weather?: WeatherContext | null
): Promise<DailyTerminalBoard | null> {
  const terminal = getTerminalById(terminalId);
  if (!terminal) {
    return null;
  }

  const now = new Date();
  const serviceDateLocal = getTodayInTimezone(terminal.timezone);
  const operators = getOperatorsForTerminal(terminalId);

  // Collect all sailings from all operators
  const allSailings: TerminalBoardSailing[] = [];
  const allAdvisories: BoardAdvisory[] = [];
  const operatorStatusSources: BoardProvenance['operator_status_sources'] = [];

  let hasAnyLiveSchedule = false;
  let hasAnyStatusOverlay = false;

  // Fetch schedules for each operator serving this terminal
  // Use ALL routes involving this terminal (departures AND arrivals)
  for (const operator of operators) {
    const routeIds = getAllRoutesForTerminalByOperator(terminalId, operator.id);

    for (const routeId of routeIds) {
      const scheduleResult = await getTodaySchedule(routeId);

      // Track provenance (Phase 80.3: canonical value)
      if (scheduleResult.provenance.source_type === 'operator_status') {
        hasAnyLiveSchedule = true;
      }

      if (scheduleResult.statusSource?.source === 'operator_status_page') {
        hasAnyStatusOverlay = true;
      }

      // Convert sailings to terminal board format
      // PHASE 93: Pass serviceDateLocal for date-qualified sailing IDs
      const boardSailings = convertSailingsToBoard(
        scheduleResult,
        operator.id,
        routeId,
        serviceDateLocal,
        weather
      );
      allSailings.push(...boardSailings);

      // Collect advisories (dedupe later)
      if (scheduleResult.advisories) {
        for (const advisory of scheduleResult.advisories) {
          allAdvisories.push({
            title: advisory.title,
            text: advisory.text,
            fetched_at: advisory.fetchedAt,
            operator_id: operator.id,
          });
        }
      }

      // Track status source per operator (only once per operator)
      if (!operatorStatusSources.some((s) => s.operator_id === operator.id)) {
        operatorStatusSources.push({
          operator_id: operator.id,
          source: scheduleResult.statusSource?.source === 'operator_status_page'
            ? 'status_page'
            : 'unavailable',
          fetched_at: scheduleResult.statusSource?.fetchedAt || scheduleResult.provenance.fetched_at,
          url: scheduleResult.statusSource?.url,
        });
      }
    }
  }

  // Sort sailings by departure time (interleaved)
  allSailings.sort((a, b) => a.departure_timestamp_ms - b.departure_timestamp_ms);

  // Dedupe advisories by text
  const seenAdvisoryTexts = new Set<string>();
  const uniqueAdvisories = allAdvisories.filter((a) => {
    if (seenAdvisoryTexts.has(a.text)) return false;
    seenAdvisoryTexts.add(a.text);
    return true;
  });

  // Determine overall schedule source (Phase 80.3: canonical values)
  let scheduleSource: BoardProvenance['schedule_source'];
  if (hasAnyLiveSchedule && !allSailings.some((s) => s.schedule_source === 'template')) {
    scheduleSource = 'operator_status'; // Phase 80.3: Canonical value
  } else if (!hasAnyLiveSchedule) {
    scheduleSource = 'template';
  } else {
    scheduleSource = 'mixed';
  }

  // Build provenance
  const provenance: BoardProvenance = {
    schedule_source: scheduleSource,
    status_overlay_available: hasAnyStatusOverlay,
    generated_at: now.toISOString(),
    operator_status_sources: operatorStatusSources,
  };

  // Find operator status URL for this terminal (prefer SSA)
  const ssaOperator = operators.find((o) => o.id === 'steamship-authority');
  const operatorStatusUrl = ssaOperator?.status_url || operators[0]?.status_url;

  return {
    terminal,
    service_date_local: serviceDateLocal,
    generated_at_utc: now.toISOString(),
    operators,
    departures: allSailings,
    advisories: uniqueAdvisories,
    provenance,
    operator_status_url: operatorStatusUrl,
  };
}

// ============================================================
// SAILING CONVERSION
// ============================================================

/**
 * Convert schedule sailings to terminal board format
 * Phase 93: Added serviceDate for date-qualified sailing IDs
 */
function convertSailingsToBoard(
  scheduleResult: ScheduleFetchResult,
  operatorId: string,
  routeId: string,
  serviceDate: string,
  weather?: WeatherContext | null
): TerminalBoardSailing[] {
  return scheduleResult.sailings.map((sailing) => {
    // Compute forecast risk if weather is available
    let forecastRisk: ForecastRisk | null = null;
    if (weather) {
      const risk = computeSailingRisk(sailing, weather, routeId);
      forecastRisk = {
        level: risk.level as RiskLevel,
        explanation: risk.reason ? [risk.reason] : [],
        wind_relation: mapWindRelation(risk.windRelation),
      };
    }

    // Map operator status
    const operatorStatus = mapSailingStatus(sailing.status);

    // Generate sailing ID - Phase 93: Now includes serviceDate
    const sailingId = generateSailingId(
      operatorId,
      sailing.direction.fromSlug,
      sailing.direction.toSlug,
      serviceDate,
      sailing.departureTimeDisplay
    );

    return {
      sailing_id: sailingId,
      operator_id: operatorId,

      origin_terminal: {
        id: sailing.direction.fromSlug,
        name: sailing.direction.from,
      },
      destination_terminal: {
        id: sailing.direction.toSlug,
        name: sailing.direction.to,
      },

      scheduled_departure_local: sailing.departureTimeDisplay,
      scheduled_departure_utc: sailing.departureTime,
      departure_timestamp_ms: sailing.departureTimestampMs,
      scheduled_arrival_local: null, // Not tracked in current schedule format
      scheduled_arrival_utc: sailing.arrivalTime || null,
      timezone: sailing.timezone,

      // Layer 1: Operator status
      operator_status: operatorStatus,
      operator_status_reason: sailing.statusMessage || null,
      operator_status_source: sailing.statusFromOperator ? 'status_page' : null,

      // Layer 2: Forecast risk
      forecast_risk: forecastRisk,

      // Provenance (Phase 80.3: canonical values)
      schedule_source: scheduleResult.provenance.source_type === 'operator_status'
        ? 'operator_status'
        : 'template',
      status_overlay_applied: sailing.statusFromOperator,

      vessel_name: sailing.vesselName,
    };
  });
}

/**
 * Map schedule sailing status to terminal board operator status
 */
function mapSailingStatus(status: Sailing['status']): OperatorStatus {
  switch (status) {
    case 'on_time':
      return 'on_time';
    case 'canceled':
      return 'canceled';
    case 'delayed':
      return 'delayed';
    case 'scheduled':
    case 'unknown':
    default:
      return null;
  }
}

/**
 * Map wind relation from sailing risk to terminal board format
 */
function mapWindRelation(
  relation: 'headwind' | 'tailwind' | 'crosswind' | 'quartering' | null
): WindRelation {
  switch (relation) {
    case 'headwind':
      return 'head';
    case 'tailwind':
      return 'tail';
    case 'crosswind':
    case 'quartering':
      return 'cross';
    default:
      return 'cross'; // Default
  }
}

/**
 * Generate a unique sailing ID
 *
 * PHASE 93: Date-Qualified Sailing Identity
 *
 * A sailing is an EVENT, not a template. Events require a date.
 * This ensures predictions can ONLY match the exact sailing they were placed on.
 *
 * Format: {operator}_{origin}_{destination}_{serviceDate}_{time}
 * Example: steamship-authority_woods-hole_vineyard-haven_2026-01-16_700am
 *
 * @param operatorId - Operator identifier (e.g., "steamship-authority")
 * @param originSlug - Origin port slug (e.g., "woods-hole")
 * @param destSlug - Destination port slug (e.g., "vineyard-haven")
 * @param serviceDate - Service date in YYYY-MM-DD format (REQUIRED)
 * @param departureTime - Departure time display (e.g., "7:00 AM")
 * @throws Error if serviceDate is missing or invalid
 */
function generateSailingId(
  operatorId: string,
  originSlug: string,
  destSlug: string,
  serviceDate: string,
  departureTime: string
): string {
  // HARD GUARD: serviceDate is REQUIRED - no silent fallbacks
  if (!serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    throw new Error(
      `[PHASE93] generateSailingId requires valid serviceDate (YYYY-MM-DD), got: "${serviceDate}"`
    );
  }

  // Normalize time for ID
  const timeNormalized = departureTime
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(':', '');

  return `${operatorId}_${originSlug}_${destSlug}_${serviceDate}_${timeNormalized}`;
}

// ============================================================
// HELPER EXPORTS
// ============================================================

export { getTerminalById, getOperatorsForTerminal } from '@/lib/config/terminals';
