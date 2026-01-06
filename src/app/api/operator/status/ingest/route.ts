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
 * Phase 76.5: Ingest Receipts and Observer Health
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
 * Phase 76.5 Addition:
 * - REQUIRES request_id from observer (UUID)
 * - Writes to ingest_runs table BEFORE and AFTER processing
 * - Updates observer_heartbeats table on every call
 * - Provides persistent proof of data flow
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
import { supabase } from '@/lib/supabase/client';

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
// Phase 74: Added sailing_origin for removed sailing detection
interface ScheduleRow {
  departing_terminal: string;
  arriving_terminal: string;
  departure_time_local: string;
  arrival_time_local?: string;
  status: 'on_time' | 'canceled' | 'delayed';
  status_reason?: string | null;  // May be null from Source A
  /**
   * Phase 74: Origin marker for removed sailings
   *
   * PHASE 74 SSA DISAPPEARING CANCELLATION INGESTION:
   * - 'operator_removed': Sailing was in the full schedule but NOT in the active list
   *   (SSA removes canceled sailings instead of marking them as canceled)
   * - undefined: Normal sailing from operator scrape
   *
   * When sailing_origin is 'operator_removed':
   * - status MUST be 'canceled' (inferred from disappearance)
   * - status_reason should explain the inference
   */
  sailing_origin?: 'operator_removed';
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
  // Phase 76.5: Unique request ID from observer (UUID)
  request_id?: string;
}

type IngestPayload = LegacyIngestPayload | DualSourcePayload;

// ============================================================
// PHASE 76.5: INGEST RECEIPT TYPES
// ============================================================

interface IngestRunInsert {
  request_id: string;
  operator_id: string;
  service_date: string;
  observed_at: string;
  payload_sailings_count: number;
  payload_cancellations_count: number;
  trigger_type: 'auto' | 'manual' | 'unknown';
  source_url: string | null;
}

interface IngestRunUpdate {
  db_rows_inserted: number;
  db_rows_updated: number;
  db_rows_unchanged: number;
  db_rows_failed: number;
  status: 'ok' | 'partial' | 'failed';
  error: string | null;
}

interface HeartbeatUpsert {
  operator_id: string;
  last_seen_at: string;
  last_request_id: string;
  last_success: boolean;
  last_error: string | null;
  last_service_date: string;
  last_sailings_count: number;
  last_cancellations_count: number;
}

// ============================================================
// PHASE 76.5: INGEST RECEIPT FUNCTIONS
// ============================================================

/**
 * Insert initial ingest run record (before processing)
 * Returns the request_id on success, null on failure
 */
async function insertIngestRun(data: IngestRunInsert): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('ingest_runs')
      .insert({
        request_id: data.request_id,
        operator_id: data.operator_id,
        service_date: data.service_date,
        observed_at: data.observed_at,
        payload_sailings_count: data.payload_sailings_count,
        payload_cancellations_count: data.payload_cancellations_count,
        trigger_type: data.trigger_type,
        source_url: data.source_url,
        // Initial values before processing
        db_rows_inserted: 0,
        db_rows_updated: 0,
        db_rows_unchanged: 0,
        db_rows_failed: 0,
        status: 'ok', // Will be updated after processing
      });

    if (error) {
      // Check for unique constraint violation (duplicate request_id)
      if (error.code === '23505') {
        console.warn(`[INGEST] Duplicate request_id: ${data.request_id}`);
        return false;
      }
      console.error('[INGEST] Failed to insert ingest_run:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[INGEST] insertIngestRun exception:', err);
    return false;
  }
}

/**
 * Update ingest run record with final results (after processing)
 */
async function updateIngestRun(requestId: string, data: IngestRunUpdate): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('ingest_runs')
      .update({
        db_rows_inserted: data.db_rows_inserted,
        db_rows_updated: data.db_rows_updated,
        db_rows_unchanged: data.db_rows_unchanged,
        db_rows_failed: data.db_rows_failed,
        status: data.status,
        error: data.error,
      })
      .eq('request_id', requestId);

    if (error) {
      console.error('[INGEST] Failed to update ingest_run:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[INGEST] updateIngestRun exception:', err);
    return false;
  }
}

/**
 * Upsert observer heartbeat record
 */
