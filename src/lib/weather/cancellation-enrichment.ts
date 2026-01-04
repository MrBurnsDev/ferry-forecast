/**
 * Cancellation Weather Enrichment Orchestrator
 *
 * Phase 50: Automatic Weather Snapshot at Cancellation
 *
 * When a sailing transitions to status='canceled' for the first time,
 * this orchestrator automatically captures:
 * 1. Operator conditions (if provided in payload) - Phase 49
 * 2. NWS station observation from nearest station - Phase 50
 *
 * CRITICAL REQUIREMENTS:
 * - All enrichment happens in the SAME request cycle as the cancellation
 * - No cron jobs, no backfills, no post-hoc enrichment
 * - If NWS fetch fails, still persist with NULL values (never block)
 * - All data is immutable (never update, never overwrite)
 *
 * Station Mapping:
 * - Woods Hole → KHYA (Hyannis Airport - closest with reliable data)
 * - Vineyard Haven → KMVY (Martha's Vineyard Airport)
 * - Nantucket → KACK (Nantucket Memorial Airport)
 * - Hyannis → KHYA (Barnstable Municipal Airport)
 */

import { createServerClient } from '@/lib/supabase/client';
import { fetchNWSObservationForTerminal } from './nws-station-collector';

// ============================================================
// TYPES
// ============================================================

/**
 * Input for cancellation enrichment
 */
export interface CancellationEnrichmentInput {
  sailing_event_id: string;
  operator_id: string;
  from_port: string;              // Departure terminal slug
  to_port: string;                // Arrival terminal slug
  captured_at: string;            // ISO timestamp
  // Operator conditions (if available from payload)
  operator_wind_speed?: number | null;
  operator_wind_direction_text?: string | null;
  operator_wind_direction_degrees?: number | null;
  operator_raw_text?: string | null;
  operator_source_url?: string | null;
}

/**
 * Result of enrichment attempt
 */
export interface CancellationEnrichmentResult {
  sailing_event_id: string;
  operator_conditions_inserted: boolean;
  noaa_snapshot_inserted: boolean;
  errors: string[];
  // Details for logging
  nws_station_used?: string;
  nws_wind_speed_mph?: number | null;
  nws_fetch_latency_ms?: number;
}

/**
 * NOAA snapshot row for database
 */
