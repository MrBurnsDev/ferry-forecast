/**
 * Sailing Events Persistence
 *
 * Phase 27: Persistent Sailing Event Memory
 * Phase 37: Live Operator Status Reconciliation
 * Phase 42: Immutable Cancellation Persistence
 * Phase 45: Canceled Sailings Display Visibility
 *
 * Manages sailing events with reconciliation support.
 * When operator status changes, we UPDATE existing rows (upsert pattern).
 *
 * RULES:
 * - UPSERT on natural key (operator, corridor, date, time, ports)
 * - Track status changes with previous_status audit
 * - Weather snapshot captured at observation time
 * - Failures are logged but do NOT break UI
 *
 * KEY PRINCIPLE: Operator reality overrides prediction.
 * Forecast explains risk. Operator status defines truth.
 *
 * ============================================================
 * PHASE 45 REGRESSION GUARDS - IMMUTABLE DISPLAY RULES
 * ============================================================
 *
 * When displaying sailings in the UI:
 * 1. Canceled sailings are NEVER placed in the "departed" section
 * 2. Canceled sailings are ALWAYS visible in the main/upcoming section
 * 3. Time-based filtering MUST check operator_status === 'canceled' first
 * 4. getSailingDisplayStatus() and isSailingUpcomingForDisplay() in time.ts
 *    implement these rules - use them instead of raw time comparisons
 *
 * Files that implement these rules:
 * - src/lib/schedules/time.ts: getSailingDisplayStatus, isSailingUpcomingForDisplay
 * - src/components/TerminalBoard.tsx: getTimeStatus()
 * - src/components/CorridorBoard.tsx: getTimeStatus()
 * - src/components/TodaySailings.tsx: getSailingStatus()
 * - src/lib/schedules/index.ts: filterUpcomingSailings()
 *
 * If you're modifying any time-based sailing filtering, ensure canceled
 * sailings are NEVER excluded from the "upcoming" UI section.
 * ============================================================
 */

import { createServerClient } from '@/lib/supabase/client';
import { fetchCurrentWeather, WeatherFetchError } from '@/lib/weather/noaa';

// ============================================
// SCHEMA VALIDATION
// ============================================

// Required columns for Phase 37 reconciliation
const REQUIRED_RECONCILIATION_COLUMNS = [
  'status_reason',
  'status_source',
  'status_updated_at',
  'previous_status',
] as const;

// Schema validation state (cached per process)
let schemaValidated = false;
let schemaValidationError: string | null = null;

/**
 * Validate that the sailing_events table has all required reconciliation columns.
 * This is a safety guard - if columns are missing, abort ingest with a fatal error.
 *
 * Phase 37: Do not silently fail reconciliation.
 */
async function validateSchema(): Promise<{ valid: boolean; error?: string }> {
  // Return cached result if already validated
  if (schemaValidated) {
    return schemaValidationError
      ? { valid: false, error: schemaValidationError }
      : { valid: true };
  }

  const supabase = createServerClient();
  if (!supabase) {
    return { valid: true }; // Skip validation if no DB (dev mode)
  }

  try {
    // Query a single row with all required columns to verify they exist
    const { error } = await supabase
      .from('sailing_events')
      .select('id, status_reason, status_source, status_updated_at, previous_status')
      .limit(1);

    if (error) {
      // Check if error is about missing columns
      const errorMsg = error.message.toLowerCase();
      const missingColumns = REQUIRED_RECONCILIATION_COLUMNS.filter(
        col => errorMsg.includes(col) || errorMsg.includes('column')
      );

      if (missingColumns.length > 0 || errorMsg.includes('does not exist')) {
        schemaValidationError = `[FATAL] Schema validation failed: ${error.message}. Run migration: 20251231_live_status_reconciliation.sql`;
        console.error(schemaValidationError);
        return { valid: false, error: schemaValidationError };
      }
    }

    schemaValidated = true;
    console.log('[SCHEMA] sailing_events table validated - all reconciliation columns present');
    return { valid: true };
  } catch (err) {
    // Log but don't fail - might be network issue
    console.warn('[SCHEMA] Validation check failed, proceeding with caution:', err);
    return { valid: true };
  }
}

// Types for sailing events
export interface SailingEventInput {
  // Sailing identity (natural key)
  operator_id: string;
  corridor_id: string;
  from_port: string;
  to_port: string;

  // Schedule context
  service_date: string; // YYYY-MM-DD
  departure_time: string; // e.g., '8:35 AM'

  // Observed status
  status: 'on_time' | 'delayed' | 'canceled';
  status_message?: string;

  // Source metadata
  source: string;
  observed_at: string; // ISO timestamp

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
   * - status_message should explain the inference
   */
  sailing_origin?: 'operator_removed';

  /**
   * Phase 78.1: Canonical schedule source
   *
   * THREE VALUES ONLY:
   * - 'operator_snapshot': Full-day schedule from operator (base schedule)
   * - 'operator_status': Status-only update (overlay, not base)
   * - 'template': Static fallback (only when no operator data)
   *
   * When schedule_source is 'operator_snapshot':
   * - This sailing exists in the operator's canonical daily schedule
   * - Templates MUST NOT be used for Today's schedule
   */
  schedule_source?: 'operator_snapshot' | 'operator_status' | 'template';
}

export interface WeatherSnapshot {
  wind_speed_mph: number | null;
  wind_direction_deg: number | null;
  wind_gusts_mph: number | null;
  wind_relation: 'headwind' | 'crosswind' | 'tailwind' | null;
}

export interface SailingEventRecord extends SailingEventInput, WeatherSnapshot {
  id: string;
  created_at: string;
  status_reason?: string;
  status_source?: string;
  status_updated_at?: string;
  previous_status?: string;
}

// Reconciliation result for logging
export interface ReconcileResult {
  action: 'inserted' | 'updated' | 'unchanged' | 'failed';
  previous_status?: string;
  new_status?: string;
  reason?: string;
  /**
   * Phase 49: Sailing event ID for first cancellations
   * Set when:
   * - INSERT with status='canceled'
   * - UPDATE transitioning to status='canceled'
   *
   * NOT set when:
   * - Sailing was already canceled (immutable)
   * - Sailing is on_time or delayed
   *
   * Used to trigger cancellation_operator_conditions insert.
   */
  first_cancellation_id?: string;
  /** The departure port slug (for cancellation conditions) */
  from_port?: string;
}

