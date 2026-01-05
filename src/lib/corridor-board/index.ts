/**
 * Corridor Board Service
 *
 * Phase 21: Service Corridor Architecture
 * Phase 32: Enhanced with Open-Meteo forecast predictions
 * Phase 73: HARD SEPARATION OF OPERATOR TRUTH VS TEMPLATES
 *
 * Produces DailyCorridorBoard - all sailings in both directions for a corridor,
 * interleaved and ordered by time, across all operators.
 *
 * THREE-LAYER TRUTH MODEL:
 * - Layer 0: Schedule (template) - defines which sailings exist (BOTH directions)
 * - Layer 1: Operator Status - sparse overlay, updates matching sailings
 * - Layer 2: Forecast Risk - interpretive, never predicts cancellation
 *
 * ============================================================
 * PHASE 73: TODAY DATA AUTHORITY RULES (IMMUTABLE)
 * ============================================================
 *
 * CORE PRINCIPLE: IF operator_sailings.length > 0: templates MUST be excluded from Today
 *
 * When operator data is available (operator_live, operator_scraped):
 * - Templates are EXCLUDED from Today's board
 * - Only operator-sourced sailings participate
 * - Cancellation overlay applies ONLY to operator sailings
 * - generateSailingKey is ONLY called on operator sailings
 *
 * When operator data is unavailable:
 * - Templates ARE used as fallback
 * - Cancellation overlay does NOT apply (no key matching on templates)
 * - Today shows template schedule with "schedule_source: template"
 *
 * NEVER mix templates and operator data for Today's board.
 * ============================================================
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
import type { Sailing, ScheduleFetchResult, ScheduleSourceType } from '@/lib/schedules/types';
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
  const corridorCancellations: string[] = [];
  const otherCancellations: string[] = [];

  for (const raw of allRawRecords) {
    if (raw.status !== 'canceled') continue;
    const fromSlug = normalizePortSlug(raw.from_port);
    const toSlug = normalizePortSlug(raw.to_port);
    const desc = `${raw.from_port}->${raw.to_port}@${raw.departure_time} (slugs: ${fromSlug}->${toSlug})`;

    // Both origin AND destination must be in this corridor's terminals
    if (corridorTerminalIds.has(fromSlug) && corridorTerminalIds.has(toSlug)) {
      totalExpectedCanceled++;
      corridorCancellations.push(desc);
    } else {
      otherCancellations.push(desc);
    }
  }

  console.log(
    `[CORRIDOR_BOARD] Phase 48.1: Loaded overlay for ${corridorId}, ` +
    `${mergedOverlay.size} statuses, ${totalExpectedCanceled} canceled (of ${allRawRecords.filter(r => r.status === 'canceled').length} total), ` +
    `${allRawRecords.length} raw records. ` +
    `Corridor terminals: [${Array.from(corridorTerminalIds).join(', ')}]. ` +
    `Corridor cancellations: [${corridorCancellations.join('; ')}]. ` +
    `Other cancellations filtered out: [${otherCancellations.join('; ')}]`
  );

  // Collect all sailings from all routes in this corridor
  const allSailings: TerminalBoardSailing[] = [];
  const allAdvisories: BoardAdvisory[] = [];
  const operatorStatusSources: BoardProvenance['operator_status_sources'] = [];

  let hasAnyLiveSchedule = false;
  let hasAnyStatusOverlay = mergedOverlay.size > 0;

  // ============================================================
  // PHASE 71 FIX: FETCH ALL ROUTES IN PARALLEL
  // ============================================================
  // Previously, routes were fetched sequentially with `await` inside a loop.
  // This caused rate limiting to block the second route on cold start:
  // - First route (wh-vh-ssa) would fetch successfully
  // - Second route (vh-wh-ssa) would be rate-limited (same operator)
  // - Only one direction's sailings would appear
  //
  // Fix: Fetch all routes in parallel using Promise.all().
  // This ensures both directions are fetched in the same timestamp window,
  // and the in-flight request coalescing in schedules/index.ts will handle
  // any actual duplicate requests properly.

  const scheduleResults = await Promise.all(
    corridor.route_ids.map((routeId) => getTodaySchedule(routeId))
  );

  // ============================================================
  // PHASE 73: TODAY DATA AUTHORITY DECISION
  // ============================================================
  // CORE PRINCIPLE: IF operator_sailings.length > 0: templates MUST be excluded
  //
  // Step 1: Categorize all sailings by source type
  // Step 2: Determine today_authority based on operator data presence
  // Step 3: Apply hard exclusion of templates when operator data exists

  // First pass: collect all sailings and categorize by source
  const operatorSailings: Array<{ sailing: TerminalBoardSailing; routeId: string; operatorId: string }> = [];
  const templateSailings: Array<{ sailing: TerminalBoardSailing; routeId: string; operatorId: string }> = [];

  // Process all schedule results
  for (let i = 0; i < corridor.route_ids.length; i++) {
    const routeId = corridor.route_ids[i];
    const scheduleResult = scheduleResults[i];

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

    // Convert sailings to board format
    // PHASE 73: Do NOT pass overlay yet - we'll apply it after authority decision
    const boardSailings = convertSailingsToBoard(
      scheduleResult,
      operatorId,
      routeId,
      weather,
      forecastContext,
      undefined // NO overlay at this stage - Phase 73 will apply it selectively
    );

    // Categorize each sailing by its schedule_source
    for (const sailing of boardSailings) {
      const isOperatorData = sailing.schedule_source === 'operator_live' ||
                             sailing.schedule_source === 'operator_scraped';

      if (isOperatorData) {
        operatorSailings.push({ sailing, routeId, operatorId });
      } else {
        templateSailings.push({ sailing, routeId, operatorId });
      }
    }

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
  // PHASE 73: ENFORCE TODAY DATA AUTHORITY
  // ============================================================
  // IMMUTABLE RULE: If we have ANY operator sailings, templates are EXCLUDED
  const hasOperatorData = operatorSailings.length > 0;
  const todayAuthority: 'operator_only' | 'template_only' = hasOperatorData ? 'operator_only' : 'template_only';
  let templateExcludedReason: string | null = null;

  if (hasOperatorData) {
    // HARD EXCLUSION: Templates are not used for Today when operator data exists
    templateExcludedReason = `Operator data available (${operatorSailings.length} sailings)`;

    // Phase 73 logging
    console.log(
      `[CORRIDOR_BOARD] Phase 73: today_authority=operator_only, ` +
      `operator_sailings=${operatorSailings.length}, template_sailings_excluded=${templateSailings.length}`
    );

    // Add ONLY operator sailings to allSailings
    // Apply overlay ONLY to operator sailings
    for (const { sailing } of operatorSailings) {
      const sailingWithOverlay = applyStatusOverlayToSailing(sailing, mergedOverlay);
      allSailings.push(sailingWithOverlay);
    }

    // PHASE 73 DEV ASSERTION: Templates must NOT appear in Today when operator data exists
    if (process.env.NODE_ENV === 'development') {
      const templateInOutput = allSailings.some(s =>
        s.schedule_source === 'template' || s.schedule_source === 'forecast_template'
      );
      if (templateInOutput) {
        throw new Error(
          `[CORRIDOR_BOARD] PHASE 73 VIOLATION: Template sailing found in Today's board ` +
          `when operator data exists. today_authority=${todayAuthority}, ` +
          `operator_count=${operatorSailings.length}, corridor=${corridorId}`
        );
      }
    }
  } else {
    // Template fallback: No operator data available
    console.log(
      `[CORRIDOR_BOARD] Phase 73: today_authority=template_only, ` +
      `template_sailings=${templateSailings.length}, operator_sailings=0`
    );

    // Add template sailings WITHOUT overlay (Phase 73: templates don't get DB status)
    for (const { sailing } of templateSailings) {
      // DO NOT apply overlay to templates - they don't participate in key matching
      allSailings.push(sailing);
    }
  }

  // ============================================================
  // PHASE 73: HELPER - Apply status overlay to a single sailing
  // ============================================================
  function applyStatusOverlayToSailing(
    sailing: TerminalBoardSailing,
    statusOverlay: Map<string, PersistedStatus>
  ): TerminalBoardSailing {
    if (!statusOverlay || statusOverlay.size === 0) {
      return sailing;
    }

    // Generate key for this sailing
    const overlayKey = generateSailingKey(
      sailing.origin_terminal.id,
      sailing.destination_terminal.id,
      sailing.scheduled_departure_local
    );

    const persistedStatus = statusOverlay.get(overlayKey);
    if (!persistedStatus) {
      // No match in overlay - return unchanged
      return sailing;
    }

    // FORCE-MERGE: Supabase status wins unconditionally
    // This is especially critical for cancellations
    if (persistedStatus.status === 'canceled') {
      console.log(
        `[CORRIDOR_BOARD] Phase 73 OVERLAY: ${sailing.origin_terminal.id} → ${sailing.destination_terminal.id} @ ${sailing.scheduled_departure_local} = CANCELED`
      );
    }

    return {
      ...sailing,
      operator_status: persistedStatus.status,
      operator_status_reason: persistedStatus.status_reason || sailing.operator_status_reason,
      status_overlay_applied: true,
      operator_status_source: 'supabase_sailing_events',
    };
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
    // Phase 73: Hard separation of operator truth vs templates
    today_authority: todayAuthority,
    template_excluded_reason: templateExcludedReason,
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

  // ============================================================
  // PHASE 68: OPERATOR-OBSERVED SEASONALITY
  // ============================================================
  // Derive service_state from sailings count. This is the SOLE SOURCE OF TRUTH.
  // - active: operator publishes at least one sailing
  // - seasonal_inactive: operator publishes zero sailings
  //
  // FORBIDDEN: Hard-coded dates, is_seasonal flags, calendar-based activation
  const serviceState = allSailings.length >= 1 ? 'active' : 'seasonal_inactive';

  // Phase 68: Console logging for seasonality state
  console.log(
    `[SEASONALITY] corridor=${corridorId}, sailing_count=${allSailings.length}, service_state=${serviceState}`
  );

  return {
    corridor,
    terminals,
    service_date_local: serviceDateLocal,
    generated_at_utc: now.toISOString(),
    operators,
    service_state: serviceState,
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
      // Phase 60: Use sailing's scheduleSource if available, fallback to provenance
      schedule_source: (sailing.scheduleSource ||
        (scheduleResult.provenance.source_type === 'operator_live' ? 'operator_live' : 'template')) as ScheduleSourceType,
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

      // Provenance: Phase 60 - Mark as operator_scraped since it came from DB
      // (ingested from operator scraping, not template)
      schedule_source: 'operator_scraped',
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
