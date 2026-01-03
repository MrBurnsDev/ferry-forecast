/**
 * Corridor Board Service
 *
 * Phase 21: Service Corridor Architecture
 * Phase 32: Enhanced with Open-Meteo forecast predictions
 *
 * Produces DailyCorridorBoard - all sailings in both directions for a corridor,
 * interleaved and ordered by time, across all operators.
 *
 * THREE-LAYER TRUTH MODEL:
 * - Layer 0: Schedule (template) - defines which sailings exist (BOTH directions)
 * - Layer 1: Operator Status - sparse overlay, updates matching sailings
 * - Layer 2: Forecast Risk - interpretive, never predicts cancellation
 *
 * DATA FLOW RULES (Critical):
 * - Start from template schedule for the corridor (BOTH directions)
 * - Overlay operator status (sparse, authoritative)
 * - Overlay risk (interpretive, never authoritative)
 * - Never create sailings from status data
 * - Never hide scheduled sailings unless operator explicitly cancels
 * - Never infer cancellation from weather
 *
 * PHASE 32 ENHANCEMENTS:
 * - Use Open-Meteo forecasts for hour-specific risk when available
 * - Fall back to current NOAA weather when forecast unavailable
 * - Generate versioned predictions for learning loop
 */

import type { DailyCorridorBoard } from '@/types/corridor';
import type {
  TerminalBoardSailing,
  BoardAdvisory,
  BoardProvenance,
  ForecastRisk,
  RiskLevel,
  WindRelation,
} from '@/types/terminal-board';
import {
  getCorridorById,
  getCorridorTerminals,
  getOperatorsForCorridor,
  getCorridorStatusUrl,
} from '@/lib/config/corridors';
import { getTodaySchedule } from '@/lib/schedules';
import type { Sailing, ScheduleFetchResult } from '@/lib/schedules/types';
import { getTodayInTimezone } from '@/lib/schedules/time';
import {
  computeSailingRisk,
  type WeatherContext,
} from '@/lib/scoring/sailing-risk';
import { getForecastRange, type ForecastHour } from '@/lib/weather/open-meteo';
import { generatePrediction, type PredictionResult } from '@/lib/scoring/prediction-engine-v2';
// Phase 48: Canonical overlay loader
// Phase 48.1: Extended loader for full union (synthetic sailings)
import {
  loadExtendedStatusOverlay,
  generateSailingKey,
  normalizePortSlug,
  type PersistedStatus,
  type ExtendedStatusOverlay,
  type RawSailingEvent,
} from '@/lib/events/sailing-events';

// ============================================================
// CORRIDOR BOARD GENERATION
// ============================================================

/**
 * Options for corridor board generation
 */
export interface CorridorBoardOptions {
  /** Use Open-Meteo forecast data for future sailings */
  useForecast?: boolean;
}

/**
 * Forecast context for hour-specific risk computation
 */
interface ForecastContext {
  forecasts: ForecastHour[];
  source: 'gfs' | 'ecmwf';
}

/**
 * Generate a DailyCorridorBoard for a corridor
 *
 * This is the main entry point for corridor-centric data.
 *
 * @param corridorId - Corridor identifier (e.g., "woods-hole-vineyard-haven")
 * @param weather - Optional weather context for risk computation (current weather)
 * @param options - Additional options for board generation
 * @returns Complete DailyCorridorBoard
 */