// Port slug mappings for corridor detection
const PORT_SLUG_MAP: Record<string, string> = {
  'woods hole': 'woods-hole',
  'vineyard haven': 'vineyard-haven',
  'oak bluffs': 'oak-bluffs',
  'hyannis': 'hyannis',
  'nantucket': 'nantucket',
};

// Corridor mappings based on port pairs
const CORRIDOR_MAP: Record<string, string> = {
  'woods-hole:vineyard-haven': 'woods-hole-vineyard-haven',
  'vineyard-haven:woods-hole': 'woods-hole-vineyard-haven',
  'woods-hole:oak-bluffs': 'woods-hole-oak-bluffs',
  'oak-bluffs:woods-hole': 'woods-hole-oak-bluffs',
  'hyannis:nantucket': 'hyannis-nantucket',
  'nantucket:hyannis': 'hyannis-nantucket',
};

// Route bearings for wind relation calculation (degrees from true north)
const ROUTE_BEARINGS: Record<string, Record<string, number>> = {
  'woods-hole': {
    'vineyard-haven': 180, // South
    'oak-bluffs': 165,     // SSE
  },
  'vineyard-haven': {
    'woods-hole': 0,       // North
    'hyannis': 45,         // NE
  },
  'oak-bluffs': {
    'woods-hole': 345,     // NNW
  },
  'hyannis': {
    'nantucket': 135,      // SE
    'vineyard-haven': 225, // SW
  },
  'nantucket': {
    'hyannis': 315,        // NW
  },
};

/**
 * Get route bearing in degrees
 */
function getRouteBearing(fromSlug: string, toSlug: string): number | null {
  return ROUTE_BEARINGS[fromSlug]?.[toSlug] ?? null;
}

/**
 * Calculate wind relation to route
 * Maps the detailed relation from sailing-risk.ts to the simplified 3-value enum for storage
 *
 * @param windDirection - Wind direction in degrees (where wind comes FROM)
 * @param routeBearing - Route bearing in degrees (direction of travel)
 * @returns 'headwind' | 'crosswind' | 'tailwind'
 */
function calculateWindRelation(
  windDirection: number,
  routeBearing: number
): 'headwind' | 'crosswind' | 'tailwind' {
  // Calculate relative angle between wind and route
  // Wind direction is where wind comes FROM
  // Route bearing is where boat is GOING
  let relativeAngle = Math.abs(windDirection - routeBearing);
  if (relativeAngle > 180) {
    relativeAngle = 360 - relativeAngle;
  }

  // Headwind: wind opposing direction of travel (135-180 degrees relative)
  if (relativeAngle >= 135) {
    return 'headwind';
  }

  // Tailwind: wind in same direction as travel (0-45 degrees relative)
  if (relativeAngle <= 45) {
    return 'tailwind';
  }

  // Crosswind: wind perpendicular to travel (45-135 degrees relative)
  return 'crosswind';
}

/**
 * Normalize port name to slug
 */
export function normalizePortSlug(portName: string): string {
  const lower = portName.toLowerCase().trim();
  return PORT_SLUG_MAP[lower] || lower.replace(/\s+/g, '-');
}

/**
 * Determine corridor ID from port pair
 */
export function getCorridorId(fromPort: string, toPort: string): string {
  const fromSlug = normalizePortSlug(fromPort);
  const toSlug = normalizePortSlug(toPort);
  const key = `${fromSlug}:${toSlug}`;
  return CORRIDOR_MAP[key] || `${fromSlug}-${toSlug}`;
}

/**
 * Fetch current weather for event context
 * Returns null on failure (graceful degradation)
 *
 * Phase 28: Now also computes wind_relation based on route direction
 *
 * @param fromSlug - Origin port slug
 * @param toSlug - Destination port slug
 */
async function getWeatherSnapshot(
  fromSlug: string,
  toSlug: string
): Promise<WeatherSnapshot> {
  try {
    const weather = await fetchCurrentWeather(fromSlug);

    // Compute wind relation if we have wind direction and route bearing
    let windRelation: 'headwind' | 'crosswind' | 'tailwind' | null = null;
    const routeBearing = getRouteBearing(fromSlug, toSlug);

    if (weather.wind_direction !== undefined && routeBearing !== null) {
      windRelation = calculateWindRelation(weather.wind_direction, routeBearing);
    }

    return {
      wind_speed_mph: weather.wind_speed ?? null,
      wind_direction_deg: weather.wind_direction ?? null,
      wind_gusts_mph: weather.wind_gusts ?? null,
      wind_relation: windRelation,
    };
  } catch (error) {
    if (error instanceof WeatherFetchError) {
      console.warn(`[EVENTS] Weather fetch failed (${error.code}): ${error.message}`);
    } else {
      console.warn('[EVENTS] Weather fetch failed:', error);
    }
    // Return nulls - weather is optional for event logging
    return {
      wind_speed_mph: null,
      wind_direction_deg: null,
      wind_gusts_mph: null,
      wind_relation: null,
    };
  }
}

/**
 * Build natural key for a sailing event (used for upsert)
 */
function buildNaturalKey(event: SailingEventInput) {
  return {
    operator_id: event.operator_id,
    corridor_id: event.corridor_id,
    service_date: event.service_date,
    departure_time: event.departure_time,
    from_port: event.from_port,
    to_port: event.to_port,
  };
}