interface NoaaSnapshotRow {
  sailing_event_id: string;
  source: 'nws_station';
  location_type: 'land_station';
  location_id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  observation_time: string;
  captured_at: string;
  wind_speed_mph: number | null;
  wind_direction_deg: number | null;
  wind_gusts_mph: number | null;
  air_temp_f: number | null;
  pressure_mb: number | null;
  visibility_mi: number | null;
  raw_data: Record<string, unknown> | null;
  fetch_latency_ms: number;
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

/**
 * Enrich a cancellation with weather data
 *
 * Called immediately when a sailing transitions to canceled.
 * All operations happen synchronously in the same request cycle.
 *
 * NEVER BLOCKS: If any fetch fails, we still insert with NULLs
 * IMMUTABLE: Uses unique constraint on sailing_event_id to prevent duplicates
 *
 * @param input - The cancellation enrichment input
 * @returns Result indicating what was inserted and any errors
 */
export async function enrichCancellation(
  input: CancellationEnrichmentInput
): Promise<CancellationEnrichmentResult> {
  const result: CancellationEnrichmentResult = {
    sailing_event_id: input.sailing_event_id,
    operator_conditions_inserted: false,
    noaa_snapshot_inserted: false,
    errors: [],
  };

  const supabase = createServerClient();
  if (!supabase) {
    result.errors.push('Database not configured');
    console.error('[ENRICH] FATAL: No Supabase client');
    return result;
  }

  // ============================================================
  // 1. Insert Operator Conditions (if provided)
  // ============================================================

  // This is handled in the ingest route directly via insertCancellationCondition()
  // We just track the status here
  result.operator_conditions_inserted = false;  // Will be updated by caller

  // ============================================================
  // 2. Fetch and Insert NWS Station Observation
  // ============================================================

  try {
    console.log(
      `[ENRICH] Fetching NWS observation for terminal=${input.from_port} ` +
      `sailing_event_id=${input.sailing_event_id}`
    );

    // Fetch from NWS for the departure terminal
    const nwsResult = await fetchNWSObservationForTerminal(input.from_port);

    result.nws_fetch_latency_ms = nwsResult.fetch_latency_ms;
    result.nws_station_used = nwsResult.observation?.station_id;

    if (!nwsResult.success || !nwsResult.observation) {
      // Fetch failed - insert row with NULL values
      console.warn(
        `[ENRICH] NWS fetch failed for ${input.from_port}: ${nwsResult.error}. ` +
        `Inserting with NULL values.`
      );

      // Still insert a row to indicate we tried
      const nullRow: NoaaSnapshotRow = {
        sailing_event_id: input.sailing_event_id,
        source: 'nws_station',
        location_type: 'land_station',
        location_id: 'UNKNOWN',
        location_name: `NWS station for ${input.from_port}`,
        latitude: 0,
        longitude: 0,
        observation_time: input.captured_at,
        captured_at: input.captured_at,
        wind_speed_mph: null,
        wind_direction_deg: null,
        wind_gusts_mph: null,
        air_temp_f: null,
        pressure_mb: null,
        visibility_mi: null,
        raw_data: { error: nwsResult.error, source_url: nwsResult.source_url },
        fetch_latency_ms: nwsResult.fetch_latency_ms,
      };

      const insertResult = await insertNoaaSnapshot(supabase, nullRow);
      result.noaa_snapshot_inserted = insertResult.inserted;
      if (insertResult.error) {
        result.errors.push(insertResult.error);
      }

      return result;
    }

    // Build the snapshot row from successful observation
    const obs = nwsResult.observation;
    const snapshotRow: NoaaSnapshotRow = {
      sailing_event_id: input.sailing_event_id,
      source: 'nws_station',
      location_type: 'land_station',
      location_id: obs.station_id,
      location_name: obs.station_name,
      latitude: obs.latitude,
      longitude: obs.longitude,
      observation_time: obs.observation_time.toISOString(),
      captured_at: input.captured_at,
      wind_speed_mph: obs.wind_speed_mph ?? null,
      wind_direction_deg: obs.wind_direction_deg ?? null,
      wind_gusts_mph: obs.wind_gust_mph ?? null,
      air_temp_f: obs.air_temp_f ?? null,
      pressure_mb: obs.pressure_mb ?? null,
      visibility_mi: obs.visibility_mi ?? null,
      raw_data: obs.raw_data ?? null,
      fetch_latency_ms: nwsResult.fetch_latency_ms,
    };

    result.nws_wind_speed_mph = obs.wind_speed_mph ?? null;

    const insertResult = await insertNoaaSnapshot(supabase, snapshotRow);
    result.noaa_snapshot_inserted = insertResult.inserted;
    if (insertResult.error) {
      result.errors.push(insertResult.error);
    }

    console.log(
      `[ENRICH] NWS snapshot captured: station=${obs.station_id} ` +
      `wind=${obs.wind_speed_mph ?? 'N/A'} mph, ` +
      `latency=${nwsResult.fetch_latency_ms}ms`
    );

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(`NWS enrichment failed: ${errorMsg}`);
    console.error(`[ENRICH] Exception during NWS fetch:`, err);
  }

  return result;
}

/**
 * Insert NOAA snapshot to database
 * Uses unique constraint on sailing_event_id to prevent duplicates
 */
async function insertNoaaSnapshot(
  supabase: ReturnType<typeof createServerClient>,
  row: NoaaSnapshotRow
): Promise<{ inserted: boolean; error?: string }> {
  if (!supabase) {
    return { inserted: false, error: 'No database connection' };
  }

  try {
    const { error } = await supabase
      .from('cancellation_weather_snapshots')
      .insert(row);

    if (error) {
      // Check for unique constraint violation
      if (error.code === '23505') {
        console.log(
          `[ENRICH] NOAA snapshot already exists for sailing_event_id=${row.sailing_event_id} ` +
          `(immutability preserved)`
        );
        return { inserted: false, error: undefined };  // Not an error, just a duplicate
      }

      console.error('[ENRICH] NOAA snapshot insert failed:', error);
      return { inserted: false, error: error.message };
    }

    return { inserted: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[ENRICH] NOAA snapshot insert exception:', err);
    return { inserted: false, error: errorMsg };
  }
}

// ============================================================
// VERIFICATION HELPERS
// ============================================================

/**
 * Check if a sailing has NOAA weather snapshot
 */
export async function hasCancellationWeatherSnapshot(
  sailingEventId: string
): Promise<boolean> {
  const supabase = createServerClient();
  if (!supabase) return false;

  try {
    const { count, error } = await supabase
      .from('cancellation_weather_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('sailing_event_id', sailingEventId);

    if (error) {
      console.error('[ENRICH] Check query error:', error);
      return false;
    }

    return (count || 0) > 0;
  } catch (err) {
    console.error('[ENRICH] Check exception:', err);
    return false;
  }
}

/**
 * Get weather snapshot for a sailing (for display/analysis)
 */
export async function getCancellationWeatherSnapshot(
  sailingEventId: string
): Promise<NoaaSnapshotRow | null> {
  const supabase = createServerClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('cancellation_weather_snapshots')
      .select('*')
      .eq('sailing_event_id', sailingEventId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;  // No rows
      console.error('[ENRICH] Get query error:', error);
      return null;
    }

    return data as NoaaSnapshotRow;
  } catch (err) {
    console.error('[ENRICH] Get exception:', err);
    return null;
  }
}