async function upsertObserverHeartbeat(data: HeartbeatUpsert): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('observer_heartbeats')
      .upsert({
        operator_id: data.operator_id,
        last_seen_at: data.last_seen_at,
        last_request_id: data.last_request_id,
        last_success: data.last_success,
        last_error: data.last_error,
        last_service_date: data.last_service_date,
        last_sailings_count: data.last_sailings_count,
        last_cancellations_count: data.last_cancellations_count,
        consecutive_failures: data.last_success ? 0 : 1, // Reset on success, increment on failure handled by trigger
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'operator_id',
      });

    if (error) {
      console.error('[INGEST] Failed to upsert observer_heartbeat:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[INGEST] upsertObserverHeartbeat exception:', err);
    return false;
  }
}

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

    // ============================================================
    // PHASE 76.5: Extract or generate request_id
    // ============================================================
    const requestId = isDualSourcePayload(payload) && payload.request_id
      ? payload.request_id
      : crypto.randomUUID(); // Generate UUID if not provided (backwards compatibility)

    const operatorIdForReceipt = mapOperatorId(payload.source);
    const scrapedAtUtc = payload.scraped_at_utc;
    const serviceDateLocal = payload.service_date_local;

    // Calculate payload counts for receipt
    let payloadSailingsCount = 0;
    let payloadCancellationsCount = 0;
    if (isDualSourcePayload(payload)) {
      payloadSailingsCount = payload.schedule_rows.length;
      payloadCancellationsCount = payload.schedule_rows.filter(r => r.status === 'canceled').length;
    } else if ('sailings' in payload && Array.isArray(payload.sailings)) {
      payloadSailingsCount = payload.sailings.length;
      payloadCancellationsCount = payload.sailings.filter(s => s.status === 'canceled').length;
    }

    // Get source URL for receipt
    const sourceUrlForReceipt = isDualSourcePayload(payload)
      ? payload.source_meta?.schedule_url || null
      : null;

    // PHASE 76.5: Insert initial ingest run record BEFORE processing
    console.log(`[INGEST] Phase 76.5: Inserting ingest_run receipt for request_id=${requestId}`);
    const receiptInserted = await insertIngestRun({
      request_id: requestId,
      operator_id: operatorIdForReceipt,
      service_date: serviceDateLocal,
      observed_at: scrapedAtUtc,
      payload_sailings_count: payloadSailingsCount,
      payload_cancellations_count: payloadCancellationsCount,
      trigger_type: payload.trigger || 'unknown',
      source_url: sourceUrlForReceipt,
    });

    if (!receiptInserted) {
      console.warn(`[INGEST] Phase 76.5: Failed to insert ingest_run (may be duplicate request_id: ${requestId})`);
      // Continue processing even if receipt insert fails - don't block ingest
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
        // Phase 74: Pass through sailing_origin for removed sailing detection
        sailing_origin: s.sailing_origin,
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
          console.log(
            `[PHASE 49/50] Capturing cancellation conditions`,
            JSON.stringify({
              sailing_event_id: result.first_cancellation_id,
              operator_id: operatorId,
              terminal_slug: result.from_port,
            })
          );

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

    // ============================================================
    // PHASE 76.5: Update ingest run with final results
    // ============================================================
    const finalStatus: 'ok' | 'partial' | 'failed' =
      failed === 0 ? 'ok' :
      (inserted + updated + unchanged > 0 ? 'partial' : 'failed');

    console.log(`[INGEST] Phase 76.5: Updating ingest_run with final status=${finalStatus}`);
    await updateIngestRun(requestId, {
      db_rows_inserted: inserted,
      db_rows_updated: updated,
      db_rows_unchanged: unchanged,
      db_rows_failed: failed,
      status: finalStatus,
      error: failed > 0 ? `${failed} rows failed` : null,
    });

    // PHASE 76.5: Update observer heartbeat
    await upsertObserverHeartbeat({
      operator_id: operatorIdForReceipt,
      last_seen_at: new Date().toISOString(),
      last_request_id: requestId,
      last_success: finalStatus !== 'failed',
      last_error: finalStatus === 'failed' ? `${failed} rows failed` : null,
      last_service_date: serviceDateLocal,
      last_sailings_count: payloadSailingsCount,
      last_cancellations_count: payloadCancellationsCount,
    });

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
      // Phase 76.5: Ingest receipt stats
      request_id: requestId,
      ingest_run_status: finalStatus,
      db_stats: {
        inserted,
        updated,
        unchanged,
        failed,
      },
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
    version: 'Phase 76.5: Ingest Receipts and Observer Health',
  });
}
