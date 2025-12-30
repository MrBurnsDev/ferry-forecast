// NWS Marine Advisories Integration
// Fetches real marine weather alerts from National Weather Service
// Documentation: https://www.weather.gov/documentation/services-web-api

import type { AdvisoryLevel } from '@/types/forecast';

const NWS_API_BASE = 'https://api.weather.gov';
const USER_AGENT = 'FerryForecast/1.0 (github.com/ferryforecast)';
const REQUEST_TIMEOUT = 10000;

// Marine zone mappings for Cape Cod & Islands
// These are official NWS marine forecast zones
const MARINE_ZONES: Record<string, string[]> = {
  'cape-cod-islands': [
    'ANZ230', // Vineyard Sound
    'ANZ231', // Nantucket Sound
    'ANZ232', // Buzzards Bay
    'ANZ235', // Cape Cod Bay
  ],
};

// Port to zone mapping (for more targeted alerts)
const PORT_ZONES: Record<string, string[]> = {
  'woods-hole': ['ANZ230', 'ANZ232'], // Vineyard Sound, Buzzards Bay
  'hyannis': ['ANZ231'], // Nantucket Sound
  'vineyard-haven': ['ANZ230', 'ANZ231'], // Vineyard Sound, Nantucket Sound
  'oak-bluffs': ['ANZ230', 'ANZ231'], // Vineyard Sound, Nantucket Sound
  'nantucket': ['ANZ231'], // Nantucket Sound
};

// In-memory cache for alerts
interface AlertCacheEntry {
  data: MarineAlert[];
  timestamp: number;
  expiresAt: number;
}

const alertCache = new Map<string, AlertCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for alerts (they can change quickly)

// Custom error for alert fetching
export class AlertFetchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'AlertFetchError';
  }
}

// NWS API Response Types
interface NWSAlertProperties {
  id: string;
  areaDesc: string;
  event: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  urgency: 'Immediate' | 'Expected' | 'Future' | 'Past' | 'Unknown';
  certainty: 'Observed' | 'Likely' | 'Possible' | 'Unlikely' | 'Unknown';
  headline: string;
  description: string;
  instruction: string | null;
  onset: string;
  expires: string;
  status: 'Actual' | 'Exercise' | 'System' | 'Test' | 'Draft';
  messageType: 'Alert' | 'Update' | 'Cancel';
  category: string;
  effective: string;
}

interface NWSAlertFeature {
  id: string;
  type: 'Feature';
  properties: NWSAlertProperties;
}

interface NWSAlertsResponse {
  type: 'FeatureCollection';
  features: NWSAlertFeature[];
  title?: string;
  updated?: string;
}

// Structured marine alert
export interface MarineAlert {
  id: string;
  event: string;
  level: AdvisoryLevel;
  severity: string;
  headline: string;
  description: string;
  instruction: string | null;
  onset: string;
  expires: string;
  area: string;
  isActive: boolean;
}

// Priority order for advisory levels (highest to lowest)
const ADVISORY_PRIORITY: AdvisoryLevel[] = [
  'hurricane_warning',
  'storm_warning',
  'gale_warning',
  'small_craft_advisory',
  'none',
];

/**
 * Map NWS event type to our advisory level
 * Based on NWS marine hazards: https://www.weather.gov/safety/marine
 */
function mapEventToAdvisoryLevel(event: string, severity: string): AdvisoryLevel {
  const eventLower = event.toLowerCase();

  // Hurricane-related
  if (
    eventLower.includes('hurricane warning') ||
    eventLower.includes('hurricane force wind')
  ) {
    return 'hurricane_warning';
  }

  // Storm warnings
  if (
    eventLower.includes('storm warning') ||
    eventLower.includes('tropical storm warning') ||
    eventLower.includes('storm force wind')
  ) {
    return 'storm_warning';
  }

  // Gale warnings
  if (
    eventLower.includes('gale warning') ||
    eventLower.includes('gale force')
  ) {
    return 'gale_warning';
  }

  // Small craft advisories
  if (
    eventLower.includes('small craft advisory') ||
    eventLower.includes('small craft warning') ||
    eventLower.includes('hazardous seas') ||
    eventLower.includes('marine weather statement') ||
    eventLower.includes('coastal flood advisory')
  ) {
    return 'small_craft_advisory';
  }

  // Check severity as fallback
  if (severity === 'Extreme' || severity === 'Severe') {
    return 'storm_warning';
  }
  if (severity === 'Moderate') {
    return 'small_craft_advisory';
  }

  return 'none';
}

/**
 * Check if an alert is currently active
 */
function isAlertActive(alert: NWSAlertProperties): boolean {
  const now = new Date();
  const onset = new Date(alert.onset);
  const expires = new Date(alert.expires);

  return (
    alert.status === 'Actual' &&
    alert.messageType !== 'Cancel' &&
    now >= onset &&
    now <= expires
  );
}

/**
 * Check if an alert is marine-related
 */
function isMarineAlert(event: string): boolean {
  const marineEvents = [
    'hurricane',
    'storm warning',
    'storm watch',
    'gale',
    'small craft',
    'hazardous seas',
    'marine weather',
    'coastal flood',
    'high surf',
    'rip current',
    'tropical',
  ];

  const eventLower = event.toLowerCase();
  return marineEvents.some((term) => eventLower.includes(term));
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AlertFetchError(
        `Request timeout after ${timeoutMs}ms`,
        'TIMEOUT',
        true
      );
    }
    throw error;
  }
}

/**
 * Fetch alerts for a single zone
 */
