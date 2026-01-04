'use client';

import type { DailyCorridorBoard } from '@/types/corridor';
import type { TerminalBoardSailing, BoardAdvisory } from '@/types/terminal-board';
import Link from 'next/link';

/**
 * Phase 55: WeatherContext with authority field for three-state display
 * - 'operator': Measured at ferry terminal (SSA ground truth)
 * - 'nws_observation': Measured at nearby weather station (currently disabled)
 * - 'unavailable': No observation available - show empty state message
 */
interface WeatherContext {
  wind_speed: number | null;
  wind_gusts: number | null;
  wind_direction: number | null;
  advisory_level: string | null;
  authority: 'operator' | 'nws_observation' | 'unavailable';
  // Operator fields (when authority='operator')
  terminal_slug?: string;
  age_minutes?: number;
  // NWS fields (when authority='nws_observation')
  station_id?: string;
  station_name?: string;
}

interface CorridorBoardProps {
  board: DailyCorridorBoard | null;
  weatherContext?: WeatherContext | null;
  loading?: boolean;
  error?: string;
}

// ============================================================
// ICONS
// ============================================================

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function WindIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Get risk display properties
 */
function getRiskDisplay(sailing: TerminalBoardSailing): {
  text: string;
  className: string;
  explanation: string | null;
  show: boolean;
} {
  const risk = sailing.forecast_risk;
  if (!risk) {
    return { text: '', className: '', explanation: null, show: false };
  }

  const explanation = risk.explanation && risk.explanation.length > 0
    ? risk.explanation[0]
    : null;

  switch (risk.level) {
    case 'low':
      return {
        text: 'Low Risk',
        className: 'bg-success-muted/50 text-success border-success/30',
        explanation,
        show: true,
      };
    case 'moderate':
      return {
        text: 'Moderate',
        className: 'bg-warning-muted/50 text-warning border-warning/30',
        explanation,
        show: true,
      };
    case 'elevated':
      return {
        text: 'Elevated',
        className: 'bg-accent-muted/50 text-accent border-accent/30',
        explanation,
        show: true,
      };
    default:
      return { text: '', className: '', explanation: null, show: false };
  }
}

/**
 * Get status display for a sailing
 */
function getStatusDisplay(sailing: TerminalBoardSailing): {
  text: string;
  className: string;
  show: boolean;
} {
  // Only show if operator confirmed
  if (!sailing.status_overlay_applied || sailing.operator_status === null) {
    return { text: '', className: '', show: false };
  }

  switch (sailing.operator_status) {
    case 'on_time':
      return {
        text: 'Running',
        className: 'bg-success-muted/50 text-success border-success/30',
        show: true,
      };
    case 'delayed':
      return {
        text: 'Delayed',
        className: 'bg-warning-muted/50 text-warning border-warning/30',
        show: true,
      };
    case 'canceled':
      return {
        text: 'Canceled',
        className: 'bg-destructive-muted/50 text-destructive border-destructive/30',
        show: true,
      };
    default:
      return { text: '', className: '', show: false };
  }
}

/**
 * Get time status display
 *
 * Phase 45 IMMUTABLE RULE: Canceled sailings are NEVER 'departed'.
 * This ensures canceled sailings remain visible in the main section all day.
 */
function getTimeStatus(sailing: TerminalBoardSailing): 'departed' | 'departing_soon' | 'upcoming' | 'canceled' {
  // IMMUTABLE RULE: Canceled sailings stay in main section forever
  if (sailing.operator_status === 'canceled') {
    return 'canceled';
  }

  const now = Date.now();
  const departureMs = sailing.departure_timestamp_ms;
  const minutesUntil = (departureMs - now) / (1000 * 60);

  if (minutesUntil < -5) return 'departed';
  if (minutesUntil <= 15) return 'departing_soon';
  return 'upcoming';
}

/**
 * Format time for display
 */
function formatFetchedAt(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Unknown time';
  }
}

/**
 * Convert wind direction degrees to cardinal direction
 */
