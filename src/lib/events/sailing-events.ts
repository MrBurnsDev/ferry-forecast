/**
 * Sailing Events Persistence
 *
 * Phase 27: Persistent Sailing Event Memory
 *
 * Append-only event log for observed sailing outcomes.
 * Used for learning and validating risk models.
 *
 * RULES:
 * - INSERT only, never UPDATE or DELETE
 * - Each observation creates a new row
 * - Weather snapshot captured at observation time
 * - Failures are logged but do NOT break UI
 */

import { createServerClient } from '@/lib/supabase/client';
import { fetchCurrentWeather, WeatherFetchError } from '@/lib/weather/noaa';

// Types for sailing events
export interface SailingEventInput {
  // Sailing identity
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
 * Persist a sailing event to the database
 *
 * @param event - The sailing event to persist
 * @returns true if persisted successfully, false otherwise
 */
export async function persistSailingEvent(event: SailingEventInput): Promise<boolean> {
  const supabase = createServerClient();

  // Diagnostic: Check if supabase client exists
  if (!supabase) {
    console.error('[PERSIST] ABORTED - Supabase client is null');
    console.error('[PERSIST] SUPABASE_URL defined:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.error('[PERSIST] SUPABASE_SERVICE_ROLE_KEY defined:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    return false;
  }

  try {
    // Fetch weather snapshot with wind relation (Phase 28)
    const weather = await getWeatherSnapshot(event.from_port, event.to_port);

    // Build the record
    const record = {
      operator_id: event.operator_id,
      corridor_id: event.corridor_id,
      from_port: event.from_port,
      to_port: event.to_port,
      service_date: event.service_date,
      departure_time: event.departure_time,
      status: event.status,
      status_message: event.status_message || null,
      wind_speed_mph: weather.wind_speed_mph,
      wind_direction_deg: weather.wind_direction_deg,
      wind_gusts_mph: weather.wind_gusts_mph,
      wind_relation: weather.wind_relation,
      source: event.source,
      observed_at: event.observed_at,
    };

    // Diagnostic: Log pre-insert state
    const tableName = 'ferry_forecast.sailing_events';
    console.log(`[PERSIST] supabase_client=true service_role_present=${!!process.env.SUPABASE_SERVICE_ROLE_KEY} table=${tableName}`);
    console.log(`[PERSIST] payload_sample=${JSON.stringify({
      operator_id: record.operator_id,
      corridor_id: record.corridor_id,
      from_port: record.from_port,
      to_port: record.to_port,
      service_date: record.service_date,
      departure_time: record.departure_time,
      status: record.status,
    })}`);

    // Insert into database
    try {
      const { error } = await supabase.from('sailing_events').insert(record);

      if (error) {
        console.error('[PERSIST] INSERT FAILED - Full error object:');
        console.error('[PERSIST]   code:', error.code);
        console.error('[PERSIST]   message:', error.message);
        console.error('[PERSIST]   details:', error.details);
        console.error('[PERSIST]   hint:', error.hint);
        return false;
      }

      console.log(
        `[PERSIST] SUCCESS: ${event.from_port} → ${event.to_port} @ ${event.departure_time} = ${event.status}`
      );
      return true;
    } catch (insertError) {
      console.error('[PERSIST] INSERT THREW EXCEPTION:');
      console.error('[PERSIST]   error:', insertError);
      if (insertError instanceof Error) {
        console.error('[PERSIST]   name:', insertError.name);
        console.error('[PERSIST]   message:', insertError.message);
        console.error('[PERSIST]   stack:', insertError.stack);
      }
      return false;
    }
  } catch (error) {
    console.error('[PERSIST] Unexpected error in persistSailingEvent:', error);
    return false;
  }
}

/**
 * Persist multiple sailing events (batch operation)
 *
 * @param events - Array of sailing events to persist
 * @returns Number of successfully persisted events
 */
export async function persistSailingEvents(events: SailingEventInput[]): Promise<number> {
  let successCount = 0;

  // Process events sequentially to avoid overwhelming the weather API
  for (const event of events) {
    const success = await persistSailingEvent(event);
    if (success) {
      successCount++;
    }
  }

  return successCount;
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
