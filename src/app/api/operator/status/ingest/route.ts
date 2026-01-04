/**
 * Operator Status Ingest API
 *
 * Phase 24: Trusted Operator Observer
 * Phase 25: Fix JSON Response Contract
 * Phase 27: Persistent Sailing Event Memory
 * Phase 31: Fix persistence - switch to Node.js runtime and awaited persistence
 * Phase 37: Live Operator Status Reconciliation
 * Phase 41: 2-Source Operator Ingestion (schedule_rows + reason_rows)
 * Phase 43: Operator Conditions - Store terminal wind exactly as shown
 * Phase 49: Cancellation Operator Conditions - Capture wind at first cancellation
 *
 * POST /api/operator/status/ingest
 *
 * Receives operator status data from trusted browser-based observer.
 * This is Layer 1 (Operator Truth) data that overlays template schedules.
 *
 * Phase 41 Addition:
 * - Accepts dual-source payload: schedule_rows (Source A) + reason_rows (Source B)
 * - Merge rules: Source A is truth for existence/status, Source B enriches reason
 * - Never overwrite non-empty status_reason with empty/null
 * - Regression guards: schedule_rows == 0 returns error
 *
 * Phase 43 Addition:
 * - Accepts conditions[] array with terminal wind data from SSA status page
 * - Persists to operator_conditions table for user-facing display
 * - Kept separate from NOAA marine data used for prediction
 *
 * KEY PRINCIPLE: Operator reality overrides prediction.
 * Forecast explains risk. Operator status defines truth.
 *
 * Security:
 * - Requires Bearer token authentication via OBSERVER_SECRET env var
 * - Rate limited
 * - All ingests are logged with trigger source
 *
 * Response Contract:
 * - ALL exit paths return valid JSON with { success: boolean, ... }
 */

import { NextRequest, NextResponse } from 'next/server';

// Phase 31: Force Node.js runtime for reliable Supabase writes
export const runtime = 'nodejs';
import {
  reconcileSailingEvent,
  getCorridorId,
  mapOperatorId,
  normalizePortSlug,
  type SailingEventInput,
  type ReconcileResult,
} from '@/lib/events/sailing-events';
import {
  upsertOperatorConditions,
  insertCancellationCondition,
  type ConditionPayload,
  type CancellationConditionPayload,
} from '@/lib/events/operator-conditions';
import { enrichCancellation } from '@/lib/weather/cancellation-enrichment';

// Rate limiting: track last ingest time per source
const lastIngestTime: Record<string, number> = {};
const RATE_LIMIT_MS = 60 * 1000; // 1 minute minimum between ingests

// ============================================================
// PAYLOAD TYPES
// ============================================================

// Legacy payload format (Phase 40 and earlier)
interface LegacyIngestSailing {
  departing_terminal: string;
  arriving_terminal: string;
  departure_time_local: string;
  arrival_time_local?: string;
  status: 'on_time' | 'canceled' | 'delayed';
  status_message?: string;
}

interface LegacyIngestPayload {
  source: string;
  trigger: 'auto' | 'manual';
  scraped_at_utc: string;
  service_date_local: string;
  timezone: string;
  advisories?: { message: string }[];
  sailings: LegacyIngestSailing[];
}

// Phase 41: Dual-source payload format
interface ScheduleRow {
  departing_terminal: string;
  arriving_terminal: string;
  departure_time_local: string;
  arrival_time_local?: string;
  status: 'on_time' | 'canceled' | 'delayed';
  status_reason?: string | null;  // May be null from Source A
}

interface ReasonRow {
  departing_terminal: string;
  arriving_terminal: string;
  departure_time_local: string;
  status_reason: string;  // Always has a reason
}

interface SourceMeta {
  schedule_source: string;
  schedule_url: string;
  schedule_count: number;
  reason_source: string;
  reason_url: string;
  reason_count: number;
  reason_status: 'success' | 'skipped' | 'queue_blocked' | 'error';
  reason_error?: string | null;
  // Phase 43: Conditions metadata
  conditions_count?: number;
  conditions_source?: string;
}

