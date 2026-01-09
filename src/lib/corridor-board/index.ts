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
 * When operator data is available (operator_snapshot, operator_status):
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

import type { DailyCorridorBoard, CorridorServiceState } from '@/types/corridor';
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
import { getTodayInTimezone, parseTimeInTimezone } from '@/lib/schedules/time';
import {
  computeSailingRisk,
  type WeatherContext,
} from '@/lib/scoring/sailing-risk';
import { type ForecastHour } from '@/lib/weather/open-meteo';
import { generatePrediction, type PredictionResult } from '@/lib/scoring/prediction-engine-v2';
// Phase 48: Canonical overlay loader
// Phase 48.1: Extended loader for full union (synthetic sailings)
// Phase 77: Operator schedule authority check
// Phase 78: Load operator base schedule directly from DB
import {
  loadExtendedStatusOverlay,
  generateSailingKey,
  normalizePortSlug,
  hasOperatorSchedule,
  loadOperatorSchedule,
  type PersistedStatus,
  type ExtendedStatusOverlay,
  type RawSailingEvent,
  type OperatorScheduleCheck,
  type OperatorScheduleResult,
  type OperatorScheduleSailing,
} from '@/lib/events/sailing-events';
// Phase 81: Likelihood prediction
import {
  computeSimplifiedLikelihood,
  operatorHasLiveStatus,
} from '@/lib/likelihood';
// Phase 81.3: Per-sailing forecast predictions
import { getCorridorForecast, type ForecastPrediction } from '@/lib/forecasts';

// ============================================================
// CORRIDOR BOARD GENERATION
// ============================================================

/**
 * Options for corridor board generation
 * @deprecated Phase 81.3: Forecasts are now always fetched. Keeping interface for backward compatibility.
 */
export interface CorridorBoardOptions {
  /** @deprecated Forecasts are now always fetched */
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
 * Phase 81.3: Today's predictions context for per-sailing weather
 * Maps departure_time_local -> prediction
 */
interface TodayPredictionsContext {
  predictions: Map<string, ForecastPrediction>;
  source: 'database' | 'heuristic_baseline';
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
  weather?: WeatherContext | null
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

  // ============================================================
  // PHASE 80: SERVICE DATE DRIFT GUARDRAIL
  // ============================================================
  // Log when UTC date differs from local date (evening hours EST).
  // This helps diagnose any timezone-related query issues.
  // If queries are returning 0 rows, check this log first.
  const utcDate = now.toISOString().slice(0, 10);
  if (utcDate !== serviceDateLocal) {
    console.log(
      `[PHASE80] Date drift detected: UTC=${utcDate} LOCAL=${serviceDateLocal} tz=${corridor.default_timezone}. ` +
      `Queries use LOCAL date (correct). This is normal after 7 PM EST.`
    );
  }

  // Phase 81.3: Load today's predictions from prediction_snapshots_v2
  // This provides per-sailing weather forecasts with unique wind data for each sailing time.
  // Uses the same data source as 7-day/14-day forecasts for consistency.
  let todayPredictions: TodayPredictionsContext | null = null;
  try {
    const forecast = await getCorridorForecast(corridorId, '7_day');
    if (forecast && forecast.days.length > 0) {
      // Find today's predictions
      const todayData = forecast.days.find(d => d.service_date === serviceDateLocal);
      if (todayData && todayData.predictions.length > 0) {
        // Build map from minutes-since-midnight -> prediction for flexible matching
        // Predictions have times like "07:00", DB sailings have "7:00 AM"
        const predictionsMap = new Map<string, ForecastPrediction>();
        for (const pred of todayData.predictions) {
          // Store by minutes-since-midnight for accurate matching
          const minutesKey = timeToMinutes(pred.departure_time_local);
          if (minutesKey !== null) {
            predictionsMap.set(String(minutesKey), pred);
          }
        }
        todayPredictions = {
          predictions: predictionsMap,
          source: forecast.source || 'database',
        };
        console.log(
          `[CORRIDOR_BOARD] Phase 81.3: Loaded ${predictionsMap.size} today predictions for ${corridorId} ` +
          `(source: ${todayPredictions.source})`
        );
      }
    }
  } catch (error) {
    console.warn(`[CORRIDOR_BOARD] Phase 81.3: Predictions fetch failed for ${corridorId}:`, error);
    // Continue without predictions - will fall back to current weather
  }

