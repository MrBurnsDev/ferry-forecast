/**
 * Sailing Events Persistence
 *
 * Phase 27: Persistent Sailing Event Memory
 * Phase 37: Live Operator Status Reconciliation
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
 */

import { createServerClient } from '@/lib/supabase/client';
import { fetchCurrentWeather, WeatherFetchError } from '@/lib/weather/noaa';

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
 * Phase 37: Reconciliation Logic
 * - If no existing row: INSERT
 * - If existing row with same status: SKIP (unchanged)
 * - If existing row with different status: UPDATE with audit trail
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

  try {
    const naturalKey = buildNaturalKey(event);

    // Step 1: Check if sailing already exists
    const { data: existing, error: selectError } = await supabase
      .from('sailing_events')
      .select('id, status, status_message')
      .match(naturalKey)
      .maybeSingle();

    if (selectError) {
      console.error('[RECONCILE] SELECT failed:', selectError);
      return { action: 'failed', reason: selectError.message };
    }

    // Step 2: Determine action
    if (existing) {
      // Row exists - check if status changed
      if (existing.status === event.status) {
        // No change needed
        console.log(
          `[RECONCILE] UNCHANGED: ${event.from_port} → ${event.to_port} @ ${event.departure_time} = ${event.status}`
        );
        return { action: 'unchanged', new_status: event.status };
      }

      // Status changed - UPDATE with reconciliation
      console.log(
        `[RECONCILE] Status changed: ${existing.status} → ${event.status}`
      );
      console.log(
        `[RECONCILE] Reason: ${event.status_message || 'No reason provided'}`
      );

      // Fetch weather for update
      const weather = await getWeatherSnapshot(event.from_port, event.to_port);

      const { error: updateError } = await supabase
        .from('sailing_events')
        .update({
          status: event.status,
          status_message: event.status_message || null,
          status_reason: event.status_message || null,
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
        reason: event.status_message,
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
