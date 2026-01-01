/**
 * Cancellation Persistence Regression Guard
 *
 * Phase 46: Ensures canceled sailings in Supabase are never lost in API responses.
 *
 * This guard compares the count of canceled sailings in the API response against
 * what's persisted in Supabase. If the response has fewer, it logs a CRITICAL error.
 *
 * This is a MONITORING guard, not a blocking guard - it alerts but doesn't break.
 */

import { createServerClient } from '@/lib/supabase/client';

/**
 * Get the count of canceled sailings in Supabase for a service date
 */
export async function getCanceledCountFromDatabase(
  serviceDate: string,
  corridorId?: string
): Promise<{ count: number; error?: string }> {
  const supabase = createServerClient();
  if (!supabase) {
    return { count: 0, error: 'Supabase not configured' };
  }

  try {
    let query = supabase
      .from('sailing_events')
      .select('id', { count: 'exact', head: true })
      .eq('service_date', serviceDate)
      .eq('status', 'canceled');

    if (corridorId) {
      query = query.eq('corridor_id', corridorId);
    }

    const { count, error } = await query;

    if (error) {
      console.error('[CANCEL-GUARD] Database query error:', error);
      return { count: 0, error: error.message };
    }

    return { count: count || 0 };
  } catch (err) {
    console.error('[CANCEL-GUARD] Exception:', err);
    return { count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Validate that API response has at least as many canceled sailings as the database
 *
 * RULE: response_canceled_count >= db_canceled_count
 * If violated, logs CRITICAL error for monitoring
 *
 * @param responseCanceledCount - Number of canceled sailings in API response
 * @param serviceDate - Service date in YYYY-MM-DD format
 * @param corridorId - Optional corridor ID for scoped check
 * @returns Validation result with details
 */
export async function validateCancellationPersistence(
  responseCanceledCount: number,
  serviceDate: string,
  corridorId?: string
): Promise<{
  valid: boolean;
  dbCount: number;
  responseCount: number;
  error?: string;
}> {
  const { count: dbCount, error } = await getCanceledCountFromDatabase(
    serviceDate,
    corridorId
  );

  if (error) {
    // Can't validate - log warning but don't fail
    console.warn('[CANCEL-GUARD] Cannot validate - DB error:', error);
    return {
      valid: true, // Allow through, but note the error
      dbCount: 0,
      responseCount: responseCanceledCount,
      error,
    };
  }

  const valid = responseCanceledCount >= dbCount;

  if (!valid) {
    // CRITICAL: Fewer cancellations in response than in database
    // This is the exact regression Phase 46 is meant to prevent
    console.error(
      `[CANCEL-GUARD] CRITICAL REGRESSION DETECTED: ` +
      `Response has ${responseCanceledCount} canceled sailings but DB has ${dbCount}. ` +
      `service_date=${serviceDate}, corridor_id=${corridorId || 'all'}. ` +
      `${dbCount - responseCanceledCount} cancellations are MISSING from the response!`
    );
  }

  return {
    valid,
    dbCount,
    responseCount: responseCanceledCount,
  };
}

/**
 * Quick check for use in API responses - non-blocking
 * Returns metadata that can be included in response for debugging
 */
export async function getCancellationGuardMetadata(
  sailings: Array<{ operator_status?: string | null }>,
  serviceDate: string,
  corridorId?: string
): Promise<{
  response_canceled_count: number;
  db_canceled_count: number;
  guard_valid: boolean;
  guard_error?: string;
}> {
  const responseCanceledCount = sailings.filter(
    (s) => s.operator_status === 'canceled'
  ).length;

  const validation = await validateCancellationPersistence(
    responseCanceledCount,
    serviceDate,
    corridorId
  );

  return {
    response_canceled_count: validation.responseCount,
    db_canceled_count: validation.dbCount,
    guard_valid: validation.valid,
    guard_error: validation.error,
  };
}
