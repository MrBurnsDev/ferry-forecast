/**
 * Wind Source Priority Regression Guards
 *
 * Phase 43: Ensure operator-reported wind is ALWAYS shown to users when available,
 * never overridden or replaced by NOAA marine data.
 *
 * SOURCE PRIORITY (for user-facing display):
 * 1. Operator Conditions (SSA terminal wind) - "WSW 3 mph"
 * 2. Fallback: "No terminal conditions available"
 *
 * NOAA marine data is ONLY for:
 * - Prediction modeling (scoring engine)
 * - Open water conditions context
 * - Marine advisories
 *
 * NEVER shown as primary user wind when operator conditions exist.
 */

import { hasRecentOperatorConditions } from '@/lib/events/operator-conditions';

// ============================================================
// TYPES
// ============================================================

export interface WindSourceDecision {
  source: 'operator' | 'noaa' | 'none';
  operator_wind_available: boolean;
  noaa_wind_available: boolean;
  reason: string;
}

// ============================================================
// REGRESSION GUARDS
// ============================================================

/**
 * Determine which wind source to display to users
 *
 * RULE: Operator wind is ALWAYS preferred when available.
 * NOAA is never shown as primary user wind.
 *
 * @param operatorId - e.g., 'ssa'
 * @param hasNoaaWind - Whether NOAA marine data is available
 * @returns Decision on which wind source to use
 */
export async function getWindSourceDecision(
  operatorId: string,
  hasNoaaWind: boolean
): Promise<WindSourceDecision> {
  // Check if operator conditions are available
  const operatorAvailable = await hasRecentOperatorConditions(operatorId, 30);

  if (operatorAvailable) {
    return {
      source: 'operator',
      operator_wind_available: true,
      noaa_wind_available: hasNoaaWind,
      reason: 'Operator conditions available - using SSA terminal wind',
    };
  }

  // No operator conditions - fallback to none (not NOAA for user-facing)
  return {
    source: 'none',
    operator_wind_available: false,
    noaa_wind_available: hasNoaaWind,
    reason: 'No recent operator conditions - terminal wind unavailable',
  };
}

/**
 * Validate that we're not accidentally showing NOAA as primary wind
 *
 * Call this in any code path that displays wind to users.
 * If this returns false, there's a regression.
 *
 * @param displaySource - The source about to be shown to users
 * @param operatorAvailable - Whether operator conditions exist
 * @returns true if valid, false if regression detected
 */
export function validateWindDisplaySource(
  displaySource: 'operator' | 'noaa' | 'none',
  operatorAvailable: boolean
): { valid: boolean; error?: string } {
  // REGRESSION CHECK: Never show NOAA as primary when operator is available
  if (displaySource === 'noaa' && operatorAvailable) {
    return {
      valid: false,
      error:
        'REGRESSION: Attempting to show NOAA wind as primary when operator conditions are available. ' +
        'User-facing wind must always come from operator when available.',
    };
  }

  return { valid: true };
}

/**
 * Log warning if wind source priority is violated
 *
 * Use this for monitoring/alerting without blocking.
 */
export function logWindSourcePriorityCheck(
  context: string,
  displaySource: 'operator' | 'noaa' | 'none',
  operatorAvailable: boolean
): void {
  const validation = validateWindDisplaySource(displaySource, operatorAvailable);

  if (!validation.valid) {
    console.error(`[WIND-PRIORITY-GUARD] ${context}: ${validation.error}`);
  }
}

// ============================================================
// INLINE GUARDS (for use in templates/components)
// ============================================================

/**
 * Check if NOAA wind can be shown (only when operator is NOT available)
 *
 * This is a strict guard - returns false if operator conditions exist,
 * even if NOAA data is technically available.
 */
export function canShowNoaaWindToUser(
  operatorConditionsAvailable: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _noaaWindAvailable: boolean
): boolean {
  // NEVER show NOAA as user-facing wind when operator has data
  return !operatorConditionsAvailable;
}

/**
 * Get user-facing wind source label
 *
 * Always returns "Operator" when operator conditions available,
 * "Unavailable" otherwise (never "NOAA" for user-facing display).
 */
export function getUserFacingWindLabel(
  operatorConditionsAvailable: boolean
): 'Operator' | 'Unavailable' {
  return operatorConditionsAvailable ? 'Operator' : 'Unavailable';
}