/**
 * Persist or reconcile a sailing event in the database
 *
 * Phase 42: IMMUTABLE CANCELLATION PERSISTENCE
 *
 * ABSOLUTE RULES:
 * 1. Once a sailing is marked canceled in DB: NEVER delete, NEVER revert to on_time, NEVER clear status_reason
 * 2. If a sailing disappears from SSA pages: DO NOTHING (DB remains authoritative)
 * 3. Only UPDATE when: existing.status != scraped.status AND the transition is ALLOWED
 *
 * ALLOWED TRANSITIONS:
 * - on_time → canceled ✓
 * - on_time → delayed ✓
 * - delayed → canceled ✓
 * - canceled → * ✗ (NEVER - cancellation is permanent)
 * - * → on_time ✗ when existing is canceled (NEVER revert cancellation)
 *
 * REASON PRESERVATION:
 * - Never overwrite a non-empty status_reason with empty/null
 * - Only enrich empty reason with new reason
 *
 * @param event - The sailing event to persist/reconcile
 * @returns ReconcileResult with action taken
 */
export async function reconcileSailingEvent(event: SailingEventInput): Promise<ReconcileResult> {
  const supabase = createServerClient();

  if (!supabase) {
    console.error('[RECONCILE] ABORTED - Supabase client is null');
    return { action: 'failed', reason: 'No database connection' };
  }

  // Phase 37: Validate schema before any reconciliation
  const schemaCheck = await validateSchema();
  if (!schemaCheck.valid) {
    console.error('[RECONCILE] ABORTED - Schema validation failed');
    return { action: 'failed', reason: schemaCheck.error || 'Schema validation failed' };
  }

  try {
    const naturalKey = buildNaturalKey(event);

    // Step 1: Check if sailing already exists
    const { data: existing, error: selectError } = await supabase
      .from('sailing_events')
      .select('id, status, status_message, status_reason')
      .match(naturalKey)
      .maybeSingle();

    if (selectError) {
      console.error('[RECONCILE] SELECT failed:', selectError);
      return { action: 'failed', reason: selectError.message };
    }

    // Step 2: Determine action with IMMUTABLE RULES
    if (existing) {
      // ============================================================
      // PHASE 42: IMMUTABLE CANCELLATION RULES
      // ============================================================

      // RULE 1: NEVER revert from canceled
      if (existing.status === 'canceled') {
        // Cancellation is PERMANENT - never change status
        console.log(
          `[RECONCILE] IMMUTABLE: ${event.from_port} → ${event.to_port} @ ${event.departure_time} ` +
          `is CANCELED in DB - ignoring incoming status=${event.status}`
        );

        // RULE 2: Enrich reason if we have a new one and existing is empty
        const existingReason = existing.status_reason || existing.status_message || '';
        const newReason = event.status_message || '';

        if (!existingReason.trim() && newReason.trim()) {
          // Enrich with new reason (but keep status as canceled)
          console.log(`[RECONCILE] Enriching canceled sailing with reason: ${newReason}`);

          // Phase 80.1: Also backfill schedule_source if missing
          const enrichScheduleSource = event.schedule_source || 'operator_snapshot';

          const { error: enrichError } = await supabase
            .from('sailing_events')
            .update({
              status_reason: newReason,
              status_message: newReason,
              observed_at: event.observed_at,
              source: event.source,
              // Phase 80.1: Backfill schedule_source
              schedule_source: enrichScheduleSource,
            })
            .eq('id', existing.id);

          if (enrichError) {
            console.error('[RECONCILE] ENRICH failed:', enrichError);
          } else {
            console.log(`[RECONCILE] ENRICHED: reason added to canceled sailing`);
          }
        }

        // Return unchanged (status didn't change, just possibly enriched reason)
        return { action: 'unchanged', new_status: 'canceled' };
      }

      // RULE 3: Never revert TO on_time from canceled (handled above)
      // RULE 4: Allow transitions: on_time→canceled, on_time→delayed, delayed→canceled

      // Same status - no change needed
      if (existing.status === event.status) {
        // Check if we can enrich the reason
        const existingReason = existing.status_reason || existing.status_message || '';
        const newReason = event.status_message || '';

        if (!existingReason.trim() && newReason.trim()) {
          console.log(`[RECONCILE] Enriching ${event.status} sailing with reason: ${newReason}`);

          // Phase 80.1: Also backfill schedule_source if missing
          const enrichScheduleSource = event.schedule_source || 'operator_snapshot';

          const { error: enrichError } = await supabase
            .from('sailing_events')
            .update({
              status_reason: newReason,
              status_message: newReason,
              observed_at: event.observed_at,
              // Phase 80.1: Backfill schedule_source
              schedule_source: enrichScheduleSource,
            })
            .eq('id', existing.id);

          if (enrichError) {
            console.error('[RECONCILE] ENRICH failed:', enrichError);
          }
        }

        console.log(
          `[RECONCILE] UNCHANGED: ${event.from_port} → ${event.to_port} @ ${event.departure_time} = ${event.status}`
        );
        return { action: 'unchanged', new_status: event.status };
      }

      // Status changed - check if transition is allowed
      const isAllowedTransition =
        // on_time → canceled
        (existing.status === 'on_time' && event.status === 'canceled') ||
        // on_time → delayed
        (existing.status === 'on_time' && event.status === 'delayed') ||
        // delayed → canceled
        (existing.status === 'delayed' && event.status === 'canceled');

      if (!isAllowedTransition) {
        console.warn(
          `[RECONCILE] BLOCKED: Transition ${existing.status} → ${event.status} not allowed. ` +
          `Sailing: ${event.from_port} → ${event.to_port} @ ${event.departure_time}`
        );
        return { action: 'unchanged', new_status: existing.status };
      }

      // Allowed transition - UPDATE with reconciliation
      console.log(
        `[RECONCILE] Status changed: ${existing.status} → ${event.status}`
      );
      console.log(
        `[RECONCILE] Reason: ${event.status_message || 'No reason provided'}`
      );

      // Fetch weather for update
      const weather = await getWeatherSnapshot(event.from_port, event.to_port);

      // RULE 5: Never clear existing reason
      const existingReason = existing.status_reason || existing.status_message || '';
      const newReason = event.status_message || '';
      const finalReason = newReason.trim() ? newReason : existingReason;

      // Phase 80.1: Also update schedule_source if provided (backfill NULL values)
      const updateScheduleSource = event.schedule_source || 'operator_snapshot';

      const { error: updateError } = await supabase
        .from('sailing_events')
        .update({
          status: event.status,
          status_message: finalReason || null,
          status_reason: finalReason || null,
          status_source: 'operator',
          status_updated_at: new Date().toISOString(),
          previous_status: existing.status,
          observed_at: event.observed_at,
          source: event.source,
          // Update weather snapshot
          wind_speed_mph: weather.wind_speed_mph,
          wind_direction_deg: weather.wind_direction_deg,
          wind_gusts_mph: weather.wind_gusts_mph,
          wind_relation: weather.wind_relation,
          // Phase 80.1: Ensure schedule_source is set (backfill NULL)
          schedule_source: updateScheduleSource,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[RECONCILE] UPDATE failed:', updateError);
        return { action: 'failed', reason: updateError.message };
      }

      console.log(
        `[RECONCILE] UPDATED: ${event.from_port} → ${event.to_port} @ ${event.departure_time}: ${existing.status} → ${event.status}`
      );

      // Phase 49: If transitioning TO canceled, this is a first cancellation
      const result: ReconcileResult = {
        action: 'updated',
        previous_status: existing.status,
        new_status: event.status,
        reason: finalReason,
      };

      if (event.status === 'canceled') {
        result.first_cancellation_id = existing.id;
        result.from_port = event.from_port;
        console.log(
          `[RECONCILE] Phase 49: First cancellation detected (UPDATE), ` +
          `sailing_event_id=${existing.id} from_port=${event.from_port}`
        );
      }

      return result;
    }

    // Step 3: No existing row - INSERT
    const weather = await getWeatherSnapshot(event.from_port, event.to_port);

    // ============================================================
    // PHASE 80.1: HARD GUARD - schedule_source MUST NOT be NULL
    // ============================================================
    // If schedule_source is missing, default to 'operator_snapshot' for operator data.
    // This ensures Phase 77/78 authority detection always works.
    let finalScheduleSource = event.schedule_source;
    if (!finalScheduleSource) {
      console.error(
        `[RECONCILE] PHASE 80.1 GUARD: schedule_source is NULL for ` +
        `${event.from_port} → ${event.to_port} @ ${event.departure_time}. ` +
        `Defaulting to 'operator_snapshot'. Fix the upstream caller!`
      );
      finalScheduleSource = 'operator_snapshot';
    }

    const record = {
      ...naturalKey,
      status: event.status,
      status_message: event.status_message || null,
      status_reason: event.status_message || null,
      status_source: 'operator',
      wind_speed_mph: weather.wind_speed_mph,
      wind_direction_deg: weather.wind_direction_deg,
      wind_gusts_mph: weather.wind_gusts_mph,
      wind_relation: weather.wind_relation,
      source: event.source,
      observed_at: event.observed_at,
      // Phase 74: Track removed sailings origin
      sailing_origin: event.sailing_origin || null,
      // Phase 78 + 80.1: Track schedule source (NEVER NULL for operator data)
      schedule_source: finalScheduleSource,
    };

    const { data: insertedData, error: insertError } = await supabase
      .from('sailing_events')
      .insert(record)
      .select('id')
      .single();

    if (insertError) {
      // Handle unique constraint violation (concurrent insert)
      if (insertError.code === '23505') {
        console.log('[RECONCILE] Concurrent insert detected, retrying as update...');
        // Retry as reconcile (another process inserted first)
        return reconcileSailingEvent(event);
      }
      console.error('[RECONCILE] INSERT failed:', insertError);
      return { action: 'failed', reason: insertError.message };
    }

    console.log(
      `[RECONCILE] INSERTED: ${event.from_port} → ${event.to_port} @ ${event.departure_time} = ${event.status}`
    );

    // Phase 49: If inserting with status='canceled', this is a first cancellation
    const result: ReconcileResult = { action: 'inserted', new_status: event.status };

    if (event.status === 'canceled' && insertedData?.id) {
      result.first_cancellation_id = insertedData.id;
      result.from_port = event.from_port;
      console.log(
        `[RECONCILE] Phase 49: First cancellation detected (INSERT), ` +
        `sailing_event_id=${insertedData.id} from_port=${event.from_port}`
      );
    }

    return result;
  } catch (error) {
    console.error('[RECONCILE] Unexpected error:', error);
    return { action: 'failed', reason: String(error) };
  }
}

/**
 * Persist a sailing event to the database (legacy interface - wraps reconcile)
 *
 * @param event - The sailing event to persist
 * @returns true if persisted successfully, false otherwise
 */
export async function persistSailingEvent(event: SailingEventInput): Promise<boolean> {
  const result = await reconcileSailingEvent(event);
  return result.action !== 'failed';
}

/**
 * Persist multiple sailing events (batch operation with reconciliation)
 *
 * @param events - Array of sailing events to persist
 * @returns Summary of reconciliation actions
 */
export async function persistSailingEvents(events: SailingEventInput[]): Promise<number> {
  let successCount = 0;
  const results: ReconcileResult[] = [];

  // Process events sequentially to avoid overwhelming the weather API
  for (const event of events) {
    const result = await reconcileSailingEvent(event);
    results.push(result);
    if (result.action !== 'failed') {
      successCount++;
    }
  }

  // Log summary
  const inserted = results.filter((r) => r.action === 'inserted').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const unchanged = results.filter((r) => r.action === 'unchanged').length;
  const failed = results.filter((r) => r.action === 'failed').length;

  console.log(
    `[RECONCILE] Batch complete: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged, ${failed} failed`
  );

  return successCount;
}

/**
 * Get the latest status for a sailing from the database
 * Used by UI to prioritize operator status
 *
 * @param naturalKey - The sailing identity
 * @returns Latest status or null if not found
 */
export async function getLatestSailingStatus(naturalKey: {
  operator_id: string;
  corridor_id: string;
  service_date: string;
  departure_time: string;
  from_port: string;
  to_port: string;
}): Promise<{
  status: string;
  status_reason: string | null;
  status_source: string | null;
  status_updated_at: string | null;
} | null> {
  const supabase = createServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('sailing_events')
    .select('status, status_reason, status_source, status_updated_at')
    .match(naturalKey)
    .maybeSingle();

  if (error || !data) return null;

  return {
    status: data.status,
    status_reason: data.status_reason,
    status_source: data.status_source,
    status_updated_at: data.status_updated_at,
  };
}

/**
 * Helper to map operator source to operator_id
 */
export function mapOperatorId(source: string): string {
  const sourceMap: Record<string, string> = {
    steamship_authority: 'ssa',
    ssa: 'ssa',
    'hy-line': 'hy-line-cruises',
    hyline: 'hy-line-cruises',
  };

  const lower = source.toLowerCase();
  return sourceMap[lower] || lower;
}

/**
 * PHASE 80.2: Get all operator ID aliases for DB queries
 *
 * DB may contain rows with different operator_id formats due to historical
 * ingestion variations. This function returns all known aliases for a given
 * operator to ensure we find all rows.
 *
 * @param operatorId - Primary operator ID
 * @returns Array of all known aliases including the input
 */
export function getOperatorIdAliases(operatorId: string): string[] {
  const aliasMap: Record<string, string[]> = {
    'ssa': ['ssa', 'steamship-authority', 'steamship_authority'],
    'steamship-authority': ['ssa', 'steamship-authority', 'steamship_authority'],
    'steamship_authority': ['ssa', 'steamship-authority', 'steamship_authority'],
    'hy-line-cruises': ['hy-line-cruises', 'hy-line', 'hyline'],
    'hy-line': ['hy-line-cruises', 'hy-line', 'hyline'],
    'hyline': ['hy-line-cruises', 'hy-line', 'hyline'],
  };

  const lower = operatorId.toLowerCase();
  return aliasMap[lower] || [operatorId];
}

// ============================================================
// PHASE 48: CANONICAL OVERLAY LOADER
// ============================================================

/**
 * Persisted sailing status from Supabase
 */
export interface PersistedStatus {
  status: 'on_time' | 'delayed' | 'canceled';
  status_reason: string | null;
  observed_at: string;
  source: string;
  /**
   * Phase 74: Origin marker for removed sailings
   *
   * - 'operator_removed': Sailing was in the full schedule but NOT in the active list
   *   (SSA removes canceled sailings instead of marking them as canceled)
   * - null/undefined: Normal sailing from operator scrape
   */
  sailing_origin?: 'operator_removed' | null;
}

/**
 * Normalize time to canonical format for key matching.
 * Handles both 12-hour ("8:35 AM") and 24-hour ("08:35:00") formats.
 * Output: "8:35am" (no leading zeros, lowercase am/pm)
 */
function normalizeTime(time: string): string {
  // Check if it's 24-hour format (HH:MM:SS or HH:MM)
  const time24Match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (time24Match) {
    const hour = parseInt(time24Match[1], 10);
    const minute = time24Match[2];

    if (hour === 0) {
      return `12:${minute}am`;
    } else if (hour < 12) {
      return `${hour}:${minute}am`;
    } else if (hour === 12) {
      return `12:${minute}pm`;
    } else {
      return `${hour - 12}:${minute}pm`;
    }
  }

  // Handle 12-hour format: "8:35 AM" -> "8:35am"
  return time.toLowerCase().replace(/\s+/g, '');
}

/**
 * Generate a unique key for a sailing based on route and departure time.
 *
 * PHASE 73: This function is ONLY for operator-sourced sailings.
 * Template sailings MUST NOT use key-based matching because template
 * times are not stable enough to guarantee key consistency.
 *
 * @param fromPort - Origin port slug or name
 * @param toPort - Destination port slug or name
 * @param departureTime - Departure time in any format (12-hour or 24-hour)
 * @param scheduleSource - OPTIONAL: If provided and is 'template', throws in dev mode
 */
export function generateSailingKey(
  fromPort: string,
  toPort: string,
  departureTime: string,
  scheduleSource?: string
): string {
  // PHASE 73: Dev assertion - templates should NEVER use key matching
  if (
    process.env.NODE_ENV === 'development' &&
    scheduleSource &&
    (scheduleSource === 'template' || scheduleSource === 'forecast_template')
  ) {
    throw new Error(
      `[PHASE 73 VIOLATION] generateSailingKey called with template sailing. ` +
      `Templates must not participate in key-based overlay matching. ` +
      `from=${fromPort}, to=${toPort}, time=${departureTime}, source=${scheduleSource}`
    );
  }

  const normalizedTime = normalizeTime(departureTime);
  const fromSlug = normalizePortSlug(fromPort);
  const toSlug = normalizePortSlug(toPort);
  return `${fromSlug}|${toSlug}|${normalizedTime}`;
}

/**
 * PHASE 48: Load authoritative status overlay from Supabase
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR SAILING STATUS.
 *
 * Queries ferry_forecast.sailing_events and returns ALL sailings
 * for the given operator and service date. Cancellations are ALWAYS
 * included - they are the entire point of this function.
 *
 * INVARIANT: If a sailing has status='canceled' in Supabase,
 * it MUST appear in the returned Map with status='canceled'.
 *
 * @param operatorId - Operator ID (e.g., 'ssa', 'hy-line-cruises')
 * @param serviceDate - Service date in YYYY-MM-DD format
 * @returns Map keyed by (from_port|to_port|departure_time), values are PersistedStatus
 */
export async function loadAuthoritativeStatusOverlay(
  operatorId: string,
  serviceDate: string
): Promise<Map<string, PersistedStatus>> {
  const supabase = createServerClient();
  const result = new Map<string, PersistedStatus>();

  if (!supabase) {
    console.warn('[OVERLAY] No Supabase client - returning empty overlay');
    return result;
  }

  try {
    // Query ALL sailing events for this operator and date
    // Order by observed_at DESC so we get the most recent status first
    const { data, error } = await supabase
      .from('sailing_events')
      .select('from_port, to_port, departure_time, status, status_reason, status_message, observed_at, source')
      .eq('operator_id', operatorId)
      .eq('service_date', serviceDate)
      .order('observed_at', { ascending: false });

    if (error) {
      console.error('[OVERLAY] Database query failed:', error);
      return result;
    }

    if (!data || data.length === 0) {
      console.log(`[OVERLAY] No sailing events for operator=${operatorId} date=${serviceDate}`);
      return result;
    }

    // Build the Map with sticky cancellation logic
    // If we see multiple observations for the same sailing, cancellations are sticky
    for (const row of data) {
      const key = generateSailingKey(row.from_port, row.to_port, row.departure_time);
      const existing = result.get(key);

      // Status from this row
      const status = row.status as 'on_time' | 'delayed' | 'canceled';
      const statusReason = row.status_reason || row.status_message || null;

      if (!existing) {
        // First observation for this sailing
        result.set(key, {
          status,
          status_reason: statusReason,
          observed_at: row.observed_at,
          source: row.source,
        });
      } else if (status === 'canceled' && existing.status !== 'canceled') {
        // STICKY CANCELLATION: If this observation shows canceled but existing doesn't,
        // use the canceled status (cancellations are immutable)
        result.set(key, {
          status: 'canceled',
          status_reason: statusReason || existing.status_reason,
          observed_at: row.observed_at,
          source: row.source,
        });
      }
      // Otherwise keep existing (most recent non-canceled, or already canceled)
    }

    // Phase 48: Enhanced logging for debugging overlay issues
    const canceledCount = Array.from(result.values()).filter(s => s.status === 'canceled').length;
    console.log(
      `[OVERLAY] Loaded ${result.size} sailing statuses for operator=${operatorId} date=${serviceDate}, ` +
      `canceled=${canceledCount}`
    );

    // Log all keys for debugging key mismatch issues
    if (result.size > 0) {
      console.log('[OVERLAY] Keys in overlay:', Array.from(result.keys()).slice(0, 10).join(', '));
    }

    // Log canceled sailings specifically for debugging
    if (canceledCount > 0) {
      const canceledKeys = Array.from(result.entries())
        .filter(([, v]) => v.status === 'canceled')
        .map(([k]) => k);
      console.log('[OVERLAY] Canceled sailing keys:', canceledKeys.join(', '));
    }

    return result;
  } catch (err) {
    console.error('[OVERLAY] Exception loading status overlay:', err);
    return result;
  }
}

/**
 * Get the count of canceled sailings in the overlay
 * Used for regression guard validation
 */
export function countCanceledInOverlay(overlay: Map<string, PersistedStatus>): number {
  let count = 0;
  for (const status of overlay.values()) {
    if (status.status === 'canceled') {
      count++;
    }
  }
  return count;
}

// ============================================================
// PHASE 48.1: RAW OVERLAY LOADER FOR SYNTHETIC SAILING CREATION
// ============================================================

/**
 * Raw sailing event record from Supabase with full port info
 * Used for creating synthetic sailings when DB has cancellations not in schedule
 *
 * Phase 74: Added sailing_origin for tracking removed sailings
 */
export interface RawSailingEvent {
  from_port: string;
  to_port: string;
  departure_time: string;  // 24-hour format from DB (e.g., "05:45:00")
  status: 'on_time' | 'delayed' | 'canceled';
  status_reason: string | null;
  status_message: string | null;
  observed_at: string;
  source: string;
  /**
   * Phase 74: Origin marker for removed sailings
   *
   * - 'operator_removed': Sailing was in the full schedule but NOT in the active list
   *   (SSA removes canceled sailings instead of marking them as canceled)
   * - null/undefined: Normal sailing from operator scrape
   */
  sailing_origin?: 'operator_removed' | null;
}

/**
 * Extended overlay that includes raw data for synthetic sailing creation
 */
export interface ExtendedStatusOverlay {
  /** Map of normalized key to status (for matching) */
  statusMap: Map<string, PersistedStatus>;
  /** Raw records for creating synthetic sailings */
  rawRecords: RawSailingEvent[];
  /** Count of canceled sailings (for guard) */
  canceledCount: number;
}

/**
 * PHASE 48.1: Load overlay with raw records for full union support
 *
 * Returns both the key-based map (for matching schedule sailings)
 * and raw records (for creating synthetic sailings from DB-only cancellations).
 *
 * @param operatorId - Operator ID (e.g., 'ssa', 'hy-line-cruises')
 * @param serviceDate - Service date in YYYY-MM-DD format
 */
export async function loadExtendedStatusOverlay(
  operatorId: string,
  serviceDate: string
): Promise<ExtendedStatusOverlay> {
  const supabase = createServerClient();
  const result: ExtendedStatusOverlay = {
    statusMap: new Map(),
    rawRecords: [],
    canceledCount: 0,
  };

  if (!supabase) {
    console.warn('[OVERLAY_EXT] No Supabase client - returning empty overlay');
    return result;
  }

  // Phase 80: Log service date being queried for debugging date drift issues
  const utcDate = new Date().toISOString().slice(0, 10);
  if (utcDate !== serviceDate) {
    console.log(
      `[PHASE80] Overlay query: UTC=${utcDate} serviceDate=${serviceDate} operator=${operatorId}. ` +
      `Using provided serviceDate (correct).`
    );
  }

  try {
    // Query ALL sailing events for this operator and date
    // Phase 74: Include sailing_origin for removed sailing detection
    const { data, error } = await supabase
      .from('sailing_events')
      .select('from_port, to_port, departure_time, status, status_reason, status_message, observed_at, source, sailing_origin')
      .eq('operator_id', operatorId)
      .eq('service_date', serviceDate)
      .order('observed_at', { ascending: false });

    if (error) {
      console.error('[OVERLAY_EXT] Database query failed:', error);
      return result;
    }

    if (!data || data.length === 0) {
      console.log(`[OVERLAY_EXT] No sailing events for operator=${operatorId} date=${serviceDate}`);
      return result;
    }

    // Process records: build map and collect raw records (dedupe by key)
    const seenKeys = new Set<string>();

    for (const row of data) {
      const key = generateSailingKey(row.from_port, row.to_port, row.departure_time);
      const status = row.status as 'on_time' | 'delayed' | 'canceled';
      const statusReason = row.status_reason || row.status_message || null;

      // Build the status map (same logic as loadAuthoritativeStatusOverlay)
      const existing = result.statusMap.get(key);
      if (!existing) {
        result.statusMap.set(key, {
          status,
          status_reason: statusReason,
          observed_at: row.observed_at,
          source: row.source,
        });
      } else if (status === 'canceled' && existing.status !== 'canceled') {
        result.statusMap.set(key, {
          status: 'canceled',
          status_reason: statusReason || existing.status_reason,
          observed_at: row.observed_at,
          source: row.source,
        });
      }

      // Collect raw records (dedupe - keep first per key which is most recent)
      // Phase 74: Include sailing_origin for removed sailing detection
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.rawRecords.push({
          from_port: row.from_port,
          to_port: row.to_port,
          departure_time: row.departure_time,
          status,
          status_reason: row.status_reason,
          status_message: row.status_message,
          observed_at: row.observed_at,
          source: row.source,
          sailing_origin: row.sailing_origin || null,
        });
      }
    }

    // Count canceled sailings
    result.canceledCount = Array.from(result.statusMap.values())
      .filter(s => s.status === 'canceled').length;

    console.log(
      `[OVERLAY_EXT] Loaded ${result.statusMap.size} statuses, ${result.rawRecords.length} raw records, ` +
      `${result.canceledCount} canceled for operator=${operatorId} date=${serviceDate}`
    );

    return result;
  } catch (err) {
    console.error('[OVERLAY_EXT] Exception loading extended overlay:', err);
    return result;
  }
}

