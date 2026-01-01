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

          const { error: enrichError } = await supabase
            .from('sailing_events')
            .update({
              status_reason: newReason,
              status_message: newReason,
              observed_at: event.observed_at,
              source: event.source,
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

          const { error: enrichError } = await supabase
            .from('sailing_events')
            .update({
              status_reason: newReason,
              status_message: newReason,
              observed_at: event.observed_at,
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
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[RECONCILE] UPDATE failed:', updateError);
        return { action: 'failed', reason: updateError.message };
      }

      console.log(
        `[RECONCILE] UPDATED: ${event.from_port} → ${event.to_port} @ ${event.departure_time}: ${existing.status} → ${event.status}`
      );
      return {
        action: 'updated',
        previous_status: existing.status,
        new_status: event.status,
        reason: finalReason,
      };
    }

    // Step 3: No existing row - INSERT
    const weather = await getWeatherSnapshot(event.from_port, event.to_port);

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
    };

    const { error: insertError } = await supabase.from('sailing_events').insert(record);

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
    return { action: 'inserted', new_status: event.status };
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