  // Legacy: Keep forecastContext for template path (convertSailingsToBoard)
  const forecastContext: ForecastContext | null = null;

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
  // PHASE 76 FIX: Store overlay WITH operatorId to avoid index misalignment
  const extendedOverlaysWithOperator: Array<{ operatorId: string; overlay: ExtendedStatusOverlay }> = [];
  for (const operatorId of operatorIds) {
    const extOverlay = await loadExtendedStatusOverlay(operatorId, serviceDateLocal);
    // DEBUG: Log what we got from each operator overlay
    console.log(
      `[CORRIDOR_BOARD] Loaded overlay for operator ${operatorId}: ` +
      `statusMap.size=${extOverlay.statusMap.size}, ` +
      `rawRecords.length=${extOverlay.rawRecords.length}, ` +
      `canceledCount=${extOverlay.canceledCount}`
    );
    if (extOverlay.rawRecords.length > 0) {
      console.log(
        `[CORRIDOR_BOARD] Raw records from ${operatorId}: ` +
        `[${extOverlay.rawRecords.map(r => `${r.from_port}->${r.to_port}@${r.departure_time}:${r.status}`).join('; ')}]`
      );
    }
    // PHASE 76 FIX: Always push overlay with its operatorId, even if statusMap is empty
    // This ensures rawRecords (for synthetic sailings) are never lost
    if (extOverlay.statusMap.size > 0 || extOverlay.rawRecords.length > 0) {
      extendedOverlaysWithOperator.push({ operatorId, overlay: extOverlay });
    }
  }

  // Merge all overlays into one (cancellations are sticky)
  const mergedOverlay = new Map<string, PersistedStatus>();
  const allRawRecords: Array<RawSailingEvent & { operatorId: string }> = [];