function getWindCardinal(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Convert mph to knots for display
 * 1 mph = 0.868976 knots
 */
function mphToKnots(mph: number): number {
  return Math.round(mph * 0.868976);
}

/**
 * Format wind speed with both units: "9 mph (8 kt)"
 */
function formatWindWithUnits(mph: number): string {
  const knots = mphToKnots(mph);
  return `${mph} mph (${knots} kt)`;
}

/**
 * Get exposure context for this corridor
 */
function getExposureExplanation(windDir: number, windSpeedMph: number): string {
  const cardinal = getWindCardinal(windDir);
  const isExposed = ['S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'].includes(cardinal);

  if (windSpeedMph < 15) {
    return 'Light winds - typical conditions for this crossing.';
  } else if (windSpeedMph < 25) {
    if (isExposed) {
      return `${cardinal} winds at ${formatWindWithUnits(windSpeedMph)} may cause moderate chop. This crossing is exposed to southwest through northwest winds.`;
    }
    return `${cardinal} winds at ${formatWindWithUnits(windSpeedMph)} - conditions are manageable for this protected crossing.`;
  } else {
    if (isExposed) {
      return `Strong ${cardinal} winds at ${formatWindWithUnits(windSpeedMph)}. This crossing is exposed to these conditions. Watch for delays or cancellations.`;
    }
    return `${cardinal} winds at ${formatWindWithUnits(windSpeedMph)}. While this crossing has some protection, expect rougher conditions.`;
  }
}

/**
 * Get route ID for weather context link
 */
function getRouteIdForSailing(sailing: TerminalBoardSailing): string {
  const origin = sailing.origin_terminal.id;
  const dest = sailing.destination_terminal.id;
  const opSuffix = sailing.operator_id === 'steamship-authority' ? 'ssa' : 'hlc';

  // Build route ID from sailing info
  const originShort = origin === 'woods-hole' ? 'wh' :
    origin === 'vineyard-haven' ? 'vh' :
    origin === 'oak-bluffs' ? 'ob' :
    origin === 'hyannis' ? 'hy' :
    origin === 'nantucket' ? 'nan' : origin;

  const destShort = dest === 'woods-hole' ? 'wh' :
    dest === 'vineyard-haven' ? 'vh' :
    dest === 'oak-bluffs' ? 'ob' :
    dest === 'hyannis' ? 'hy' :
    dest === 'nantucket' ? 'nan' : dest;

  return `${originShort}-${destShort}-${opSuffix}`;
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

/**
 * Loading skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="card-maritime p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-64 bg-secondary rounded" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-16 bg-secondary/50 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Error display
 */
function ErrorDisplay({ error }: { error: string }) {
  return (
    <div className="card-maritime p-6">
      <div className="flex items-start gap-3 text-destructive">
        <AlertIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Unable to load corridor board</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Advisory display
 */
function AdvisoryBanner({ advisories }: { advisories: BoardAdvisory[] }) {
  if (advisories.length === 0) return null;

  return (
    <div className="bg-warning-muted/50 border border-warning/30 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertIcon className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-warning-foreground">Travel Advisory</p>
          {advisories.map((advisory, idx) => (
            <p key={idx} className="text-sm text-warning-foreground/80 mt-1">
              {advisory.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Weather Context Panel
 *
 * Phase 55: Three-state weather display per PATCH PROMPT
 * - State A (authority='operator'): "Measured at ferry terminal"
 * - State B (authority='nws_observation'): "Measured at nearby weather station"
 * - State C (authority='unavailable'): Show empty state with message
 *
 * RULE: Weather card must ALWAYS render. Missing data ≠ hide UI.
 */
function WeatherContextPanel({ weather }: { weather: WeatherContext }) {
  // State C: Unavailable - show empty state with explanatory message
  if (weather.authority === 'unavailable') {
    return (
      <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <WindIcon className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Weather &amp; Conditions</h3>
        </div>

        <div className="bg-accent-muted/30 border border-accent/20 rounded-lg p-4">
          <p className="text-sm text-foreground font-medium">
            Terminal wind data is temporarily unavailable.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Conditions may change rapidly. Check the official SSA website for current updates.
          </p>
        </div>
      </div>
    );
  }

  // State A or B: We have wind data - display it
  // Null check for wind values (shouldn't happen when authority is not 'unavailable', but be safe)
  if (weather.wind_speed === null || weather.wind_direction === null) {
    return null; // Shouldn't happen, but fallback
  }

  const cardinal = getWindCardinal(weather.wind_direction);
  const exposureExplanation = getExposureExplanation(weather.wind_direction, weather.wind_speed);

  const advisoryColor = weather.advisory_level === 'warning'
    ? 'text-destructive'
    : weather.advisory_level === 'watch'
      ? 'text-warning'
      : 'text-muted-foreground';

  const advisoryText = weather.advisory_level === 'warning'
    ? 'Weather Warning Active'
    : weather.advisory_level === 'watch'
      ? 'Weather Watch Active'
      : 'No Active Advisories';

  // Authority-based label
  const authorityLabel = weather.authority === 'operator'
    ? 'Measured at ferry terminal'
    : weather.authority === 'nws_observation'
      ? 'Measured at nearby weather station'
      : 'Weather observation';

  return (
    <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <WindIcon className="w-5 h-5 text-accent" />
          <h3 className="font-semibold text-foreground">Weather &amp; Conditions</h3>
        </div>
        {/* Authority label */}
        <span className="text-xs text-muted-foreground">{authorityLabel}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        {/* Wind Speed - Primary: mph, Secondary: knots */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Wind</p>
          <p className="text-lg font-semibold text-foreground">
            {weather.wind_speed} mph
            <span className="text-sm font-normal text-muted-foreground ml-1">
              ({mphToKnots(weather.wind_speed)} kt)
            </span>
          </p>
        </div>

        {/* Gusts - Primary: mph, Secondary: knots */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Gusts</p>
          <p className="text-lg font-semibold text-foreground">
            {weather.wind_gusts !== null && weather.wind_gusts > weather.wind_speed ? (
              <>
                {weather.wind_gusts} mph
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  ({mphToKnots(weather.wind_gusts)} kt)
                </span>
              </>
            ) : '—'}
          </p>
        </div>

        {/* Direction - Cardinal direction only, no degrees in main display */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Direction</p>
          <p className="text-lg font-semibold text-foreground">{cardinal}</p>
        </div>

        {/* Advisory */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Advisory</p>
          <p className={`text-sm font-medium ${advisoryColor}`}>{advisoryText}</p>
        </div>
      </div>

      {/* Exposure explanation */}
      <p className="text-sm text-muted-foreground">{exposureExplanation}</p>
    </div>
  );
}

/**
 * Status Unavailable Banner
 */
function StatusUnavailableBanner() {
  return (
    <div className="bg-accent-muted/30 border border-accent/30 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertIcon className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground">Live operator status unavailable</p>
          <p className="text-sm text-muted-foreground mt-1">
            Earlier cancellations may not be reflected. Check the official SSA site for current service updates.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Cancellation Summary
 */
function CancellationSummary({ canceledCount }: { canceledCount: number }) {
  if (canceledCount === 0) return null;

  return (
    <div className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
      <AlertIcon className="w-4 h-4 text-destructive" />
      <span>
        {canceledCount} sailing{canceledCount !== 1 ? 's' : ''} canceled earlier today
      </span>
    </div>
  );
}

/**
 * Single sailing row
 */
function SailingRow({ sailing }: { sailing: TerminalBoardSailing }) {
  const timeStatus = getTimeStatus(sailing);
  const statusDisplay = getStatusDisplay(sailing);
  const riskDisplay = getRiskDisplay(sailing);
  const isDeparted = timeStatus === 'departed';
  const isCanceled = sailing.operator_status === 'canceled';

  // Row opacity for departed/canceled
  const rowOpacity = isDeparted || isCanceled ? 'opacity-50' : '';

  // Time styling
  const timeClass = timeStatus === 'departing_soon' && !isCanceled
    ? 'text-accent font-bold'
    : isDeparted
      ? 'text-muted-foreground'
      : 'text-foreground font-semibold';

  const routeId = getRouteIdForSailing(sailing);

  return (
    <div className={`flex flex-col gap-2 p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors ${rowOpacity}`}>
      {/* Main row */}
      <div className="flex items-center gap-4">
        {/* Time */}
        <div className="w-20 flex-shrink-0">
          <span className={`text-lg ${timeClass}`}>
            {sailing.scheduled_departure_local}
          </span>
        </div>

        {/* Direction */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-muted-foreground truncate">
            {sailing.origin_terminal.name}
          </span>
          <ArrowRightIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium text-foreground truncate">
            {sailing.destination_terminal.name}
          </span>
        </div>

        {/* Status badge (operator confirmed) */}
        {statusDisplay.show && (
          <span className={`px-2 py-0.5 text-xs font-medium rounded border ${statusDisplay.className}`}>
            {statusDisplay.text}
          </span>
        )}

        {/* Risk badge (weather-based) */}
        {riskDisplay.show && !isCanceled && (
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded border flex items-center gap-1 ${riskDisplay.className}`}
            title={riskDisplay.explanation || undefined}
          >
            <WindIcon className="w-3 h-3" />
            {riskDisplay.text}
          </span>
        )}

        {/* Time status indicator */}
        {isDeparted && !isCanceled && (
          <span className="text-xs text-muted-foreground">Departed</span>
        )}
        {timeStatus === 'departing_soon' && !isCanceled && !isDeparted && (
          <span className="text-xs text-accent font-medium">Boarding soon</span>
        )}

        {/* Weather context link */}
        <Link
          href={`/routes/${routeId}`}
          className="text-muted-foreground hover:text-accent transition-colors"
          title="View weather context"
        >
          <CloudIcon className="w-4 h-4" />
        </Link>
      </div>

      {/* Risk explanation row (if moderate or elevated) */}
      {riskDisplay.show && riskDisplay.explanation && riskDisplay.text !== 'Low Risk' && !isCanceled && (
        <div className="ml-24 text-xs text-muted-foreground flex items-center gap-1">
          <WindIcon className="w-3 h-3" />
          <span>{riskDisplay.explanation}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CorridorBoard({ board, weatherContext, loading, error }: CorridorBoardProps) {
  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  if (!board) {
    return (
      <div className="card-maritime p-6">
        <p className="text-muted-foreground">No corridor data available.</p>
      </div>
    );
  }

  const { sailings, advisories, provenance, operator_status_url, terminals } = board;

  // Split into upcoming and departed
  // Phase 45: Canceled sailings ALWAYS go in upcoming section (never hidden in departed)
  const upcomingSailings = sailings.filter((s) => getTimeStatus(s) !== 'departed');
  const departedSailings = sailings.filter((s) => getTimeStatus(s) === 'departed');

  // Count canceled sailings
  const canceledCount = sailings.filter((s) => s.operator_status === 'canceled').length;

  // Provenance display
  const hasLiveStatus = provenance.status_overlay_available;

  return (
    <div className="card-maritime p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <ClockIcon className="w-5 h-5 text-accent" />
        <h2 className="text-xl font-semibold text-foreground">
          Today&apos;s Sailings
        </h2>
      </div>

      {/* Bidirectional indicator */}
      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{terminals.a.name}</span>
        <span className="text-accent">↔</span>
        <span className="font-medium text-foreground">{terminals.b.name}</span>
        <span className="text-muted-foreground ml-2">• Both directions</span>
      </div>

      {/* Trust statement */}
      <div className="flex items-start gap-2 mb-4 text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3">
        <InfoIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          All scheduled sailings between {terminals.a.name} and {terminals.b.name}.
          Status is from the operator when available. Always verify before traveling.
        </p>
      </div>

      {/* Weather Context Panel - Phase 55: ALWAYS renders per PATCH PROMPT */}
      {weatherContext && <WeatherContextPanel weather={weatherContext} />}
      {/* If weatherContext is missing entirely (API error), still show the card */}
      {!weatherContext && (
        <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <WindIcon className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">Weather &amp; Conditions</h3>
          </div>
          <div className="bg-accent-muted/30 border border-accent/20 rounded-lg p-4">
            <p className="text-sm text-foreground font-medium">
              Terminal wind data is temporarily unavailable.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Conditions may change rapidly. Check the official SSA website for current updates.
            </p>
          </div>
        </div>
      )}

      {/* Status Unavailable Banner (when no live status) */}
      {!hasLiveStatus && <StatusUnavailableBanner />}

      {/* Advisories */}
      <AdvisoryBanner advisories={advisories} />

      {/* Cancellation Summary */}
      <CancellationSummary canceledCount={canceledCount} />

      {/* Upcoming sailings */}
      {upcomingSailings.length > 0 ? (
        <div className="space-y-2">
          {upcomingSailings.map((sailing) => (
            <SailingRow key={sailing.sailing_id} sailing={sailing} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>No more sailings today</p>
        </div>
      )}

      {/* Departed sailings (collapsed) */}
      {departedSailings.length > 0 && (
        <details className="mt-6">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
            Show {departedSailings.length} departed sailing{departedSailings.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-3 space-y-2">
            {departedSailings.map((sailing) => (
              <SailingRow key={sailing.sailing_id} sailing={sailing} />
            ))}
          </div>
        </details>
      )}

      {/* Footer with provenance */}
      <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {provenance.operator_status_sources.length > 0 && (
            <span>
              Updated {formatFetchedAt(provenance.operator_status_sources[0].fetched_at)}
            </span>
          )}
        </div>

        {operator_status_url && (
          <a
            href={operator_status_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            Official status page
            <ExternalLinkIcon className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
