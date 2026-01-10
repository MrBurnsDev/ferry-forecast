/**
 * Shared Betting API Types
 *
 * Phase 86F: These types are shared between client and server
 * to ensure compile-time type safety for the betting API contract.
 */

/**
 * API bet type - this is what the server expects
 * Different from frontend BetType ('will_sail' | 'will_cancel')
 */
export type ApiBetType = 'sail' | 'cancel';

/**
 * Request payload for POST /api/betting/place
 */
export interface PlaceBetRequest {
  sailingId: string;
  corridorId: string;
  betType: ApiBetType;
}

/**
 * Response from POST /api/betting/place on success
 */
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

/**
 * Response from POST /api/betting/place on error
 */
export interface PlaceBetErrorResponse {
  success: false;
  error: string;
  received?: {
    sailingId: string | null;
    corridorId: string | null;
    betType: string | null;
  };
}

/**
 * Maps frontend BetType to API BetType
 */
export function mapToApiBetType(frontendBetType: 'will_sail' | 'will_cancel'): ApiBetType {
  return frontendBetType === 'will_sail' ? 'sail' : 'cancel';
}

/**
 * Type guard to validate ApiBetType
 */
export function isValidApiBetType(value: unknown): value is ApiBetType {
  return value === 'sail' || value === 'cancel';
}