  // PHASE 76 FIX: Iterate with correct operatorId association (no index misalignment)
  for (const { operatorId, overlay: extOverlay } of extendedOverlaysWithOperator) {
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
  // PHASE 78: OPERATOR SCHEDULE BASE LAYER (BEFORE TEMPLATES)
  // ============================================================
  //
  // ARCHITECTURAL RULE:
  // IF operator has sailing_events in DB for today → USE ONLY DB ROWS
  // Templates are NEVER mixed with operator data.
  //
  // This is checked FIRST, BEFORE any getTodaySchedule() calls.
  // When operator schedule exists, we skip the template path entirely.
  //
  // Load operator schedules for all operators in this corridor
  const operatorScheduleResults = new Map<string, OperatorScheduleResult>();
  for (const operatorId of operatorIds) {
    const scheduleResult = await loadOperatorSchedule(operatorId, serviceDateLocal, corridorId);
    operatorScheduleResults.set(operatorId, scheduleResult);

    console.log(
      `[PHASE78] Operator schedule check: operator=${operatorId} corridor=${corridorId} ` +
      `hasSchedule=${scheduleResult.hasSchedule} sailingCount=${scheduleResult.sailingCount}`
    );
  }

  // Check if ANY operator has DB-sourced schedule
  const anyOperatorHasDBSchedule = Array.from(operatorScheduleResults.values()).some(r => r.hasSchedule);
  const totalDBSailings = Array.from(operatorScheduleResults.values()).reduce((sum, r) => sum + r.sailingCount, 0);

  if (anyOperatorHasDBSchedule) {
    console.log(
      `[PHASE78] OPERATOR SCHEDULE AUTHORITY: Using DB-sourced schedule for corridor=${corridorId}. ` +
      `Total DB sailings=${totalDBSailings}. Templates will NOT be used.`
    );

    // Build board directly from DB sailings
    for (const [dbOperatorId, scheduleResult] of operatorScheduleResults) {
      if (!scheduleResult.hasSchedule) continue;

      // Map DB operator ID to display format
      const displayOperatorId = dbOperatorId === 'ssa' ? 'steamship-authority' : dbOperatorId;

      for (const dbSailing of scheduleResult.sailings) {
        const boardSailing = createBoardSailingFromDB(
          dbSailing,
          displayOperatorId,
          serviceDateLocal,
          corridor.default_timezone,
          todayPredictions,  // Phase 81.3: Pass today's predictions for per-sailing weather
          weather            // Phase 81.3: Pass current weather as fallback
        );

        if (boardSailing) {
          allSailings.push(boardSailing);
        }
      }

      // PHASE 80.2: Track status source as supabase (NOT observer_cache)
      // When using DB-sourced schedule, the source is the database itself
      operatorStatusSources.push({
        operator_id: displayOperatorId,
        source: 'supabase_sailing_events', // PHASE 80.2: DB is the source
        fetched_at: new Date().toISOString(),
        url: undefined,
      });
    }

    hasAnyLiveSchedule = true; // DB data is live operator data

    // Sort sailings by departure time
    allSailings.sort((a, b) => a.departure_timestamp_ms - b.departure_timestamp_ms);

    // ============================================================
    // PHASE 81: COMPUTE LIKELIHOOD FOR EACH SAILING
    // ============================================================
    const operatorsWithLiveStatus: string[] = [];
    const operatorsUsingCrossOperator: string[] = [];

    for (const sailing of allSailings) {
      // Convert WeatherContext to WeatherConditions for likelihood computation
      const weatherForLikelihood = weather ? {
        wind_speed_mph: weather.windSpeed,
        wind_direction_degrees: weather.windDirection,
        has_advisory: !!weather.advisoryLevel,
      } : null;

      // Compute simplified likelihood based on weather
      const likelihoodResult = computeSimplifiedLikelihood(weatherForLikelihood, sailing.operator_id);

      sailing.likelihood_to_run_pct = likelihoodResult.likelihood_to_run_pct;
      sailing.likelihood_confidence = likelihoodResult.likelihood_confidence;
      sailing.likelihood_basis = likelihoodResult.likelihood_basis;
      sailing.likelihood_sample_size = likelihoodResult.sample_size;

      // Track which operators have live status
      if (operatorHasLiveStatus(sailing.operator_id)) {
        if (!operatorsWithLiveStatus.includes(sailing.operator_id)) {
          operatorsWithLiveStatus.push(sailing.operator_id);
        }
      } else {
        if (!operatorsUsingCrossOperator.includes(sailing.operator_id)) {
          operatorsUsingCrossOperator.push(sailing.operator_id);
        }
      }
    }

    // Phase 78: Skip the template-based flow and return early
    // Determine service state based on sailing count (Phase 68 rule)
    const serviceState: CorridorServiceState = allSailings.length > 0 ? 'active' : 'seasonal_inactive';

    const board: DailyCorridorBoard = {
      corridor,
      terminals: {
        a: terminals.a,
        b: terminals.b,
      },
      service_date_local: serviceDateLocal,
      generated_at_utc: new Date().toISOString(),
      operators: operators.map((op) => ({
        id: op.id,
        name: op.name,
        status_url: op.status_url || '',
      })),
      service_state: serviceState,
      sailings: allSailings,
      advisories: allAdvisories,
      provenance: {
        generated_at: new Date().toISOString(),
        schedule_source: 'operator_snapshot',  // Phase 78.1: Canonical value
        status_overlay_available: true,
        operator_status_sources: operatorStatusSources,
        today_authority: 'operator_only',
        // Phase 81: Track which operators have live status
        operators_with_live_status: operatorsWithLiveStatus,
        operators_using_cross_operator_model: operatorsUsingCrossOperator,
        debug: {
          phase78_operator_schedule: true,
          operator_sailing_count: totalDBSailings,
          template_sailing_count: 0,
          templates_included: false,
          base_schedule_source: 'operator',
        },
      },
    };

    // Count canceled for guard
    const canceledCount = allSailings.filter(s => s.operator_status === 'canceled').length;
    console.log(
      `[PHASE78] Returning operator-only board: corridor=${corridorId} ` +
      `sailings=${allSailings.length} canceled=${canceledCount}`
    );

    // PHASE 80.4: Provenance invariant - MUST never be null
    if (!board.provenance) {
      throw new Error(`[PHASE80.4] Provenance missing in DB path – invalid corridor response for ${corridorId}`);
    }

    return board;
  }

  // ============================================================
  // NO OPERATOR SCHEDULE - Fall back to templates
  // ============================================================
  console.log(
    `[PHASE78] No operator schedule in DB for corridor=${corridorId}. ` +
    `Falling back to templates via getTodaySchedule().`
  );

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

    // Track provenance (Phase 80.3: canonical value)
    if (scheduleResult.provenance.source_type === 'operator_status') {
      hasAnyLiveSchedule = true;
    }

    // Phase 26/80.3: Check for operator status sources
    const statusSourceType = scheduleResult.statusSource?.source;
    if (statusSourceType === 'operator_status_page') {
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
    // PHASE 80.3: Only canonical operator values (snapshot, status)
    for (const sailing of boardSailings) {
      const isOperatorData = sailing.schedule_source === 'operator_snapshot' ||
                             sailing.schedule_source === 'operator_status';

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
    // Phase 80.3: Only 'status_page' or 'unavailable' for legacy path
    if (!operatorStatusSources.some((s) => s.operator_id === operatorId)) {
      const statusSource: 'status_page' | 'unavailable' =
        scheduleResult.statusSource?.source === 'operator_status_page' ? 'status_page' : 'unavailable';

      operatorStatusSources.push({
        operator_id: operatorId,
        source: statusSource,
        fetched_at: scheduleResult.statusSource?.fetchedAt || scheduleResult.provenance.fetched_at,
        url: scheduleResult.statusSource?.url,
      });
    }
  }

  // ============================================================
  // PHASE 77: OPERATOR SCHEDULE AUTHORITY LOCK
  // ============================================================
  //
  // ARCHITECTURAL LAW (IMMUTABLE):
  // Today views must be EITHER 100% operator-driven OR 100% template-driven.
  // NO MIXING. Templates are ONLY a fallback when NO operator data exists.
  //
  // CORE PRINCIPLE:
  // IF hasOperatorSchedule() === true → templates MUST NOT be used
  // IF hasOperatorSchedule() === false → templates ARE the schedule
  //
  // This fixes Phase 75's mistake of mixing templates with operator data,
  // which caused phantom sailings and schedule mismatches.

  // PHASE 77: Check operator schedule authority for each operator
  const operatorScheduleChecks = new Map<string, OperatorScheduleCheck>();
  for (const operatorId of operatorIds) {
    // Normalize operator ID for the database lookup
    const dbOperatorId = operatorId === 'ssa' ? 'ssa' : operatorId;
    const scheduleCheck = await hasOperatorSchedule(dbOperatorId, corridorId, serviceDateLocal);
    operatorScheduleChecks.set(operatorId, scheduleCheck);
  }

  // Determine if ANY operator has schedule data
  const anyOperatorHasSchedule = Array.from(operatorScheduleChecks.values()).some(check => check.hasSchedule);

  // PHASE 77: Determine today_authority based on operator schedule existence
  const todayAuthority: 'operator_only' | 'template_only' = anyOperatorHasSchedule ? 'operator_only' : 'template_only';
  let templateExcludedReason: string | null = null;
  let scheduleAuthorityAudit: {
    operator_checks: Array<{ operator_id: string; has_schedule: boolean; sailing_count: number; distinct_times: string[] }>;
    today_authority: 'operator_only' | 'template_only';
    operator_sailing_count: number;
    template_sailing_count: number;
    templates_included: boolean;
    base_schedule_source: 'operator' | 'template';
  } | null = null;

  // Build audit info with Phase 77 Part D enhanced debug output
  scheduleAuthorityAudit = {
    operator_checks: Array.from(operatorScheduleChecks.entries()).map(([opId, check]) => ({
      operator_id: opId,
      has_schedule: check.hasSchedule,
      sailing_count: check.sailingCount,
      distinct_times: check.distinctTimes, // Phase 77 Part D: Include distinct times for debugging
    })),
    today_authority: todayAuthority,
    operator_sailing_count: operatorSailings.length,
    template_sailing_count: templateSailings.length,
    templates_included: !anyOperatorHasSchedule,
    base_schedule_source: anyOperatorHasSchedule ? 'operator' : 'template', // Phase 77 Part D: Explicit source
  };

  console.log(
    `[PHASE77] Schedule authority check: corridor=${corridorId} today_authority=${todayAuthority} ` +
    `operator_has_schedule=${anyOperatorHasSchedule} operator_sailings=${operatorSailings.length} ` +
    `template_sailings=${templateSailings.length}`
  );

  // ============================================================
  // PHASE 77: SCHEDULE CONSTRUCTION - OPERATOR-ONLY OR TEMPLATE-ONLY
  // ============================================================

  if (todayAuthority === 'operator_only') {
    // ============================================================
    // OPERATOR AUTHORITY: Use ONLY operator-sourced sailings
    // Templates are EXCLUDED - no gap-filling, no fallback
    // ============================================================

    // PHASE 77 GUARD: Log warning if operator data seems incomplete
    // (but still use operator-only - this is just diagnostic)
    if (operatorSailings.length < templateSailings.length) {
      const missingCount = templateSailings.length - operatorSailings.length;
      console.warn(
        `[PHASE77] Operator schedule appears incomplete: corridor=${corridorId} ` +
        `operator=${operatorSailings.length} template=${templateSailings.length} ` +
        `missing=${missingCount}. Using operator-only per Phase 77 rules.`
      );
    }

    // Add operator sailings with status overlay
    for (const { sailing } of operatorSailings) {
      const sailingWithOverlay = applyStatusOverlayToSailing(sailing, mergedOverlay);
      allSailings.push(sailingWithOverlay);
    }

    templateExcludedReason = `Phase 77: Operator schedule exists (${operatorSailings.length} sailings from DB). Templates excluded.`;

    console.log(
      `[PHASE77] Operator authority: corridor=${corridorId} ` +
      `operator_sailings=${operatorSailings.length} templates_excluded=true`
    );

  } else {
    // ============================================================
    // TEMPLATE AUTHORITY: No operator data exists, use templates
    // ============================================================

    // Add template sailings WITHOUT overlay (no operator data to apply)
    for (const { sailing } of templateSailings) {
      allSailings.push(sailing);
    }

    templateExcludedReason = null; // Templates are used, not excluded

    console.log(
      `[PHASE77] Template authority: corridor=${corridorId} ` +
      `template_sailings=${templateSailings.length} operator_schedule=none`
    );
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

  // DEBUG: Log all schedule keys for debugging
  console.log(
    `[CORRIDOR_BOARD] Phase 48.1 DEBUG: Schedule has ${scheduleSailingKeys.size} sailing keys. ` +
    `Sample keys: ${Array.from(scheduleSailingKeys).slice(0, 5).join(', ')}`
  );

  // Check which DB canceled sailings are NOT in schedule - create synthetic for those
  const syntheticSailings: TerminalBoardSailing[] = [];
  const skippedInSchedule: string[] = [];
  const skippedNotInCorridor: string[] = [];
  const failedToCreate: string[] = [];

  for (const rawRecord of allRawRecords) {
    // Only create synthetic sailings for cancellations
    if (rawRecord.status !== 'canceled') continue;

    const key = generateSailingKey(rawRecord.from_port, rawRecord.to_port, rawRecord.departure_time);
    const recordDesc = `${rawRecord.from_port} → ${rawRecord.to_port} @ ${rawRecord.departure_time} (key: ${key})`;

    // Skip if this sailing exists in schedule (overlay already applied)
    if (scheduleSailingKeys.has(key)) {
      skippedInSchedule.push(recordDesc);
      continue;
    }

    // Check if this sailing belongs to this corridor
    const fromSlug = normalizePortSlug(rawRecord.from_port);
    const toSlug = normalizePortSlug(rawRecord.to_port);
    const terminalIds = [terminals.a.id, terminals.b.id];
    if (!terminalIds.includes(fromSlug) && !terminalIds.includes(toSlug)) {
      // This sailing doesn't belong to this corridor
      skippedNotInCorridor.push(`${recordDesc} (slugs: ${fromSlug}, ${toSlug} not in [${terminalIds.join(', ')}])`);
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
    } else {
      failedToCreate.push(recordDesc);
    }
  }

  // DEBUG: Log detailed breakdown of all cancellation processing
  console.log(
    `[CORRIDOR_BOARD] Phase 48.1 DEBUG: Processing ${allRawRecords.filter(r => r.status === 'canceled').length} canceled records. ` +
    `Skipped (in schedule): ${skippedInSchedule.length}, ` +
    `Skipped (not in corridor): ${skippedNotInCorridor.length}, ` +
    `Failed to create: ${failedToCreate.length}, ` +
    `Created synthetic: ${syntheticSailings.length}`
  );

  if (skippedInSchedule.length > 0) {
    console.log(`[CORRIDOR_BOARD] Phase 48.1 DEBUG: Cancellations matched to schedule (overlay applied): [${skippedInSchedule.join('; ')}]`);
  }
  if (skippedNotInCorridor.length > 0) {
    console.log(`[CORRIDOR_BOARD] Phase 48.1 DEBUG: Cancellations skipped (not in corridor): [${skippedNotInCorridor.join('; ')}]`);
  }
  if (failedToCreate.length > 0) {
    console.log(`[CORRIDOR_BOARD] Phase 48.1 DEBUG: Cancellations failed to create synthetic: [${failedToCreate.join('; ')}]`);
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

  // ============================================================
  // PHASE 77 PART C: HARD RUNTIME GUARD - SCHEDULE AUTHORITY VIOLATION
  // ============================================================
  // ARCHITECTURAL LAW: If todayAuthority === 'operator_only', there MUST be
  // ZERO sailings with schedule_source === 'template'.
  // If this guard fires, it means templates leaked into an operator-authority schedule.
  // This is a CRITICAL architectural violation.

  if (todayAuthority === 'operator_only') {
    const templateSailingsInResponse = allSailings.filter(
      (s) => s.schedule_source === 'template' || s.schedule_source === 'forecast_template'
    );

    if (templateSailingsInResponse.length > 0) {
      // CRITICAL VIOLATION: Templates found in operator-authority schedule
      const templateTimes = templateSailingsInResponse
        .map((s) => `${s.scheduled_departure_local} (${s.origin_terminal.id}→${s.destination_terminal.id})`)
        .slice(0, 5)
        .join(', ');

      const errorMsg =
        `[SCHEDULE AUTHORITY VIOLATION] corridor=${corridorId} ` +
        `found ${templateSailingsInResponse.length} templates with operator data! ` +
        `today_authority=operator but templates present. ` +
        `Sample times: ${templateTimes}. ` +
        `service_date=${serviceDateLocal}`;

      console.error(errorMsg);

      // In development, throw to make this a hard failure
      // In production, log but continue (fail-safe)
      if (process.env.NODE_ENV === 'development') {
        throw new Error(errorMsg);
      }
    } else {
      console.log(
        `[PHASE77] Schedule authority guard PASSED: corridor=${corridorId} ` +
        `today_authority=operator, template_count=0, operator_sailings=${allSailings.length}`
      );
    }
  }

  // Dedupe advisories by text
  const seenAdvisoryTexts = new Set<string>();
  const uniqueAdvisories = allAdvisories.filter((a) => {
    if (seenAdvisoryTexts.has(a.text)) return false;
    seenAdvisoryTexts.add(a.text);
    return true;
  });

  // Determine overall schedule source
  // PHASE 80.2: Canonicalize to 'operator_status' instead of legacy 'operator_live'
  // 'operator_snapshot' = base schedule from DB (Phase 78 path)
  // 'operator_status' = live status overlay from observer cache (legacy path)
  // 'template' = static template fallback
  let scheduleSource: BoardProvenance['schedule_source'];
  if (hasAnyLiveSchedule && !allSailings.some((s) => s.schedule_source === 'template')) {
    // PHASE 80.2: Use canonical 'operator_status' instead of legacy 'operator_live'
    scheduleSource = 'operator_status';
  } else if (!hasAnyLiveSchedule) {
    scheduleSource = 'template';
  } else {
    scheduleSource = 'mixed';
  }

  // ============================================================
  // PHASE 81: COMPUTE LIKELIHOOD FOR TEMPLATE PATH SAILINGS
  // ============================================================
  const operatorsWithLiveStatusTemplate: string[] = [];
  const operatorsUsingCrossOperatorTemplate: string[] = [];

  for (const sailing of allSailings) {
    // Only compute likelihood if not already set
    if (sailing.likelihood_to_run_pct === undefined) {
      // Convert WeatherContext to WeatherConditions for likelihood computation
      const weatherForLikelihood = weather ? {
        wind_speed_mph: weather.windSpeed,
        wind_direction_degrees: weather.windDirection,
        has_advisory: !!weather.advisoryLevel,
      } : null;

      const likelihoodResult = computeSimplifiedLikelihood(weatherForLikelihood, sailing.operator_id);

      sailing.likelihood_to_run_pct = likelihoodResult.likelihood_to_run_pct;
      sailing.likelihood_confidence = likelihoodResult.likelihood_confidence;
      sailing.likelihood_basis = likelihoodResult.likelihood_basis;
      sailing.likelihood_sample_size = likelihoodResult.sample_size;
    }

    // Track which operators have live status
    if (operatorHasLiveStatus(sailing.operator_id)) {
      if (!operatorsWithLiveStatusTemplate.includes(sailing.operator_id)) {
        operatorsWithLiveStatusTemplate.push(sailing.operator_id);
      }
    } else {
      if (!operatorsUsingCrossOperatorTemplate.includes(sailing.operator_id)) {
        operatorsUsingCrossOperatorTemplate.push(sailing.operator_id);
      }
    }
  }

  // Build provenance
  const provenance: BoardProvenance = {
    schedule_source: scheduleSource,
    status_overlay_available: hasAnyStatusOverlay,
    generated_at: now.toISOString(),
    operator_status_sources: operatorStatusSources,
    // Phase 77: Operator schedule authority lock
    today_authority: todayAuthority,
    template_excluded_reason: templateExcludedReason,
    // Phase 77: Schedule authority audit for debugging
    schedule_authority_audit: scheduleAuthorityAudit,
    // Phase 81: Track which operators have live status
    operators_with_live_status: operatorsWithLiveStatusTemplate,
    operators_using_cross_operator_model: operatorsUsingCrossOperatorTemplate,
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

  // ============================================================
  // PHASE 80.2: RUNTIME ASSERTIONS - AUTHORITY VALIDATION
  // ============================================================
  // If today_authority == 'operator_only', ensure no template data leaked through
  // and all sailings have canonical schedule_source values.
  if (provenance.today_authority === 'operator_only') {
    // Check 1: No sailings should have template schedule_source
    const templateLeaks = allSailings.filter(s => s.schedule_source === 'template');
    if (templateLeaks.length > 0) {
      console.error(
        `[PHASE80.2 AUTHORITY VIOLATION] today_authority=operator_only but ${templateLeaks.length} sailings have schedule_source=template. ` +
        `First violation: ${templateLeaks[0].origin_terminal.id}->${templateLeaks[0].destination_terminal.id}@${templateLeaks[0].scheduled_departure_local}`
      );
    }

    // Check 2: No sailings should have legacy operator_live/operator_scraped values
    const legacyValues = allSailings.filter(s =>
      s.schedule_source === 'operator_live' || s.schedule_source === 'operator_scraped'
    );
    if (legacyValues.length > 0) {
      console.error(
        `[PHASE80.2 AUTHORITY VIOLATION] today_authority=operator_only but ${legacyValues.length} sailings have legacy schedule_source. ` +
        `Values found: [${[...new Set(legacyValues.map(s => s.schedule_source))].join(',')}]. ` +
        `First violation: ${legacyValues[0].origin_terminal.id}->${legacyValues[0].destination_terminal.id}@${legacyValues[0].scheduled_departure_local}`
      );
    }

    // Check 3: Provenance schedule_source should be operator_snapshot or operator_status
    if (provenance.schedule_source !== 'operator_snapshot' && provenance.schedule_source !== 'operator_status') {
      console.error(
        `[PHASE80.2 AUTHORITY VIOLATION] today_authority=operator_only but provenance.schedule_source=${provenance.schedule_source}. ` +
        `Expected: operator_snapshot or operator_status`
      );
    }

    console.log(
      `[PHASE80.2] Authority validation passed: corridor=${corridorId} today_authority=operator_only ` +
      `schedule_source=${provenance.schedule_source} sailings=${allSailings.length}`
    );
  }

  // PHASE 80.4: Provenance invariant - MUST never be null
  if (!provenance) {
    throw new Error(`[PHASE80.4] Provenance missing in template path – invalid corridor response for ${corridorId}`);
  }

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
 * Phase 81.3: Widened to 60 minutes to ensure all sailings get forecast data
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
    // Use forecasts within 60 minutes of sailing (nearest hour)
    // This ensures every sailing gets the closest available hourly forecast
    if (diff < closestDiff && diff <= 60 * 60 * 1000) {
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

    // Phase 81.3: Per-sailing weather forecast data
    let forecastWindSpeed: number | null = null;
    let forecastWindGusts: number | null = null;
    let forecastWindDirection: number | null = null;
    let forecastWindDirectionText: string | null = null;

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

        // Phase 81.3: Store per-sailing weather forecast
        forecastWindSpeed = forecastHour.windSpeed10mMph;
        forecastWindGusts = forecastHour.windGustsMph;
        forecastWindDirection = forecastHour.windDirectionDeg;
        forecastWindDirectionText = forecastWindDirection != null
          ? degreesToCardinal(forecastWindDirection)
          : null;
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
      // Phase 81.3: Use current weather as fallback for per-sailing display
      forecastWindSpeed = weather.windSpeed;
      forecastWindGusts = weather.windGusts ?? null;
      forecastWindDirection = weather.windDirection;
      forecastWindDirectionText = weather.windDirection != null
        ? degreesToCardinal(weather.windDirection)
        : null;
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
      // Phase 60 + 80.2: Use sailing's scheduleSource if available, fallback to provenance
      // PHASE 80.2: Canonicalize legacy 'operator_live' to 'operator_status'
      schedule_source: (sailing.scheduleSource ||
        (scheduleResult.provenance.source_type === 'operator_live' ? 'operator_status' : 'template')) as ScheduleSourceType,
      status_overlay_applied: statusOverlayApplied,

      vessel_name: sailing.vesselName,

      // Phase 81.3: Per-sailing weather forecast
      forecast_wind_speed: forecastWindSpeed,
      forecast_wind_gusts: forecastWindGusts,
      forecast_wind_direction: forecastWindDirection,
      forecast_wind_direction_text: forecastWindDirectionText,
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
 * Phase 81.3: Convert wind direction degrees to cardinal text
 */
function degreesToCardinal(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Phase 81.3: Convert any time format to minutes since midnight
 * Handles both "07:00" (24h) and "7:00 AM" (12h) formats
 */
function timeToMinutes(timeStr: string): number | null {
  // Try 24-hour format first: "07:00" or "07:00:00"
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hour = parseInt(match24[1], 10);
    const minute = parseInt(match24[2], 10);
    return hour * 60 + minute;
  }

  // Try 12-hour format: "7:00 AM" or "12:30 PM"
  const match12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minute = parseInt(match12[2], 10);
    const isPM = match12[3].toUpperCase() === 'PM';

    if (hour === 12) {
      hour = isPM ? 12 : 0;
    } else if (isPM) {
      hour += 12;
    }
    return hour * 60 + minute;
  }

  return null;
}

/**
 * Phase 81.3: Find the closest prediction for a sailing time
 * Uses minutes-since-midnight for matching, with 60-minute tolerance
 * (wider tolerance needed because prediction times don't always match DB times)
 */
function findClosestPrediction(
  sailingTimeDisplay: string,
  predictions: Map<string, ForecastPrediction>
): ForecastPrediction | null {
  const sailingMinutes = timeToMinutes(sailingTimeDisplay);
  if (sailingMinutes === null || predictions.size === 0) return null;

  let closest: ForecastPrediction | null = null;
  let closestDiff = Infinity;

  for (const [minutesKey, prediction] of predictions) {
    const predMinutes = parseInt(minutesKey, 10);
    const diff = Math.abs(predMinutes - sailingMinutes);
    // Match within 60 minutes (wider tolerance for mismatched schedules)
    if (diff < closestDiff && diff <= 60) {
      closestDiff = diff;
      closest = prediction;
    }
  }

  return closest;
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

      // Provenance: Phase 80.3 - Mark as operator_snapshot since it came from DB
      // (ingested from operator scraping, not template)
      schedule_source: 'operator_snapshot',
      status_overlay_applied: true,

      // No vessel name for synthetic sailings
      vessel_name: undefined,

      // Phase 74: Pass through sailing_origin for removed sailing tracking
      sailing_origin: rawRecord.sailing_origin || null,
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

// ============================================================
// PHASE 78: CREATE BOARD SAILING FROM OPERATOR DB RECORD
// ============================================================

/**
 * Convert an operator schedule sailing (from DB) to TerminalBoardSailing format.
 *
 * This is used when operator schedule exists in the database.
 * The resulting sailing has schedule_source='operator_snapshot' and is
 * authoritative (templates should NOT be used).
 *
 * @param dbSailing - Sailing from loadOperatorSchedule()
 * @param operatorId - Display operator ID (e.g., 'steamship-authority')
 * @param serviceDate - Service date in YYYY-MM-DD format
 * @param timezone - IANA timezone (e.g., 'America/New_York')
 * @param todayPredictions - Phase 81.3: Optional predictions for per-sailing weather (from prediction_snapshots_v2)
 * @param weather - Phase 81.3: Optional current weather as fallback
 */
function createBoardSailingFromDB(
  dbSailing: OperatorScheduleSailing,
  operatorId: string,
  serviceDate: string,
  timezone: string,
  todayPredictions?: TodayPredictionsContext | null,
  weather?: WeatherContext | null
): TerminalBoardSailing | null {
  try {
    const fromSlug = normalizePortSlug(dbSailing.from_port);
    const toSlug = normalizePortSlug(dbSailing.to_port);
    const fromName = PORT_DISPLAY_NAMES[fromSlug] || dbSailing.from_port;
    const toName = PORT_DISPLAY_NAMES[toSlug] || dbSailing.to_port;

    // Convert 24-hour time to 12-hour display format
    const departureTimeDisplay = format24To12Hour(dbSailing.departure_time);

    // PHASE 80.4: Use timezone-aware parsing to fix "all sailings departed" bug
    // The DB stores times like "06:00:00" which must be interpreted as local time (EST/EDT)
    // parseTimeInTimezone correctly handles DST and produces proper UTC timestamps
    const parsedTime = parseTimeInTimezone(departureTimeDisplay, serviceDate, timezone);
    const departureTimestampMs = parsedTime.timestampMs;
    const departureUTC = parsedTime.utc;

    // Generate sailing ID
    const sailingId = generateSailingId(operatorId, fromSlug, toSlug, departureTimeDisplay);

    // Map DB status to operator_status
    let operatorStatus: 'on_time' | 'delayed' | 'canceled' | null = null;
    if (dbSailing.status === 'on_time') {
      operatorStatus = 'on_time';
    } else if (dbSailing.status === 'delayed') {
      operatorStatus = 'delayed';
    } else if (dbSailing.status === 'canceled') {
      operatorStatus = 'canceled';
    }

    // ============================================================
    // PHASE 81.3: PER-SAILING WEATHER FORECAST FROM PREDICTIONS
    // ============================================================
    // Use today's predictions (from prediction_snapshots_v2) which has per-sailing
    // weather data matching the 7-day/14-day forecast format.
    let forecastRisk: ForecastRisk | null = null;
    let forecastWindSpeed: number | null = null;
    let forecastWindGusts: number | null = null;
    let forecastWindDirection: number | null = null;
    let forecastWindDirectionText: string | null = null;

    // Try to find prediction for this sailing time (closest match within 30 min)
    if (todayPredictions && todayPredictions.predictions.size > 0) {
      const prediction = findClosestPrediction(departureTimeDisplay, todayPredictions.predictions);
      if (prediction) {
        // Use prediction data - same format as 7-day/14-day forecasts
        forecastRisk = {
          level: prediction.risk_level as RiskLevel,
          explanation: prediction.explanation || [],
          wind_relation: 'cross', // Default for predictions
          model_version: prediction.model_version,
          forecast_source: 'gfs',
        };

        // Per-sailing weather from prediction
        forecastWindSpeed = prediction.wind_speed_mph;
        forecastWindGusts = prediction.wind_gust_mph;
        forecastWindDirection = prediction.wind_direction_deg;
        forecastWindDirectionText = forecastWindDirection != null
          ? degreesToCardinal(forecastWindDirection)
          : null;
      }
    }

    // Fallback to current weather if no prediction available
    if (!forecastRisk && weather) {
      const operatorSlugForRisk = operatorId === 'steamship-authority' ? 'ssa' : operatorId;
      const risk = computeSailingRisk(
        {
          direction: { fromSlug, toSlug, from: fromName, to: toName },
          departureTime: departureUTC,
          departureTimeDisplay,
          departureTimestampMs,
          serviceDateLocal: serviceDate,
          operator: operatorId,
          operatorSlug: operatorSlugForRisk,
          status: dbSailing.status as 'on_time' | 'delayed' | 'canceled' | 'scheduled' | 'unknown',
          statusFromOperator: true,
          timezone,
        },
        weather,
        `${fromSlug}-${toSlug}-${operatorSlugForRisk}`
      );
      forecastRisk = {
        level: risk.level as RiskLevel,
        explanation: risk.reason ? [risk.reason] : [],
        wind_relation: mapWindRelation(risk.windRelation),
      };
      // Use current weather as fallback for per-sailing display
      forecastWindSpeed = weather.windSpeed;
      forecastWindGusts = weather.windGusts ?? null;
      forecastWindDirection = weather.windDirection;
      forecastWindDirectionText = weather.windDirection != null
        ? degreesToCardinal(weather.windDirection)
        : null;
    }

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

      // Layer 1: Operator status from DB
      operator_status: operatorStatus,
      operator_status_reason: dbSailing.status_reason || dbSailing.status_message || null,
      operator_status_source: 'supabase_sailing_events',

      // Layer 2: Forecast risk
      forecast_risk: forecastRisk,

      // Phase 78.1: Mark as operator_snapshot - canonical value for base schedule from operator DB
      schedule_source: 'operator_snapshot',
      status_overlay_applied: true, // Status is already from DB

      vessel_name: undefined,

      // Phase 74: Pass through sailing_origin
      sailing_origin: dbSailing.sailing_origin || null,

      // Phase 81.3: Per-sailing weather forecast
      forecast_wind_speed: forecastWindSpeed,
      forecast_wind_gusts: forecastWindGusts,
      forecast_wind_direction: forecastWindDirection,
      forecast_wind_direction_text: forecastWindDirectionText,
    };

    return sailing;
  } catch (err) {
    console.error(`[PHASE78] Error creating board sailing from DB:`, err);
    return null;
  }
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
