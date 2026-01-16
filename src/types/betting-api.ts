/**
 * Shared Prediction Game API Types
 *
 * Phase 86F: These types are shared between client and server
 * to ensure compile-time type safety for the prediction API contract.
 *
 * Note: The API layer still uses 'sail'/'cancel' internally for backward
 * compatibility with the database. These are mapped to/from frontend types.
 */

/**
 * API prediction choice - this is what the server expects
 * Different from frontend PredictionChoice ('will_sail' | 'will_cancel')
 */
export type ApiPredictionChoice = 'sail' | 'cancel';

/**
 * Request payload for POST /api/predictions/submit
 */
export interface SubmitPredictionRequest {
  sailingId: string;
  corridorId: string;
  choice: ApiPredictionChoice;
}

/**
 * Response from POST /api/predictions/submit on success
 */
export interface SubmitPredictionResponse {
  success: true;
  prediction: {
    id: string;
    sailingId: string;
    corridorId: string;
    choice: string;
    stakePoints: number;
    likelihoodSnapshot: number;
    oddsSnapshot: number;
    payoutPoints: number;
    status: string;
    placedAt: string;
    lockedAt: string | null;
  };
  newBalance: number | null;
}

/**
 * Response from POST /api/predictions/submit on error
 */
export interface SubmitPredictionErrorResponse {
  success: false;
  error: string;
  received?: {
    sailingId: string | null;
    corridorId: string | null;
    choice: string | null;
  };
}

/**
 * Maps frontend PredictionChoice to API choice
 */
export function mapToApiChoice(frontendChoice: 'will_sail' | 'will_cancel'): ApiPredictionChoice {
  return frontendChoice === 'will_sail' ? 'sail' : 'cancel';
}

/**
 * Type guard to validate ApiPredictionChoice
 */
export function isValidApiChoice(value: unknown): value is ApiPredictionChoice {
  return value === 'sail' || value === 'cancel';
}

/**
 * Maps API choice back to frontend PredictionChoice
 * Used when fetching predictions from the API
 */
export function mapFromApiChoice(apiChoice: string): 'will_sail' | 'will_cancel' {
  return apiChoice === 'sail' ? 'will_sail' : 'will_cancel';
}

// ============================================================
// BACKWARD COMPATIBILITY ALIASES
// These maintain compatibility during migration
// ============================================================

/** @deprecated Use ApiPredictionChoice instead */
export type ApiBetType = ApiPredictionChoice;

/** @deprecated Use SubmitPredictionRequest instead */
export interface PlaceBetRequest {
  sailingId: string;
  corridorId: string;
  betType: ApiPredictionChoice;
}

/** @deprecated Use SubmitPredictionResponse instead */
export interface PlaceBetResponse {
  success: true;
  bet: {
    id: string;
    sailingId: string;
    corridorId: string;
    betType: string;
    stakePoints: number;
    likelihoodSnapshot: number;
    oddsSnapshot: number;
    payoutPoints: number;
    status: string;
    placedAt: string;
    lockedAt: string | null;
  };
  newBalance: number | null;
}

/** @deprecated Use SubmitPredictionErrorResponse instead */
export interface PlaceBetErrorResponse {
  success: false;
  error: string;
  received?: {
    sailingId: string | null;
    corridorId: string | null;
    betType: string | null;
  };
}

/** @deprecated Use mapToApiChoice instead */
export function mapToApiBetType(frontendBetType: 'will_sail' | 'will_cancel'): ApiPredictionChoice {
  return mapToApiChoice(frontendBetType);
}

/** @deprecated Use isValidApiChoice instead */
export function isValidApiBetType(value: unknown): value is ApiPredictionChoice {
  return isValidApiChoice(value);
}

/** @deprecated Use mapFromApiChoice instead */
export function mapFromApiBetType(apiBetType: string): 'will_sail' | 'will_cancel' {
  return mapFromApiChoice(apiBetType);
}
