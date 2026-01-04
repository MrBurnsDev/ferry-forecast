/**
 * Operator Conditions Persistence Module
 *
 * Phase 43: Store terminal wind conditions exactly as shown by SSA.
 *
 * This is "Operator Conditions" - what SSA displays to users.
 * Kept separate from NOAA marine data used for prediction modeling.
 *
 * USER-FACING: mph, direction text (e.g., "WSW 3 mph")
 * PREDICTION: NOAA marine buoys (separate data path)
 */

import { createServerClient } from '@/lib/supabase/client';

// ============================================================
// TYPES
// ============================================================

/**
 * Condition payload from observer extension
 */
export interface ConditionPayload {
  terminal_slug: string;           // e.g., 'woods-hole'
  wind_speed_mph?: number | null;  // e.g., 3.0
  wind_direction_text?: string | null;  // e.g., 'WSW'
  wind_direction_degrees?: number | null;  // e.g., 248
  raw_wind_text?: string | null;   // e.g., "WSW 3 mph"
  source_url: string;              // e.g., 'https://www.steamshipauthority.com/traveling_today/status'
  notes?: string | null;           // e.g., "Single wind value for both terminals"
}

/**
 * Database row format
 */
export interface OperatorConditionRow {
  id: string;
  operator_id: string;
  terminal_slug: string;
  observed_at: string;
  wind_speed_mph: number | null;
  wind_direction_text: string | null;
  wind_direction_degrees: number | null;
  raw_wind_text: string | null;
  source_url: string;
  notes: string | null;
  created_at: string;
}

/**
 * Result of condition ingestion
 */