async function fetchZoneAlerts(zone: string): Promise<NWSAlertFeature[]> {
  const url = `${NWS_API_BASE}/alerts/active/zone/${zone}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/geo+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      // Zone not found or no alerts - not an error
      return [];
    }
    if (response.status >= 500) {
      throw new AlertFetchError(
        `NWS API server error for zone ${zone}: ${response.status}`,
        'SERVER_ERROR',
        true
      );
    }
    throw new AlertFetchError(
      `NWS API error for zone ${zone}: ${response.status} ${response.statusText}`,
      'API_ERROR',
      response.status >= 500
    );
  }

  const data: NWSAlertsResponse = await response.json();
  return data.features || [];
}

/**
 * Convert NWS alert to MarineAlert
 */
function toMarineAlert(feature: NWSAlertFeature): MarineAlert {
  const props = feature.properties;

  return {
    id: props.id,
    event: props.event,
    level: mapEventToAdvisoryLevel(props.event, props.severity),
    severity: props.severity,
    headline: props.headline,
    description: props.description,
    instruction: props.instruction,
    onset: props.onset,
    expires: props.expires,
    area: props.areaDesc,
    isActive: isAlertActive(props),
  };
}

/**
 * Get zones for a port or region
 */
function getZones(portSlug?: string, regionSlug?: string): string[] {
  if (portSlug && PORT_ZONES[portSlug]) {
    return PORT_ZONES[portSlug];
  }
  if (regionSlug && MARINE_ZONES[regionSlug]) {
    return MARINE_ZONES[regionSlug];
  }
  return MARINE_ZONES['cape-cod-islands'] || [];
}

/**
 * Get cache key
 */
function getCacheKey(portSlug?: string, regionSlug?: string): string {
  return `alerts:${portSlug || regionSlug || 'default'}`;
}

/**
 * Fetch marine alerts for a location
 * Throws AlertFetchError if data cannot be fetched
 */
export async function fetchMarineAlerts(
  portSlug?: string,
  regionSlug?: string
): Promise<MarineAlert[]> {
  const cacheKey = getCacheKey(portSlug, regionSlug);
  const now = Date.now();

  // Check cache first
  const cached = alertCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const zones = getZones(portSlug, regionSlug);

  if (zones.length === 0) {
    // No zones configured - return empty (not an error)
    return [];
  }

  try {
    // Fetch alerts for all zones in parallel
    const results = await Promise.allSettled(
      zones.map((zone) => fetchZoneAlerts(zone))
    );

    // Collect all alerts
    const allAlerts: NWSAlertFeature[] = [];
    let hasError = false;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allAlerts.push(...result.value);
      } else {
        console.warn('Zone alert fetch failed:', result.reason);
        hasError = true;
      }
    }

    // If all zone fetches failed, throw an error
    if (allAlerts.length === 0 && hasError) {
      throw new AlertFetchError(
        'All zone alert fetches failed',
        'ALL_ZONES_FAILED',
        true
      );
    }

    // Deduplicate by alert ID and filter to marine alerts
    const alertMap = new Map<string, MarineAlert>();
    for (const feature of allAlerts) {
      if (!alertMap.has(feature.id)) {
        const alert = toMarineAlert(feature);
        // Only include marine-related alerts that are active
        if (isMarineAlert(feature.properties.event) && alert.isActive) {
          alertMap.set(feature.id, alert);
        }
      }
    }

    const alerts = Array.from(alertMap.values());

    // Sort by advisory level priority (highest first)
    alerts.sort((a, b) => {
      const aIndex = ADVISORY_PRIORITY.indexOf(a.level);
      const bIndex = ADVISORY_PRIORITY.indexOf(b.level);
      return aIndex - bIndex;
    });

    // Cache the results
    alertCache.set(cacheKey, {
      data: alerts,
      timestamp: now,
      expiresAt: now + CACHE_TTL_MS,
    });

    return alerts;
  } catch (error) {
    // If we have stale cache data and the fetch failed, use stale data
    if (cached && error instanceof AlertFetchError && error.retryable) {
      console.warn(`Using stale cache for ${cacheKey} due to fetch error:`, error.message);
      return cached.data;
    }

    if (error instanceof AlertFetchError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new AlertFetchError(
        `Failed to fetch alerts: ${error.message}`,
        'FETCH_ERROR',
        true
      );
    }
    throw new AlertFetchError(
      'Failed to fetch alerts: Unknown error',
      'UNKNOWN_ERROR',
      true
    );
  }
}

/**
 * Get the highest active advisory level for a location
 */
export async function getActiveAdvisoryLevel(
  portSlug?: string,
  regionSlug?: string
): Promise<{ level: AdvisoryLevel; alerts: MarineAlert[] }> {
  const alerts = await fetchMarineAlerts(portSlug, regionSlug);

  if (alerts.length === 0) {
    return { level: 'none', alerts: [] };
  }

  // Alerts are already sorted by priority, so the first one has the highest level
  const highestLevel = alerts[0].level;

  // Return all alerts with that level
  const highestAlerts = alerts.filter((a) => a.level === highestLevel);

  return {
    level: highestLevel,
    alerts: highestAlerts,
  };
}

/**
 * Clear the alerts cache
 */
export function clearAlertsCache(): void {
  alertCache.clear();
}

/**
 * Get cache stats
 */
export function getAlertsCacheStats(): { size: number; keys: string[] } {
  return {
    size: alertCache.size,
    keys: Array.from(alertCache.keys()),
  };
}
