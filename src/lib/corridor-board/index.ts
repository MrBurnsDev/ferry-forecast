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
import {
  loadAuthoritativeStatusOverlay,
  generateSailingKey,
  countCanceledInOverlay,
  type PersistedStatus,
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
  // PHASE 48: LOAD AUTHORITATIVE STATUS OVERLAY FROM SUPABASE
  // ============================================================
  // This is the SINGLE SOURCE OF TRUTH for sailing status.
  // Cancellations in this overlay MUST appear in the final response.
  // Load BEFORE schedule to ensure we can force-merge.

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

  // Load overlay for all operators in this corridor
  const statusOverlays: Map<string, PersistedStatus>[] = [];
  for (const operatorId of operatorIds) {
    const overlay = await loadAuthoritativeStatusOverlay(operatorId, serviceDateLocal);
    if (overlay.size > 0) {
      statusOverlays.push(overlay);
    }
  }

  // Merge all overlays into one (cancellations are sticky)
  const mergedOverlay = new Map<string, PersistedStatus>();
  for (const overlay of statusOverlays) {
    for (const [key, status] of overlay) {
      const existing = mergedOverlay.get(key);
      if (!existing || (status.status === 'canceled' && existing.status !== 'canceled')) {
        mergedOverlay.set(key, status);
      }
    }
  }

  // Count expected cancellations for regression guard
  const expectedCanceledCount = countCanceledInOverlay(mergedOverlay);
  console.log(
    `[CORRIDOR_BOARD] Phase 48: Loaded overlay for ${corridorId}, ` +
    `${mergedOverlay.size} statuses, ${expectedCanceledCount} canceled`
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
  // PHASE 48: REGRESSION GUARD - MANDATORY CHECK
  // ============================================================
  // This MUST run before every response.
  // If response has fewer cancellations than overlay, log CRITICAL.
  // This guard is non-blocking (monitoring only) but essential for detecting regressions.

  const actualCanceledCount = allSailings.filter(s => s.operator_status === 'canceled').length;

  if (expectedCanceledCount > 0 && actualCanceledCount < expectedCanceledCount) {
    // CRITICAL REGRESSION: We loaded N cancellations from Supabase but the response has fewer
    console.error(
      `[CORRIDOR_BOARD] PHASE 48 REGRESSION GUARD FAILED: ` +
      `corridor=${corridorId} expected=${expectedCanceledCount} actual=${actualCanceledCount} ` +
      `MISSING ${expectedCanceledCount - actualCanceledCount} CANCELLATIONS! ` +
      `service_date=${serviceDateLocal}`
    );
  } else if (expectedCanceledCount > 0) {
    console.log(
      `[CORRIDOR_BOARD] Phase 48 guard PASSED: ${actualCanceledCount} cancellations ` +
      `(expected ${expectedCanceledCount})`
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