export async function getDailyCorridorBoard(
  corridorId: string,
  weather?: WeatherContext | null,
  options?: CorridorBoardOptions
): Promise<DailyCorridorBoard | null> {
  const corridor = getCorridorById(corridorId);
  if (!corridor) {
    return null;
  }

  const terminals = getCorridorTerminals(corridorId);
  if (!terminals) {
    return null;
  }

  const now = new Date();
  const serviceDateLocal = getTodayInTimezone(corridor.default_timezone);
  const operators = getOperatorsForCorridor(corridorId);

  // Phase 32: Optionally fetch Open-Meteo forecast data
  let forecastContext: ForecastContext | null = null;
  if (options?.useForecast) {
    try {
      // Fetch 24-hour forecast range for this corridor
      const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const forecasts = await getForecastRange(corridorId, now, endTime, 'gfs');
      if (forecasts.length > 0) {
        forecastContext = { forecasts, source: 'gfs' };
      }
    } catch (error) {
      console.warn(`[CORRIDOR_BOARD] Forecast fetch failed for ${corridorId}:`, error);
      // Continue without forecast data
    }
  }

  // ============================================================
  // PHASE 48.1: LOAD EXTENDED STATUS OVERLAY FROM SUPABASE
  // ============================================================
  // This is the SINGLE SOURCE OF TRUTH for sailing status.
  // Cancellations in this overlay MUST appear in the final response.
  //
  // FULL UNION LOGIC:
  // 1. Load overlay with raw records for synthetic sailing creation
  // 2. Convert schedule sailings with overlay merge
  // 3. Create synthetic sailings for DB-only cancellations
  // 4. Merge all sailings chronologically
  // 5. HARD GUARD: Throw error if output has fewer cancellations than DB

  // Map operator_id from corridor routes (e.g., "wh-vh-ssa" -> "ssa")
  const operatorIds = new Set<string>();
  for (const routeId of corridor.route_ids) {
    const operatorId = getOperatorIdFromRouteId(routeId);
    // Normalize to DB format
    if (operatorId === 'steamship-authority') {
      operatorIds.add('ssa');
    } else if (operatorId === 'hy-line-cruises') {
      operatorIds.add('hy-line-cruises');
    } else {
      operatorIds.add(operatorId);
    }
  }

  // Load extended overlay for all operators in this corridor
  const extendedOverlays: ExtendedStatusOverlay[] = [];
  for (const operatorId of operatorIds) {
    const extOverlay = await loadExtendedStatusOverlay(operatorId, serviceDateLocal);
    if (extOverlay.statusMap.size > 0) {
      extendedOverlays.push(extOverlay);
    }
  }

  // Merge all overlays into one (cancellations are sticky)
  const mergedOverlay = new Map<string, PersistedStatus>();
  const allRawRecords: Array<RawSailingEvent & { operatorId: string }> = [];

  for (let i = 0; i < extendedOverlays.length; i++) {
    const extOverlay = extendedOverlays[i];
    const operatorId = Array.from(operatorIds)[i];

    for (const [key, status] of extOverlay.statusMap) {
      const existing = mergedOverlay.get(key);
      if (!existing || (status.status === 'canceled' && existing.status !== 'canceled')) {
        mergedOverlay.set(key, status);
      }
    }

    // Collect raw records with operator ID for synthetic sailing creation
    for (const raw of extOverlay.rawRecords) {
      allRawRecords.push({ ...raw, operatorId });
    }
  }

  // Count expected cancellations ONLY for THIS corridor (not all operator cancellations)
  // Filter rawRecords to only include cancellations where both ports are in this corridor
  const corridorTerminalIds = new Set([terminals.a.id, terminals.b.id]);
  let totalExpectedCanceled = 0;
  for (const raw of allRawRecords) {
    if (raw.status !== 'canceled') continue;
    const fromSlug = normalizePortSlug(raw.from_port);
    const toSlug = normalizePortSlug(raw.to_port);
    // Both origin AND destination must be in this corridor's terminals
    if (corridorTerminalIds.has(fromSlug) && corridorTerminalIds.has(toSlug)) {
      totalExpectedCanceled++;
    }
  }

  console.log(
    `[CORRIDOR_BOARD] Phase 48.1: Loaded overlay for ${corridorId}, ` +
    `${mergedOverlay.size} statuses, ${totalExpectedCanceled} canceled, ` +
    `${allRawRecords.length} raw records for synthetic creation`
  );

  // Collect all sailings from all routes in this corridor
  const allSailings: TerminalBoardSailing[] = [];
  const allAdvisories: BoardAdvisory[] = [];
  const operatorStatusSources: BoardProvenance['operator_status_sources'] = [];

  let hasAnyLiveSchedule = false;
  let hasAnyStatusOverlay = mergedOverlay.size > 0;

  // Fetch schedules for each route in the corridor (both directions)
  for (const routeId of corridor.route_ids) {
    const scheduleResult = await getTodaySchedule(routeId);

    // Track provenance
    if (scheduleResult.provenance.source_type === 'operator_live') {
      hasAnyLiveSchedule = true;
    }

    // Phase 26: Check for observer cache or operator status page
    const statusSourceType = scheduleResult.statusSource?.source;
    if (
      statusSourceType === 'operator_status_page' ||
      statusSourceType === 'observer_cache'
    ) {
      hasAnyStatusOverlay = true;
    }

    // Determine operator for this route
    const operatorId = getOperatorIdFromRouteId(routeId);

    // Convert sailings to board format (with optional forecast context)
    // Phase 48: Pass merged overlay for force-merge
    const boardSailings = convertSailingsToBoard(
      scheduleResult,
      operatorId,
      routeId,
      weather,
      forecastContext,
      mergedOverlay
    );
    allSailings.push(...boardSailings);

    // Collect advisories (dedupe later)
    if (scheduleResult.advisories) {
      for (const advisory of scheduleResult.advisories) {
        allAdvisories.push({
          title: advisory.title,
          text: advisory.text,
          fetched_at: advisory.fetchedAt,
          operator_id: operatorId,
        });
      }
    }

    // Track status source per operator (only once per operator)
    if (!operatorStatusSources.some((s) => s.operator_id === operatorId)) {
      // Phase 26: Include observer_cache as a valid source
      let statusSource: 'status_page' | 'observer_cache' | 'unavailable' = 'unavailable';
      if (scheduleResult.statusSource?.source === 'operator_status_page') {
        statusSource = 'status_page';
      } else if (scheduleResult.statusSource?.source === 'observer_cache') {
        statusSource = 'observer_cache';
      }

      operatorStatusSources.push({
        operator_id: operatorId,
        source: statusSource,
        fetched_at: scheduleResult.statusSource?.fetchedAt || scheduleResult.provenance.fetched_at,
        url: scheduleResult.statusSource?.url,
      });
    }
  }

  // ============================================================
  // PHASE 48.1: CREATE SYNTHETIC SAILINGS FOR DB-ONLY CANCELLATIONS
  // ============================================================
  // For any DB canceled sailing NOT in schedule, create a synthetic sailing.
  // This ensures the invariant: ALL DB cancellations appear in the UI.

  // Collect keys of all schedule-derived sailings
  const scheduleSailingKeys = new Set<string>();
  for (const sailing of allSailings) {
    const key = generateSailingKey(
      sailing.origin_terminal.id,
      sailing.destination_terminal.id,
      sailing.scheduled_departure_local
    );
    scheduleSailingKeys.add(key);
  }

  // Check which DB canceled sailings are NOT in schedule - create synthetic for those
  const syntheticSailings: TerminalBoardSailing[] = [];
  for (const rawRecord of allRawRecords) {
    // Only create synthetic sailings for cancellations
    if (rawRecord.status !== 'canceled') continue;

    const key = generateSailingKey(rawRecord.from_port, rawRecord.to_port, rawRecord.departure_time);

    // Skip if this sailing exists in schedule (overlay already applied)
    if (scheduleSailingKeys.has(key)) continue;

    // Check if this sailing belongs to this corridor
    const fromSlug = normalizePortSlug(rawRecord.from_port);
    const toSlug = normalizePortSlug(rawRecord.to_port);
    const terminalIds = [terminals.a.id, terminals.b.id];
    if (!terminalIds.includes(fromSlug) && !terminalIds.includes(toSlug)) {
      // This sailing doesn't belong to this corridor
      continue;
    }

    // Create synthetic sailing from DB record
    const syntheticSailing = createSyntheticSailing(
      rawRecord,
      rawRecord.operatorId,
      serviceDateLocal,
      corridor.default_timezone
    );

    if (syntheticSailing) {
      syntheticSailings.push(syntheticSailing);
      console.log(
        `[CORRIDOR_BOARD] Phase 48.1 SYNTHETIC: Created synthetic sailing for DB-only cancellation ` +
        `${rawRecord.from_port} → ${rawRecord.to_port} @ ${rawRecord.departure_time}`
      );
    }
  }

  // Merge synthetic sailings into main list
  if (syntheticSailings.length > 0) {
    allSailings.push(...syntheticSailings);
    console.log(
      `[CORRIDOR_BOARD] Phase 48.1: Added ${syntheticSailings.length} synthetic sailings from DB-only cancellations`
    );
  }

  // Sort sailings by departure time (interleaved, both directions)
  allSailings.sort((a, b) => a.departure_timestamp_ms - b.departure_timestamp_ms);

  // Dedupe advisories by text
  const seenAdvisoryTexts = new Set<string>();
  const uniqueAdvisories = allAdvisories.filter((a) => {
    if (seenAdvisoryTexts.has(a.text)) return false;
    seenAdvisoryTexts.add(a.text);
    return true;
  });

  // Determine overall schedule source
  let scheduleSource: BoardProvenance['schedule_source'];
  if (hasAnyLiveSchedule && !allSailings.some((s) => s.schedule_source === 'template')) {
    scheduleSource = 'operator_live';
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

  // Get status URL
  const operatorStatusUrl = getCorridorStatusUrl(corridorId);

  // ============================================================
  // PHASE 48.1: HARD GUARD - MANDATORY VALIDATION
  // ============================================================
  // This is a BLOCKING guard. If the response has fewer cancellations
  // than the DB overlay, throw a CRITICAL error.
  //
  // INVARIANT: actualCanceledCount >= totalExpectedCanceled
  // If this fails, something is fundamentally broken.

  const actualCanceledCount = allSailings.filter(s => s.operator_status === 'canceled').length;

  if (totalExpectedCanceled > 0 && actualCanceledCount < totalExpectedCanceled) {
    // CRITICAL: We loaded N cancellations from DB but response has fewer
    // This should NEVER happen after Phase 48.1 (synthetic sailing creation)
    const errorMsg =
      `[CORRIDOR_BOARD] CRITICAL PHASE 48.1 GUARD FAILED: ` +
      `corridor=${corridorId} expected=${totalExpectedCanceled} actual=${actualCanceledCount} ` +
      `MISSING ${totalExpectedCanceled - actualCanceledCount} CANCELLATIONS! ` +
      `service_date=${serviceDateLocal}`;

    console.error(errorMsg);

    // Throw error to make this a hard failure
    throw new Error(errorMsg);
  } else if (totalExpectedCanceled > 0) {
    console.log(
      `[CORRIDOR_BOARD] Phase 48.1 guard PASSED: ${actualCanceledCount} cancellations ` +
      `(expected ${totalExpectedCanceled})`
    );
  }

  return {
    corridor,
    terminals,
    service_date_local: serviceDateLocal,
    generated_at_utc: now.toISOString(),
    operators,
    sailings: allSailings,
    advisories: uniqueAdvisories,
    provenance,
    operator_status_url: operatorStatusUrl,
  };
}

// ============================================================
// SAILING CONVERSION
// ============================================================

/**
 * Find the closest forecast hour for a given sailing time
 */
function findForecastForSailing(
  sailingTime: Date,
  forecasts: ForecastHour[]
): ForecastHour | null {
  if (forecasts.length === 0) return null;

  const sailingMs = sailingTime.getTime();
  let closest: ForecastHour | null = null;
  let closestDiff = Infinity;

  for (const forecast of forecasts) {
    const forecastMs = new Date(forecast.forecastTime).getTime();
    const diff = Math.abs(forecastMs - sailingMs);
    // Only use forecasts within 30 minutes of sailing
    if (diff < closestDiff && diff <= 30 * 60 * 1000) {
      closestDiff = diff;
      closest = forecast;
    }
  }

  return closest;
}

/**
 * Convert schedule sailings to corridor board format
 * Phase 32: Enhanced to use Open-Meteo forecasts when available
 * Phase 48: Force-merge Supabase status overlay (cancellations are authoritative)
 */
function convertSailingsToBoard(
  scheduleResult: ScheduleFetchResult,
  operatorId: string,
  routeId: string,
  weather?: WeatherContext | null,
  forecastContext?: ForecastContext | null,
  statusOverlay?: Map<string, PersistedStatus>
): TerminalBoardSailing[] {
  return scheduleResult.sailings.map((sailing) => {
    // Compute forecast risk
    let forecastRisk: ForecastRisk | null = null;
    let predictionResult: PredictionResult | null = null;
    const sailingTime = new Date(sailing.departureTime);

    // Phase 32: Try to use hour-specific forecast if available
    if (forecastContext && forecastContext.forecasts.length > 0) {
      const forecastHour = findForecastForSailing(sailingTime, forecastContext.forecasts);
      if (forecastHour) {
        // Use prediction engine v2 for forecast-based risk
        predictionResult = generatePrediction(
          forecastHour,
          sailing.direction.fromSlug,
          sailing.direction.toSlug,
          sailingTime
        );
        forecastRisk = {
          level: predictionResult.riskLevel as RiskLevel,
          explanation: predictionResult.explanation,
          wind_relation: mapWindRelation(predictionResult.windRelation),
          // Phase 32: Add prediction metadata
          model_version: predictionResult.modelVersion,
          forecast_source: forecastContext.source,
        };
      }
    }

    // Fallback to current weather-based risk if no forecast
    if (!forecastRisk && weather) {
      const risk = computeSailingRisk(sailing, weather, routeId);
      forecastRisk = {
        level: risk.level as RiskLevel,
        explanation: risk.reason ? [risk.reason] : [],
        wind_relation: mapWindRelation(risk.windRelation),
      };
    }

    // ============================================================
    // PHASE 48: FORCE-MERGE SUPABASE STATUS OVERLAY
    // ============================================================
    // This is the CRITICAL fix for the intermittent cancellation bug.
    // Supabase status ALWAYS wins. Period. No conditions.
    //
    // Priority order:
    // 1. Supabase overlay (authoritative, persisted)
    // 2. Schedule sailing status (from SSA scrape, may be stale)
    //
    // INVARIANT: If Supabase says canceled, the sailing IS canceled.

    let operatorStatus = mapSailingStatus(sailing.status);
    let operatorStatusReason: string | null = sailing.statusMessage || null;
    let statusOverlayApplied = sailing.statusFromOperator;
    let operatorStatusSource: 'status_page' | 'supabase_sailing_events' | null = sailing.statusFromOperator ? 'status_page' : null;

    if (statusOverlay && statusOverlay.size > 0) {
      // Generate key for this sailing
      const overlayKey = generateSailingKey(
        sailing.direction.fromSlug,
        sailing.direction.toSlug,
        sailing.departureTimeDisplay
      );

      const persistedStatus = statusOverlay.get(overlayKey);
      if (persistedStatus) {
        // FORCE-MERGE: Supabase status wins unconditionally
        // This is especially critical for cancellations
        operatorStatus = persistedStatus.status;
        operatorStatusReason = persistedStatus.status_reason || operatorStatusReason;
        statusOverlayApplied = true;
        operatorStatusSource = 'supabase_sailing_events';

        // Log force-merge for debugging
        if (persistedStatus.status === 'canceled') {
          console.log(
            `[CORRIDOR_BOARD] Phase 48 FORCE-MERGE: ${sailing.direction.fromSlug} → ${sailing.direction.toSlug} @ ${sailing.departureTimeDisplay} = CANCELED`
          );
        }
      } else if (statusOverlay.size > 0) {
        // Phase 48 debug: Log when key lookup fails for potential mismatches
        // Only log when we have overlay data but couldn't match this sailing
        console.log(
          `[CORRIDOR_BOARD] Phase 48 KEY-MISS: Looking for key="${overlayKey}" (from=${sailing.direction.fromSlug}, to=${sailing.direction.toSlug}, time=${sailing.departureTimeDisplay}), overlay has ${statusOverlay.size} entries`
        );
      }
    }

    // Generate sailing ID
    const sailingId = generateSailingId(
      operatorId,
      sailing.direction.fromSlug,
      sailing.direction.toSlug,
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
      scheduled_arrival_local: null,
      scheduled_arrival_utc: sailing.arrivalTime || null,
      timezone: sailing.timezone,

      // Layer 1: Operator status (Phase 48: now force-merged from Supabase)
      operator_status: operatorStatus,
      operator_status_reason: operatorStatusReason,
      operator_status_source: operatorStatusSource,

      // Layer 2: Forecast risk
      forecast_risk: forecastRisk,

      // Provenance
      schedule_source: scheduleResult.provenance.source_type === 'operator_live'
        ? 'operator_live'
        : 'template',
      status_overlay_applied: statusOverlayApplied,

      vessel_name: sailing.vesselName,
    };
  });
}

/**
 * Map schedule sailing status to board operator status
 */
function mapSailingStatus(status: Sailing['status']): TerminalBoardSailing['operator_status'] {
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
 * Map wind relation from sailing risk to board format
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
      return 'cross';
  }
}