// ============================================================
// PHASE 77: OPERATOR SCHEDULE AUTHORITY CHECK
// ============================================================

/**
 * Result of hasOperatorSchedule check
 */
export interface OperatorScheduleCheck {
  /** True if observer-ingested sailings exist for this corridor/date */
  hasSchedule: boolean;
  /** Count of sailings found */
  sailingCount: number;
  /** Distinct departure times found (for audit) */
  distinctTimes: string[];
  /** Source of the data (for debug) */
  source: 'supabase_sailing_events';
}

/**
 * PHASE 77: Check if operator has ingested sailing data for a corridor/date
 *
 * This is the AUTHORITY CHECK that determines whether Today's schedule should
 * use operator data (hasSchedule === true) or fall back to templates.
 *
 * CRITICAL RULE: If this returns true, templates MUST NOT be used.
 *
 * @param operatorId - Operator ID (e.g., 'ssa', 'hy-line-cruises')
 * @param corridorId - Corridor ID (e.g., 'woods-hole-vineyard-haven')
 * @param serviceDate - Service date in YYYY-MM-DD format
 * @returns OperatorScheduleCheck with hasSchedule boolean and audit info
 */
export async function hasOperatorSchedule(
  operatorId: string,
  corridorId: string,
  serviceDate: string
): Promise<OperatorScheduleCheck> {
  const result: OperatorScheduleCheck = {
    hasSchedule: false,
    sailingCount: 0,
    distinctTimes: [],
    source: 'supabase_sailing_events',
  };

  const supabase = createServerClient();
  if (!supabase) {
    console.warn('[PHASE77] No Supabase client - hasOperatorSchedule returns false');
    return result;
  }

  try {
    // Get the corridor terminals to filter sailings
    const corridorTerminals = getCorridorTerminalSlugs(corridorId);
    if (!corridorTerminals) {
      console.warn(`[PHASE77] Unknown corridor: ${corridorId}`);
      return result;
    }

    // Query sailing_events for this operator and date
    // We need to filter by ports that belong to this corridor
    const { data, error } = await supabase
      .from('sailing_events')
      .select('from_port, to_port, departure_time')
      .eq('operator_id', operatorId)
      .eq('service_date', serviceDate);

    if (error) {
      console.error('[PHASE77] Database query failed:', error);
      return result;
    }

    if (!data || data.length === 0) {
      console.log(
        `[PHASE77] No sailing events for operator=${operatorId} corridor=${corridorId} date=${serviceDate}`
      );
      return result;
    }

    // Filter to only sailings that belong to this corridor
    const corridorSailings = data.filter((row) => {
      const fromSlug = normalizePortSlug(row.from_port);
      const toSlug = normalizePortSlug(row.to_port);
      return (
        corridorTerminals.includes(fromSlug) && corridorTerminals.includes(toSlug)
      );
    });

    if (corridorSailings.length === 0) {
      console.log(
        `[PHASE77] No sailings for corridor=${corridorId} in operator=${operatorId} data (${data.length} total rows)`
      );
      return result;
    }

    // Collect distinct departure times for audit
    const distinctTimes = new Set<string>();
    for (const sailing of corridorSailings) {
      distinctTimes.add(sailing.departure_time);
    }

    result.hasSchedule = true;
    result.sailingCount = corridorSailings.length;
    result.distinctTimes = Array.from(distinctTimes).sort();

    console.log(
      `[PHASE77] Operator schedule EXISTS: operator=${operatorId} corridor=${corridorId} ` +
      `date=${serviceDate} sailings=${result.sailingCount} times=${result.distinctTimes.length}`
    );

    return result;
  } catch (err) {
    console.error('[PHASE77] Exception in hasOperatorSchedule:', err);
    return result;
  }
}