export interface ConditionIngestionResult {
  inserted: number;
  skipped: number;  // Duplicates
  errors: string[];
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Valid terminal slugs for SSA
 */
const VALID_TERMINAL_SLUGS = new Set([
  'woods-hole',
  'vineyard-haven',
  'oak-bluffs',
  'hyannis',
  'nantucket',
]);

/**
 * Validate a condition payload
 * Returns null if valid, error message if invalid
 */
export function validateConditionPayload(payload: ConditionPayload): string | null {
  if (!payload.terminal_slug) {
    return 'terminal_slug is required';
  }

  if (!VALID_TERMINAL_SLUGS.has(payload.terminal_slug)) {
    return `Invalid terminal_slug: ${payload.terminal_slug}. Valid values: ${Array.from(VALID_TERMINAL_SLUGS).join(', ')}`;
  }

  if (!payload.source_url) {
    return 'source_url is required';
  }

  // Wind speed should be reasonable if provided
  if (payload.wind_speed_mph !== null && payload.wind_speed_mph !== undefined) {
    if (payload.wind_speed_mph < 0 || payload.wind_speed_mph > 200) {
      return `Invalid wind_speed_mph: ${payload.wind_speed_mph}. Expected 0-200.`;
    }
  }

  // Direction degrees should be 0-359 if provided
  if (payload.wind_direction_degrees !== null && payload.wind_direction_degrees !== undefined) {
    if (payload.wind_direction_degrees < 0 || payload.wind_direction_degrees >= 360) {
      return `Invalid wind_direction_degrees: ${payload.wind_direction_degrees}. Expected 0-359.`;
    }
  }

  return null;  // Valid
}

// ============================================================
// PERSISTENCE
// ============================================================

/**
 * Upsert operator conditions to database
 *
 * Uses unique constraint on (operator_id, terminal_slug, minute-truncated time, raw_wind_text)
 * to dedupe duplicate submissions within the same minute.
 */
export async function upsertOperatorConditions(
  operatorId: string,
  observedAt: string,
  conditions: ConditionPayload[]
): Promise<ConditionIngestionResult> {
  const result: ConditionIngestionResult = {
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  if (conditions.length === 0) {
    return result;
  }

  const supabase = createServerClient();
  if (!supabase) {
    console.error('[CONDITIONS] No Supabase client available');
    result.errors.push('Database not configured');
    return result;
  }

  // Validate all payloads first
  for (const condition of conditions) {
    const error = validateConditionPayload(condition);
    if (error) {
      result.errors.push(`${condition.terminal_slug}: ${error}`);
    }
  }

  // Filter to valid conditions only
  const validConditions = conditions.filter(c => validateConditionPayload(c) === null);

  if (validConditions.length === 0) {
    console.warn('[CONDITIONS] No valid conditions to insert');
    return result;
  }

  // Build rows for insertion
  const rows = validConditions.map(c => ({
    operator_id: operatorId,
    terminal_slug: c.terminal_slug,
    observed_at: observedAt,
    wind_speed_mph: c.wind_speed_mph ?? null,
    wind_direction_text: c.wind_direction_text ?? null,
    wind_direction_degrees: c.wind_direction_degrees ?? null,
    raw_wind_text: c.raw_wind_text ?? null,
    source_url: c.source_url,
    notes: c.notes ?? null,
  }));

  // Insert with ON CONFLICT DO NOTHING (dedupe)
  // The unique index on (operator_id, terminal_slug, minute-truncated time, raw_wind_text)
  // will reject duplicates automatically
  try {
    const { data, error } = await supabase
      .from('operator_conditions')
      .insert(rows)
      .select('id');

    if (error) {
      // Check if it's a duplicate key error
      if (error.code === '23505') {
        // Unique violation - all rows were duplicates
        result.skipped = rows.length;
        console.log(`[CONDITIONS] Skipped ${rows.length} duplicate conditions`);
      } else {
        console.error('[CONDITIONS] Insert error:', error);
        result.errors.push(error.message);
      }
    } else {
      result.inserted = data?.length || 0;
      result.skipped = rows.length - result.inserted;
      console.log(`[CONDITIONS] Inserted ${result.inserted}, skipped ${result.skipped} conditions`);
    }
  } catch (err) {
    console.error('[CONDITIONS] Unexpected error:', err);
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

// ============================================================
// QUERY
// ============================================================

/**
 * Get latest operator conditions for a terminal
 *
 * @param operatorId - e.g., 'ssa'
 * @param terminalSlug - e.g., 'woods-hole'
 * @param maxAgeMinutes - Maximum age of data to return (default 30)
 * @returns Latest condition or null if none found within time window
 */
export async function getLatestOperatorConditions(
  operatorId: string,
  terminalSlug: string,
  maxAgeMinutes: number = 30
): Promise<OperatorConditionRow | null> {
  const supabase = createServerClient();
  if (!supabase) {
    console.error('[CONDITIONS] No Supabase client available');
    return null;
  }

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from('operator_conditions')
      .select('*')
      .eq('operator_id', operatorId)
      .eq('terminal_slug', terminalSlug)
      .gte('observed_at', cutoff)
      .order('observed_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      console.error('[CONDITIONS] Query error:', error);
      return null;
    }

    return data as OperatorConditionRow;
  } catch (err) {
    console.error('[CONDITIONS] Unexpected query error:', err);
    return null;
  }
}

/**
 * Get latest operator conditions for multiple terminals
 *
 * @param operatorId - e.g., 'ssa'
 * @param terminalSlugs - e.g., ['woods-hole', 'vineyard-haven']
 * @param maxAgeMinutes - Maximum age of data to return (default 30)
 * @returns Map of terminal_slug -> condition (excludes terminals with no data)
 */
export async function getLatestOperatorConditionsForTerminals(
  operatorId: string,
  terminalSlugs: string[],
  maxAgeMinutes: number = 30
): Promise<Map<string, OperatorConditionRow>> {
  const result = new Map<string, OperatorConditionRow>();

  const supabase = createServerClient();
  if (!supabase) {
    console.error('[CONDITIONS] No Supabase client available');
    return result;
  }

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  try {
    // Get all recent conditions for these terminals
    const { data, error } = await supabase
      .from('operator_conditions')
      .select('*')
      .eq('operator_id', operatorId)
      .in('terminal_slug', terminalSlugs)
      .gte('observed_at', cutoff)
      .order('observed_at', { ascending: false });

    if (error) {
      console.error('[CONDITIONS] Query error:', error);
      return result;
    }

    // Group by terminal, keep only the latest for each
    for (const row of (data || [])) {
      const terminal = row.terminal_slug;
      if (!result.has(terminal)) {
        result.set(terminal, row as OperatorConditionRow);
      }
    }

    return result;
  } catch (err) {
    console.error('[CONDITIONS] Unexpected query error:', err);
    return result;
  }
}

/**
 * Check if operator conditions are available (for regression guard)
 *
 * @param operatorId - e.g., 'ssa'
 * @param maxAgeMinutes - Maximum age of data to consider "available"
 * @returns true if any conditions exist within the time window
 */
export async function hasRecentOperatorConditions(
  operatorId: string,
  maxAgeMinutes: number = 30
): Promise<boolean> {
  const supabase = createServerClient();
  if (!supabase) {
    return false;
  }

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  try {
    const { count, error } = await supabase
      .from('operator_conditions')
      .select('id', { count: 'exact', head: true })
      .eq('operator_id', operatorId)
      .gte('observed_at', cutoff);

    if (error) {
      console.error('[CONDITIONS] Count query error:', error);
      return false;
    }

    return (count || 0) > 0;
  } catch (err) {
    console.error('[CONDITIONS] Unexpected count error:', err);
    return false;
  }
}

// ============================================================
// PHASE 49: CANCELLATION OPERATOR CONDITIONS
// ============================================================

/**
 * Phase 49: Operator Wind Snapshot at Cancellation
 *
 * When a sailing transitions to status='canceled' for the first time,
 * we capture the operator-observed terminal wind as an immutable fact.
 *
 * This is SEPARATE from:
 * - NOAA wind data (used for prediction scoring)
 * - operator_conditions (general terminal conditions, continuously updated)
 *
 * IMMUTABILITY RULES:
 * 1. NEVER update a row once inserted
 * 2. NEVER overwrite with a second cancellation snapshot
 * 3. One sailing_event_id → one row (enforced by unique constraint)
 *
 * If operator wind is not available at cancellation time, store NULLs.
 * Never guess or synthesize values.
 */

/**
 * Cancellation condition payload - what we capture at the moment of cancellation
 */
export interface CancellationConditionPayload {
  sailing_event_id: string;        // UUID of the sailing_events row
  operator_id: string;             // e.g., 'ssa'
  terminal_slug: string;           // Departure terminal, e.g., 'woods-hole'
  wind_speed: number | null;       // mph as shown on SSA page
  wind_direction_text: string | null;  // e.g., 'WSW'
  wind_direction_degrees: number | null;  // e.g., 248
  raw_text: string | null;         // Full raw text, e.g., "WSW 3 mph"
  source_url: string;              // Where the conditions were scraped from
  captured_at: string;             // ISO timestamp of the observation
}

/**
 * Result of cancellation condition insertion
 */
export interface CancellationConditionResult {
  inserted: boolean;
  sailing_event_id: string;
  reason?: string;  // Explains why insert was skipped/failed
}

/**
 * Phase 49: Insert cancellation operator conditions
 *
 * This function is called when a sailing transitions to status='canceled'
 * for the FIRST time. It inserts exactly one immutable row.
 *
 * IMMUTABILITY GUARDS:
 * - Uses unique constraint on sailing_event_id (DB-enforced)
 * - Never updates, only inserts
 * - Logs duplicate attempts for debugging
 *
 * @param payload - The cancellation condition data
 * @returns Result indicating success/failure and reason
 */
export async function insertCancellationCondition(
  payload: CancellationConditionPayload
): Promise<CancellationConditionResult> {
  const supabase = createServerClient();

  if (!supabase) {
    console.error('[CANCEL_COND] No Supabase client available');
    return {
      inserted: false,
      sailing_event_id: payload.sailing_event_id,
      reason: 'Database not configured',
    };
  }

  const row = {
    sailing_event_id: payload.sailing_event_id,
    operator_id: payload.operator_id,
    terminal_slug: payload.terminal_slug,
    wind_speed: payload.wind_speed,
    wind_direction_text: payload.wind_direction_text,
    wind_direction_degrees: payload.wind_direction_degrees,
    raw_text: payload.raw_text,
    source_url: payload.source_url,
    captured_at: payload.captured_at,
  };

  try {
    const { error } = await supabase
      .from('cancellation_operator_conditions')
      .insert(row);

    if (error) {
      // Check for unique constraint violation (sailing already has conditions)
      if (error.code === '23505') {
        console.log(
          `[CANCEL_COND] DUPLICATE: Conditions already exist for sailing_event_id=${payload.sailing_event_id}. ` +
          `Immutability preserved - no update performed.`
        );
        return {
          inserted: false,
          sailing_event_id: payload.sailing_event_id,
          reason: 'Conditions already captured (immutable)',
        };
      }

      console.error('[CANCEL_COND] Insert error:', error);
      return {
        inserted: false,
        sailing_event_id: payload.sailing_event_id,
        reason: error.message,
      };
    }

    console.log(
      `[CANCEL_COND] INSERTED: Cancellation conditions for sailing_event_id=${payload.sailing_event_id} ` +
      `terminal=${payload.terminal_slug} wind=${payload.raw_text || 'NULL'}`
    );

    return {
      inserted: true,
      sailing_event_id: payload.sailing_event_id,
    };
  } catch (err) {
    console.error('[CANCEL_COND] Unexpected error:', err);
    return {
      inserted: false,
      sailing_event_id: payload.sailing_event_id,
      reason: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Check if cancellation conditions exist for a sailing
 * Used for debugging and verification
 */
export async function hasCancellationConditions(
  sailingEventId: string
): Promise<boolean> {
  const supabase = createServerClient();
  if (!supabase) return false;

  try {
    const { count, error } = await supabase
      .from('cancellation_operator_conditions')
      .select('id', { count: 'exact', head: true })
      .eq('sailing_event_id', sailingEventId);

    if (error) {
      console.error('[CANCEL_COND] Check query error:', error);
      return false;
    }

    return (count || 0) > 0;
  } catch (err) {
    console.error('[CANCEL_COND] Unexpected check error:', err);
    return false;
  }
}

/**
 * Get cancellation conditions for a sailing
 * Used for display and analysis
 */
export async function getCancellationConditions(
  sailingEventId: string
): Promise<CancellationConditionPayload | null> {
  const supabase = createServerClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('cancellation_operator_conditions')
      .select('*')
      .eq('sailing_event_id', sailingEventId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      console.error('[CANCEL_COND] Get query error:', error);
      return null;
    }

    return {
      sailing_event_id: data.sailing_event_id,
      operator_id: data.operator_id,
      terminal_slug: data.terminal_slug,
      wind_speed: data.wind_speed,
      wind_direction_text: data.wind_direction_text,
      wind_direction_degrees: data.wind_direction_degrees,
      raw_text: data.raw_text,
      source_url: data.source_url,
      captured_at: data.captured_at,
    };
  } catch (err) {
    console.error('[CANCEL_COND] Unexpected get error:', err);
    return null;
  }
}

// ============================================================
// DAILY MONITORING
// ============================================================

/**
 * Log warning if no operator conditions were saved today
 * Call this from a daily cron job or health check
 */
export async function checkDailyConditionsIngestion(operatorId: string): Promise<boolean> {
  const supabase = createServerClient();
  if (!supabase) {
    console.error('[CONDITIONS] No Supabase client for daily check');
    return false;
  }

  // Check for any conditions in the last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const { count, error } = await supabase
      .from('operator_conditions')
      .select('id', { count: 'exact', head: true })
      .eq('operator_id', operatorId)
      .gte('observed_at', cutoff);

    if (error) {
      console.error('[CONDITIONS] Daily check query error:', error);
      return false;
    }

    if ((count || 0) === 0) {
      console.warn(
        `[CONDITIONS] WARNING: No operator wind snapshots saved for ${operatorId} in the last 24 hours. ` +
        'Check observer extension and SSA page structure.'
      );
      return false;
    }

    console.log(`[CONDITIONS] Daily check passed: ${count} conditions saved for ${operatorId}`);
    return true;
  } catch (err) {
    console.error('[CONDITIONS] Unexpected daily check error:', err);
    return false;
  }
}
