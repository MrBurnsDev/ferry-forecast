/**
 * Region State Management
 *
 * Phase 62: Global Region State + Route Guardrails
 *
 * Provides:
 * - Cookie-based persistence for activeRegionId
 * - Region validation
 * - Display name lookup
 *
 * REGION ID CANONICAL FORM:
 * - 'cci' = Cape Cod & Islands
 * - No aliases, no guessing
 */

// Cookie name for region persistence
export const REGION_COOKIE_NAME = 'ferry_forecast_region';

// Cookie expiry (30 days)
export const REGION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

// Valid region IDs (canonical, no aliases)
export const VALID_REGION_IDS = ['cci'] as const;
export type RegionId = (typeof VALID_REGION_IDS)[number];

// Region display names
export const REGION_DISPLAY_NAMES: Record<RegionId, string> = {
  cci: 'Cape Cod & Islands',
};

/**
 * Check if a string is a valid region ID
 */
export function isValidRegionId(id: string): id is RegionId {
  return VALID_REGION_IDS.includes(id as RegionId);
}

/**
 * Get display name for a region ID
 */
export function getRegionDisplayName(id: string): string {
  if (isValidRegionId(id)) {
    return REGION_DISPLAY_NAMES[id];
  }
  return id;
}

/**
 * Set region cookie (client-side)
 */
export function setRegionCookie(regionId: RegionId): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${REGION_COOKIE_NAME}=${regionId}; path=/; max-age=${REGION_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Get region from cookie (client-side)
 */
export function getRegionFromCookie(): RegionId | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === REGION_COOKIE_NAME && isValidRegionId(value)) {
      return value;
    }
  }
  return null;
}

/**
 * Clear region cookie (client-side)
 */
export function clearRegionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${REGION_COOKIE_NAME}=; path=/; max-age=0`;
}

/**
 * Parse region from server-side cookie header
 */
export function parseRegionFromCookieHeader(cookieHeader: string | null): RegionId | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === REGION_COOKIE_NAME && isValidRegionId(value)) {
      return value;
    }
  }
  return null;
}