// Phase 43: Condition payload from observer extension
interface IngestCondition {
  terminal_slug: string;           // e.g., 'woods-hole'
  wind_speed_mph?: number | null;  // e.g., 3.0
  wind_direction_text?: string | null;  // e.g., 'WSW'
  wind_direction_degrees?: number | null;  // e.g., 248
  raw_wind_text?: string | null;   // e.g., "WSW 3 mph"
  source_url: string;              // e.g., 'https://www.steamshipauthority.com/traveling_today/status'
  notes?: string | null;           // e.g., "Single wind value for both terminals"
}

interface DualSourcePayload {
  source: string;
  trigger: 'auto' | 'manual';
  scraped_at_utc: string;
  service_date_local: string;
  timezone: string;
  schedule_rows: ScheduleRow[];
  reason_rows: ReasonRow[];
  source_meta?: SourceMeta;
  // Phase 43: Terminal conditions from SSA status page
  conditions?: IngestCondition[];
}

type IngestPayload = LegacyIngestPayload | DualSourcePayload;

// ============================================================
// HELPERS
// ============================================================

/**
 * Helper to create a consistent JSON response
 */
function jsonResponse(
  body: Record<string, unknown>,
  status: number = 200
): NextResponse {
  console.log(`[INGEST] Response: ${status} success=${body.success} ${body.error || ''}`);
  return NextResponse.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Normalize time format
 */
function normalizeTime(time: string): string {
  return time.trim().replace(/\s+/g, ' ').replace(/am$/i, 'AM').replace(/pm$/i, 'PM');
}

/**
 * Build a natural key string for matching sailings
 */
function buildMatchKey(departing: string, arriving: string, departureTime: string): string {
  const fromSlug = normalizePortSlug(departing);
  const toSlug = normalizePortSlug(arriving);
  const time = normalizeTime(departureTime);
  return `${fromSlug}|${toSlug}|${time}`;
}

/**
 * Phase 41: Merge schedule_rows with reason_rows
 *
 * MERGE RULES:
 * 1. Source A (schedule_rows) is truth for sailing existence and status
 * 2. Source B (reason_rows) enriches status_reason on matching rows
 * 3. Never overwrite non-empty status_reason with empty/null
 * 4. Natural key: departure_time + from_port + to_port
 */
function mergeScheduleAndReasons(
  scheduleRows: ScheduleRow[],
  reasonRows: ReasonRow[]
): { merged: ScheduleRow[]; reasonsApplied: number } {
  // Build a lookup map from reason_rows
  const reasonMap = new Map<string, string>();
  for (const reason of reasonRows) {
    const key = buildMatchKey(reason.departing_terminal, reason.arriving_terminal, reason.departure_time_local);
    // Store the reason (don't overwrite if multiple - keep first)
    if (!reasonMap.has(key)) {
      reasonMap.set(key, reason.status_reason);
    }
  }

  let reasonsApplied = 0;

  // Merge reasons into schedule rows
  const merged = scheduleRows.map(row => {
    const key = buildMatchKey(row.departing_terminal, row.arriving_terminal, row.departure_time_local);
    const enrichedReason = reasonMap.get(key);

    // Apply merge rule: never overwrite non-empty with empty/null
    let finalReason = row.status_reason;
    if (enrichedReason && enrichedReason.trim()) {
      // Source B has a reason
      if (!finalReason || !finalReason.trim()) {
        // Source A has no reason - use Source B
        finalReason = enrichedReason;
        reasonsApplied++;
      }
      // If Source A already has a reason, keep it (don't overwrite)
    }

    return {
      ...row,
      status_reason: finalReason,
    };
  });

  return { merged, reasonsApplied };
}

/**
 * Detect if payload is dual-source format (Phase 41)
 */
function isDualSourcePayload(payload: IngestPayload): payload is DualSourcePayload {
  return 'schedule_rows' in payload && Array.isArray(payload.schedule_rows);
}

// ============================================================
// POST HANDLER
// ============================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const observerSecret = process.env.OBSERVER_SECRET;
    const isDev = process.env.NODE_ENV === 'development';

    // Extract Bearer token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Validate authentication
    if (!isDev) {
      if (!observerSecret) {
        console.error('[INGEST] OBSERVER_SECRET not configured');
        return jsonResponse(
          { success: false, error: 'server_misconfiguration' },
          500
        );
      }

      if (!token || token !== observerSecret) {
        console.warn('[INGEST] Invalid or missing authorization');
        return jsonResponse(
          { success: false, error: 'unauthorized' },
          401
        );
      }
    }

    // Parse request body
    let payload: IngestPayload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(
        { success: false, error: 'invalid_json' },
        400
      );
    }

    // Validate required fields
    if (!payload.source || !payload.trigger) {
      return jsonResponse(
        { success: false, error: 'missing_required_fields' },
        400
      );
    }

    // Rate limiting (skip in dev for testing)
    if (!isDev) {
      const now = Date.now();
      const lastTime = lastIngestTime[payload.source] || 0;
      if (now - lastTime < RATE_LIMIT_MS) {
        const waitSeconds = Math.ceil((RATE_LIMIT_MS - (now - lastTime)) / 1000);
        console.warn(`[INGEST] Rate limited: ${payload.source}, wait ${waitSeconds}s`);
        return jsonResponse(
          { success: false, error: 'rate_limited', wait_seconds: waitSeconds },
          429
        );
      }
      lastIngestTime[payload.source] = now;
    }

    // Import status-cache dynamically
    let setExtendedCachedStatus: typeof import('@/lib/schedules/status-cache').setExtendedCachedStatus;
    let portNameToSlug: typeof import('@/lib/schedules/status-cache').portNameToSlug;
    let normalizeStatus: typeof import('@/lib/schedules/status-cache').normalizeStatus;

    try {
      const statusCache = await import('@/lib/schedules/status-cache');
      setExtendedCachedStatus = statusCache.setExtendedCachedStatus;
      portNameToSlug = statusCache.portNameToSlug;
      normalizeStatus = statusCache.normalizeStatus;
    } catch (importError) {
      console.error('[INGEST] Failed to import status-cache:', importError);
      return jsonResponse(
        { success: false, error: 'internal_error' },
        500
      );
    }

    // ============================================================
    // PHASE 41: Handle dual-source or legacy payload
    // ============================================================

    let sailingsToProcess: ScheduleRow[];
    let reasonsApplied = 0;
    let scheduleRowCount = 0;
    let reasonRowCount = 0;

    if (isDualSourcePayload(payload)) {
      // Phase 41: Dual-source payload
      scheduleRowCount = payload.schedule_rows.length;
      reasonRowCount = payload.reason_rows.length;

      // REGRESSION GUARD: schedule_rows must have data
      if (scheduleRowCount === 0) {
        const sourceMeta = payload.source_meta;
        console.error('[INGEST] REGRESSION: schedule_rows == 0');
        console.error(`[INGEST] URL: ${sourceMeta?.schedule_url || 'unknown'}`);
        console.error('[INGEST] Selectors: .row, .departing, .arriving, .status, .location_name, .location_time');
        return jsonResponse(
          {
            success: false,
            error: 'regression_no_schedule_rows',
            schedule_url: sourceMeta?.schedule_url,
            selectors: '.row, .departing, .arriving, .status',
          },
          400
        );
      }

      // Log counts for debugging
      console.log(`[INGEST] Phase 41: schedule_rows=${scheduleRowCount}, reason_rows=${reasonRowCount}`);

      // REGRESSION GUARD: Log warning if reason_rows == 0 (allowed but notable)
      if (reasonRowCount === 0) {
        console.warn('[INGEST] WARNING: reason_rows == 0 (Source B unavailable or no reasons found)');
      }

      // Merge schedule and reasons
      const mergeResult = mergeScheduleAndReasons(payload.schedule_rows, payload.reason_rows);
      sailingsToProcess = mergeResult.merged;
      reasonsApplied = mergeResult.reasonsApplied;

      console.log(`[INGEST] Merged: ${reasonsApplied} reasons applied to ${sailingsToProcess.length} sailings`);

    } else {
      // Legacy payload (sailings array)
      if (!payload.sailings || !Array.isArray(payload.sailings)) {
        return jsonResponse(
          { success: false, error: 'missing_sailings' },
          400
        );
      }

      // Convert legacy format to ScheduleRow format
      sailingsToProcess = payload.sailings.map(s => ({
        departing_terminal: s.departing_terminal,
        arriving_terminal: s.arriving_terminal,
        departure_time_local: s.departure_time_local,
        arrival_time_local: s.arrival_time_local,
        status: s.status,
        status_reason: s.status_message || null,
      }));

      scheduleRowCount = sailingsToProcess.length;
    }

    // Transform sailings to cache format
    const sailings = sailingsToProcess.map((s) => ({
      from: s.departing_terminal,
      fromSlug: portNameToSlug(s.departing_terminal),
      to: s.arriving_terminal,
      toSlug: portNameToSlug(s.arriving_terminal),
      departureTime: normalizeTime(s.departure_time_local),
      status: normalizeStatus(s.status),
      statusMessage: s.status_reason || undefined,
    }));

    // Store with extended metadata
    try {
      setExtendedCachedStatus(sailings, {
        source: `${payload.source}_observer`,
        observedAt: payload.scraped_at_utc,
        operatorId: payload.source,
        serviceDateLocal: payload.service_date_local,
        timezone: payload.timezone,
      });
    } catch (cacheError) {
      console.error('[INGEST] Failed to update cache:', cacheError);
      return jsonResponse(
        { success: false, error: 'cache_update_failed' },
        500
      );
    }

    // Log ingest with runtime info
    console.log(
      `[INGEST] runtime=${process.env.NEXT_RUNTIME ?? 'nodejs'} ` +
      `${payload.trigger.toUpperCase()} from ${payload.source}: ` +
      `${sailingsToProcess.length} sailings (${reasonsApplied} reasons enriched)`
    );

    // Persist sailing events to database
    const operatorId = mapOperatorId(payload.source);
    const eventInputs: SailingEventInput[] = sailingsToProcess.map((s) => {
      const fromSlug = normalizePortSlug(s.departing_terminal);
      const toSlug = normalizePortSlug(s.arriving_terminal);
      return {
        operator_id: operatorId,
        corridor_id: getCorridorId(s.departing_terminal, s.arriving_terminal),
        from_port: fromSlug,
        to_port: toSlug,
        service_date: payload.service_date_local,
        departure_time: normalizeTime(s.departure_time_local),
        status: s.status,
        status_message: s.status_reason || undefined,
        source: `${payload.source}_observer`,
        observed_at: payload.scraped_at_utc,
      };
    });

    // ============================================================
    // PHASE 49: Persist sailing events with cancellation conditions capture
    // ============================================================

    // Build a lookup map of conditions by terminal slug for fast access
    const conditionsByTerminal = new Map<string, IngestCondition>();
    if (isDualSourcePayload(payload) && payload.conditions) {
      for (const cond of payload.conditions) {
        conditionsByTerminal.set(cond.terminal_slug, cond);
      }
    }

    // Process events sequentially with cancellation conditions capture
    console.log(`[INGEST] ENTERING reconciliation with ${eventInputs.length} events`);
    let persistedCount = 0;
    let cancellationConditionsInserted = 0;
    let cancellationConditionsSkipped = 0;
    let noaaSnapshotsInserted = 0;
    let noaaSnapshotsFailed = 0;
    const reconcileResults: ReconcileResult[] = [];

    for (let i = 0; i < eventInputs.length; i++) {
      const event = eventInputs[i];
      try {
        const result = await reconcileSailingEvent(event);
        reconcileResults.push(result);

        if (result.action !== 'failed') {
          persistedCount++;
        }

        // Phase 49: If this is a first cancellation, capture operator conditions
        if (result.first_cancellation_id && result.from_port) {
          const terminalCondition = conditionsByTerminal.get(result.from_port);
          const sourceUrl = (isDualSourcePayload(payload) && payload.source_meta?.schedule_url) ||
            'https://www.steamshipauthority.com/traveling_today/status';

          // Build the cancellation condition payload
          // Store NULLs if operator wind data is not available (never guess)
          const cancelCondPayload: CancellationConditionPayload = {
            sailing_event_id: result.first_cancellation_id,
            operator_id: operatorId,
            terminal_slug: result.from_port,
            wind_speed: terminalCondition?.wind_speed_mph ?? null,
            wind_direction_text: terminalCondition?.wind_direction_text ?? null,
            wind_direction_degrees: terminalCondition?.wind_direction_degrees ?? null,
            raw_text: terminalCondition?.raw_wind_text ?? null,
            source_url: terminalCondition?.source_url || sourceUrl,
            captured_at: payload.scraped_at_utc,
          };

          const cancelCondResult = await insertCancellationCondition(cancelCondPayload);

          if (cancelCondResult.inserted) {
            cancellationConditionsInserted++;
            console.log(
              `[INGEST] Phase 49: Captured cancellation conditions for sailing_event_id=${result.first_cancellation_id}`
            );
          } else {
            cancellationConditionsSkipped++;
            if (cancelCondResult.reason !== 'Conditions already captured (immutable)') {
              console.warn(
                `[INGEST] Phase 49: Failed to capture cancellation conditions: ${cancelCondResult.reason}`
              );
            }
          }

          // ============================================================
          // PHASE 50: Fetch and persist NOAA weather snapshot
          // ============================================================
          // This happens IMMEDIATELY in the same request cycle
          // If NWS fetch fails, we still insert with NULL values (never block)
          try {
            const enrichResult = await enrichCancellation({
              sailing_event_id: result.first_cancellation_id,
              operator_id: operatorId,
              from_port: result.from_port,
              to_port: event.to_port,
              captured_at: payload.scraped_at_utc,
              operator_wind_speed: terminalCondition?.wind_speed_mph ?? null,
              operator_wind_direction_text: terminalCondition?.wind_direction_text ?? null,
              operator_wind_direction_degrees: terminalCondition?.wind_direction_degrees ?? null,
              operator_raw_text: terminalCondition?.raw_wind_text ?? null,
              operator_source_url: terminalCondition?.source_url ?? null,
            });

            if (enrichResult.noaa_snapshot_inserted) {
              noaaSnapshotsInserted++;
              console.log(
                `[INGEST] Phase 50: NOAA snapshot captured for sailing_event_id=${result.first_cancellation_id} ` +
                `station=${enrichResult.nws_station_used} wind=${enrichResult.nws_wind_speed_mph ?? 'N/A'} mph`
              );
            } else if (enrichResult.errors.length > 0) {
              noaaSnapshotsFailed++;
              console.warn(
                `[INGEST] Phase 50: NOAA snapshot failed for sailing_event_id=${result.first_cancellation_id}: ` +
                enrichResult.errors.join(', ')
              );
            }
          } catch (enrichErr) {
            noaaSnapshotsFailed++;
            console.error(`[INGEST] Phase 50: NOAA enrichment exception:`, enrichErr);
            // NEVER block the ingest - continue processing
          }
        }
      } catch (err) {
        console.error(`[INGEST] Event ${i} reconciliation threw exception:`, err);
        reconcileResults.push({ action: 'failed', reason: String(err) });
      }
    }

    // Log summary
    const inserted = reconcileResults.filter(r => r.action === 'inserted').length;
    const updated = reconcileResults.filter(r => r.action === 'updated').length;
    const unchanged = reconcileResults.filter(r => r.action === 'unchanged').length;
    const failed = reconcileResults.filter(r => r.action === 'failed').length;

    console.log(
      `[INGEST] EXITED reconciliation: ${persistedCount}/${eventInputs.length} succeeded ` +
      `(${inserted} inserted, ${updated} updated, ${unchanged} unchanged, ${failed} failed). ` +
      `Phase 49: ${cancellationConditionsInserted} cancel conditions inserted, ${cancellationConditionsSkipped} skipped. ` +
      `Phase 50: ${noaaSnapshotsInserted} NOAA snapshots, ${noaaSnapshotsFailed} failed`
    );

    // ============================================================
    // PHASE 43: Persist operator conditions (terminal wind)
    // ============================================================
    let conditionsInserted = 0;
    let conditionsSkipped = 0;
    const conditionsErrors: string[] = [];

    if (isDualSourcePayload(payload) && payload.conditions && payload.conditions.length > 0) {
      console.log(`[INGEST] Phase 43: Persisting ${payload.conditions.length} operator conditions`);

      // Convert IngestCondition to ConditionPayload format
      const conditionPayloads: ConditionPayload[] = payload.conditions.map(c => ({
        terminal_slug: c.terminal_slug,
        wind_speed_mph: c.wind_speed_mph,
        wind_direction_text: c.wind_direction_text,
        wind_direction_degrees: c.wind_direction_degrees,
        raw_wind_text: c.raw_wind_text,
        source_url: c.source_url,
        notes: c.notes,
      }));

      try {
        const conditionsResult = await upsertOperatorConditions(
          operatorId,
          payload.scraped_at_utc,
          conditionPayloads
        );
        conditionsInserted = conditionsResult.inserted;
        conditionsSkipped = conditionsResult.skipped;
        if (conditionsResult.errors.length > 0) {
          conditionsErrors.push(...conditionsResult.errors);
          console.warn('[INGEST] Conditions errors:', conditionsResult.errors);
        }
        console.log(`[INGEST] Conditions: ${conditionsInserted} inserted, ${conditionsSkipped} skipped`);
      } catch (err) {
        console.error('[INGEST] upsertOperatorConditions threw exception:', err);
        conditionsErrors.push(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    // Count statuses for response
    const statusCounts = {
      on_time: sailingsToProcess.filter((s) => s.status === 'on_time').length,
      canceled: sailingsToProcess.filter((s) => s.status === 'canceled').length,
      delayed: sailingsToProcess.filter((s) => s.status === 'delayed').length,
    };

    return jsonResponse({
      success: true,
      ingested: sailingsToProcess.length,
      persisted: persistedCount,
      source: payload.source,
      trigger: payload.trigger,
      scraped_at: payload.scraped_at_utc,
      service_date: payload.service_date_local,
      status_counts: statusCounts,
      // Phase 41: Include dual-source stats
      schedule_rows_count: scheduleRowCount,
      reason_rows_count: reasonRowCount,
      reasons_applied: reasonsApplied,
      merged_count: sailingsToProcess.length,
      // Phase 43: Include conditions stats
      conditions_inserted: conditionsInserted,
      conditions_skipped: conditionsSkipped,
      conditions_errors: conditionsErrors.length > 0 ? conditionsErrors : undefined,
      // Phase 49: Include cancellation conditions stats
      cancellation_conditions_inserted: cancellationConditionsInserted,
      cancellation_conditions_skipped: cancellationConditionsSkipped,
      // Phase 50: Include NOAA weather snapshot stats
      noaa_snapshots_inserted: noaaSnapshotsInserted,
      noaa_snapshots_failed: noaaSnapshotsFailed,
    });
  } catch (error) {
    console.error('[INGEST] Unexpected error:', error);
    return jsonResponse(
      { success: false, error: 'unexpected_error' },
      500
    );
  }
}

// ============================================================
// GET HANDLER (Health Check)
// ============================================================

export async function GET(): Promise<NextResponse> {
  return jsonResponse({
    success: true,
    endpoint: '/api/operator/status/ingest',
    method: 'POST',
    auth: 'Bearer OBSERVER_SECRET',
    status: 'ready',
    version: 'Phase 50: Cancellation Weather Enrichment (NOAA Snapshots)',
  });
}