/**
 * Get terminal slugs for a corridor (for filtering)
 */
function getCorridorTerminalSlugs(corridorId: string): string[] | null {
  // Map corridor IDs to their terminal pairs
  const corridorTerminals: Record<string, string[]> = {
    'woods-hole-vineyard-haven': ['woods-hole', 'vineyard-haven'],
    'woods-hole-oak-bluffs': ['woods-hole', 'oak-bluffs'],
    'hyannis-nantucket': ['hyannis', 'nantucket'],
  };

  return corridorTerminals[corridorId] || null;
}

// ============================================================
// PHASE 78: LOAD OPERATOR SCHEDULE FROM DATABASE
// ============================================================

/**
 * Sailing row from database for base schedule construction
 *
 * Phase 78.1: schedule_source uses canonical enum
 */
export interface OperatorScheduleSailing {
  from_port: string;
  to_port: string;
  departure_time: string;  // 24-hour format from DB (e.g., "05:45:00")
  status: 'on_time' | 'delayed' | 'canceled';
  status_reason: string | null;
  status_message: string | null;
  observed_at: string;
  source: string;
  sailing_origin: 'operator_removed' | null;
  schedule_source: 'operator_snapshot' | 'operator_status' | 'template' | null;
}

/**
 * Result of loading operator schedule
 */