// ============================================================
// PHASE 48.1: SYNTHETIC SAILING CREATION
// ============================================================

/**
 * Port name lookup for synthetic sailings
 */
const PORT_DISPLAY_NAMES: Record<string, string> = {
  'woods-hole': 'Woods Hole',
  'vineyard-haven': 'Vineyard Haven',
  'oak-bluffs': 'Oak Bluffs',
  'hyannis': 'Hyannis',
  'nantucket': 'Nantucket',
};

/**
 * Convert 24-hour time (HH:MM:SS) to 12-hour display format (H:MM AM/PM)
 */
function format24To12Hour(time24: string): string {
  const match = time24.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time24;

  const hour = parseInt(match[1], 10);
  const minute = match[2];

  if (hour === 0) {
    return `12:${minute} AM`;
  } else if (hour < 12) {
    return `${hour}:${minute} AM`;
  } else if (hour === 12) {
    return `12:${minute} PM`;
  } else {
    return `${hour - 12}:${minute} PM`;
  }
}

/**
 * Create a synthetic TerminalBoardSailing from a raw DB record
 *
 * This is used when a canceled sailing exists in Supabase but NOT
 * in the schedule template. We create a synthetic sailing row to
 * ensure the cancellation is displayed in the UI.
 *
 * @param rawRecord - Raw sailing event from Supabase
 * @param operatorId - Operator ID (e.g., 'steamship-authority')
 * @param serviceDate - Service date in YYYY-MM-DD format
 * @param timezone - IANA timezone (e.g., 'America/New_York')
 */