export interface OperatorScheduleResult {
  /** True if operator-sourced sailings exist for this date */
  hasSchedule: boolean;
  /** All sailings from the operator for this date */
  sailings: OperatorScheduleSailing[];
  /** Count of sailings */
  sailingCount: number;
  /** Count of distinct departure times */
  distinctTimes: number;
}

/**
 * PHASE 78 + 80.2: Load operator's base schedule from sailing_events
 *
 * This function loads ALL sailings for an operator/date combination.
 * When sailings exist, they form the BASE SCHEDULE (not an overlay).
 * Templates should NOT be used when this returns sailings.
 *
 * PHASE 80.2: Uses operator ID aliases to handle historical variations
 * (e.g., 'ssa' vs 'steamship-authority' vs 'steamship_authority')
 *
 * @param operatorId - Operator ID (e.g., 'ssa')
 * @param serviceDate - Service date in YYYY-MM-DD format
 * @param corridorId - Optional corridor ID to filter results
 * @returns OperatorScheduleResult with hasSchedule flag and sailings array
 */
export async function loadOperatorSchedule(
  operatorId: string,
  serviceDate: string,
  corridorId?: string
): Promise<OperatorScheduleResult> {
  const result: OperatorScheduleResult = {
    hasSchedule: false,
    sailings: [],
    sailingCount: 0,
    distinctTimes: 0,
  };

  const supabase = createServerClient();
  if (!supabase) {
    console.warn('[PHASE80.2] No Supabase client - loadOperatorSchedule returns empty');
    return result;
  }

  // PHASE 80.2: Get all operator ID aliases for robust querying
  const operatorAliases = getOperatorIdAliases(operatorId);
  console.log(`[PHASE80.2] loadOperatorSchedule: operator=${operatorId} aliases=[${operatorAliases.join(',')}] date=${serviceDate} corridor=${corridorId || 'all'}`);

  try {
    // Query ALL sailing events for this operator (using aliases) and date
    // PHASE 80.2: Use .in() to match any operator ID alias
    const { data, error } = await supabase
      .from('sailing_events')
      .select('from_port, to_port, departure_time, status, status_reason, status_message, observed_at, source, sailing_origin, schedule_source, operator_id')
      .in('operator_id', operatorAliases)
      .eq('service_date', serviceDate)
      .order('departure_time', { ascending: true });

    if (error) {
      console.error('[PHASE80.2] Database query failed:', error);
      return result;
    }

    if (!data || data.length === 0) {
      console.log(`[PHASE80.2] No sailing events for operator=${operatorId} aliases=[${operatorAliases.join(',')}] date=${serviceDate}`);
      return result;
    }

    // PHASE 80.2: Log which operator_id values were found in DB
    const foundOperatorIds = [...new Set(data.map(r => r.operator_id))];
    console.log(`[PHASE80.2] Found ${data.length} rows with operator_ids: [${foundOperatorIds.join(',')}]`);

    // Filter by corridor if specified
    let filteredData = data;
    if (corridorId) {
      const corridorTerminals = getCorridorTerminalSlugs(corridorId);
      if (corridorTerminals) {
        filteredData = data.filter((row) => {
          const fromSlug = normalizePortSlug(row.from_port);
          const toSlug = normalizePortSlug(row.to_port);
          return corridorTerminals.includes(fromSlug) && corridorTerminals.includes(toSlug);
        });
      }
    }

    if (filteredData.length === 0) {
      console.log(`[PHASE80.2] No sailings for corridor=${corridorId} in operator=${operatorId} data (${data.length} rows didn't match corridor)`);
      return result;
    }

    // Phase 78.1: Deduplicate by key with canonical priority
    // Priority: operator_snapshot > operator_status > canceled status
    const sailingMap = new Map<string, OperatorScheduleSailing>();
    for (const row of filteredData) {
      const key = generateSailingKey(row.from_port, row.to_port, row.departure_time);
      const existing = sailingMap.get(key);

      // Keep the row with schedule_source='operator_snapshot' if it exists,
      // otherwise prefer canceled status, otherwise keep first seen
      const shouldReplace = !existing ||
          (row.schedule_source === 'operator_snapshot' && existing.schedule_source !== 'operator_snapshot') ||
          (row.status === 'canceled' && existing.status !== 'canceled');

      if (shouldReplace) {
        sailingMap.set(key, {
          from_port: row.from_port,
          to_port: row.to_port,
          departure_time: row.departure_time,
          status: row.status as 'on_time' | 'delayed' | 'canceled',
          status_reason: row.status_reason,
          status_message: row.status_message,
          observed_at: row.observed_at,
          source: row.source,
          sailing_origin: row.sailing_origin || null,
          schedule_source: row.schedule_source || null,
        });
      }
    }

    // Convert to array and sort by departure time
    const sailings = Array.from(sailingMap.values()).sort((a, b) =>
      a.departure_time.localeCompare(b.departure_time)
    );

    // Count distinct departure times
    const distinctTimes = new Set(sailings.map(s => s.departure_time)).size;

    result.hasSchedule = sailings.length > 0;
    result.sailings = sailings;
    result.sailingCount = sailings.length;
    result.distinctTimes = distinctTimes;

    console.log(
      `[PHASE78] Loaded operator schedule: operator=${operatorId} corridor=${corridorId || 'all'} ` +
      `date=${serviceDate} sailings=${result.sailingCount} distinct_times=${result.distinctTimes}`
    );

    return result;
  } catch (err) {
    console.error('[PHASE78] Exception in loadOperatorSchedule:', err);
    return result;
  }
}