function createSyntheticSailing(
  rawRecord: RawSailingEvent,
  operatorId: string,
  serviceDate: string,
  timezone: string
): TerminalBoardSailing | null {
  try {
    const fromSlug = normalizePortSlug(rawRecord.from_port);
    const toSlug = normalizePortSlug(rawRecord.to_port);
    const fromName = PORT_DISPLAY_NAMES[fromSlug] || rawRecord.from_port;
    const toName = PORT_DISPLAY_NAMES[toSlug] || rawRecord.to_port;

    // Convert 24-hour time to 12-hour display format
    const departureTimeDisplay = format24To12Hour(rawRecord.departure_time);

    // Build departure UTC timestamp
    // Parse the 24-hour time (HH:MM:SS) and combine with service date
    const timeMatch = rawRecord.departure_time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!timeMatch) {
      console.error(`[SYNTHETIC] Invalid time format: ${rawRecord.departure_time}`);
      return null;
    }

    // Create a date in the local timezone
    // Note: This is an approximation - ideally we'd use a proper timezone library
    const departureDate = new Date(`${serviceDate}T${rawRecord.departure_time}`);
    const departureTimestampMs = departureDate.getTime();
    const departureUTC = departureDate.toISOString();

    // Generate sailing ID
    const sailingId = generateSailingId(operatorId, fromSlug, toSlug, departureTimeDisplay);

    // Build the synthetic sailing
    const sailing: TerminalBoardSailing = {
      sailing_id: sailingId,
      operator_id: operatorId,

      origin_terminal: {
        id: fromSlug,
        name: fromName,
      },
      destination_terminal: {
        id: toSlug,
        name: toName,
      },

      scheduled_departure_local: departureTimeDisplay,
      scheduled_departure_utc: departureUTC,
      departure_timestamp_ms: departureTimestampMs,
      scheduled_arrival_local: null,
      scheduled_arrival_utc: null,
      timezone,

      // Layer 1: Operator status - this is ALWAYS canceled for synthetic sailings
      operator_status: 'canceled',
      operator_status_reason: rawRecord.status_reason || rawRecord.status_message || null,
      operator_status_source: 'supabase_sailing_events',

      // Layer 2: No forecast risk for synthetic sailings
      forecast_risk: null,

      // Provenance: Mark as synthetic/DB-derived
      schedule_source: 'template',  // Technically not from template, but closest match
      status_overlay_applied: true,

      // No vessel name for synthetic sailings
      vessel_name: undefined,
    };

    return sailing;
  } catch (err) {
    console.error(`[SYNTHETIC] Error creating synthetic sailing:`, err);
    return null;
  }
}

/**
 * Generate a unique sailing ID
 */
function generateSailingId(
  operatorId: string,
  originSlug: string,
  destSlug: string,
  departureTime: string
): string {
  const timeNormalized = departureTime
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(':', '');

  return `${operatorId}_${originSlug}_${destSlug}_${timeNormalized}`;
}

/**
 * Get operator ID from route ID
 *
 * Route IDs follow pattern: origin-dest-operator (e.g., "wh-vh-ssa")
 */
function getOperatorIdFromRouteId(routeId: string): string {
  if (routeId.endsWith('-ssa')) {
    return 'steamship-authority';
  }
  if (routeId.endsWith('-hlc')) {
    return 'hy-line-cruises';
  }
  // Default fallback
  return 'unknown';
}

// ============================================================
// HELPER EXPORTS
// ============================================================

export {
  getCorridorById,
  getCorridorTerminals,
  getCorridorsForTerminal,
  getCorridorSummariesForTerminal,
} from '@/lib/config/corridors';
