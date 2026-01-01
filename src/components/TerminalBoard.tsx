'use client';

import type {
  DailyTerminalBoard,
  TerminalBoardSailing,
  BoardAdvisory,
} from '@/types/terminal-board';

interface TerminalBoardProps {
  board: DailyTerminalBoard | null;
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

// ============================================================
// HELPERS
// ============================================================

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
 */
function getTimeStatus(sailing: TerminalBoardSailing): 'departed' | 'departing_soon' | 'upcoming' {
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
        <div className="h-6 w-48 bg-secondary rounded" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
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
          <p className="font-medium">Unable to load terminal board</p>
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
 * Phase 39: Get weather risk context as secondary info
 * Operator status is PRIMARY. Weather risk is SECONDARY context only.
 */
function getWeatherRiskContext(sailing: TerminalBoardSailing): string | null {
  if (!sailing.forecast_risk) return null;

  const level = sailing.forecast_risk.level;
  if (level === 'low') return null; // Don't show low risk

  const levelText = level === 'high' ? 'High' : level === 'moderate' ? 'Moderate' : 'Elevated';
  return `Weather risk: ${levelText}`;
}

/**
 * Single sailing row
 *
 * Phase 39: UI Precedence Rules
 * - Operator status is ALWAYS shown first (canceled, delayed, on_time)
 * - Cancellation reason shown verbatim from operator
 * - Weather risk shown as secondary context only
 * - Never allow forecast to override operator status
 */
function SailingRow({ sailing }: { sailing: TerminalBoardSailing }) {
  const timeStatus = getTimeStatus(sailing);
  const statusDisplay = getStatusDisplay(sailing);
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

  // Weather risk as secondary context (only for non-canceled sailings)
  const weatherContext = !isCanceled ? getWeatherRiskContext(sailing) : null;

  return (
    <div className={`rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors ${rowOpacity}`}>
      <div className="flex items-center gap-4 p-4">
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

        {/* Status badge (only if operator confirmed) */}
        {statusDisplay.show && (
          <span className={`px-2 py-0.5 text-xs font-medium rounded border ${statusDisplay.className}`}>
            {statusDisplay.text}
          </span>
        )}

        {/* Status indicator for non-operator status */}
        {!statusDisplay.show && sailing.status_overlay_applied === false && (
          <span className="px-2 py-0.5 text-xs text-muted-foreground bg-secondary/50 rounded">
            Scheduled
          </span>
        )}

        {/* Time status indicator */}
        {isDeparted && !isCanceled && (
          <span className="text-xs text-muted-foreground">Departed</span>
        )}
        {timeStatus === 'departing_soon' && !isCanceled && !isDeparted && (
          <span className="text-xs text-accent font-medium">Boarding soon</span>
        )}
      </div>

      {/* Phase 39: Operator status reason (shown prominently for cancellations) */}
      {isCanceled && sailing.operator_status_reason && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs text-destructive/80">
            {sailing.operator_status_reason}
          </p>
          {/* Weather context as secondary info after cancellation reason */}
          {sailing.forecast_risk && sailing.forecast_risk.level !== 'low' && (
            <p className="text-xs text-muted-foreground mt-1">
              Weather risk was {sailing.forecast_risk.level}.
            </p>
          )}
        </div>
      )}

      {/* Phase 39: Weather context for non-canceled sailings (secondary) */}
      {!isCanceled && weatherContext && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs text-muted-foreground">
            {weatherContext}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function TerminalBoard({ board, loading, error }: TerminalBoardProps) {
  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  if (!board) {
    return (
      <div className="card-maritime p-6">
        <p className="text-muted-foreground">No terminal data available.</p>
      </div>
    );
  }

  const { departures, advisories, provenance, operator_status_url } = board;

  // Split into upcoming and departed
  const upcomingSailings = departures.filter((s) => getTimeStatus(s) !== 'departed');
  const departedSailings = departures.filter((s) => getTimeStatus(s) === 'departed');

  return (
    <div className="card-maritime p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <ClockIcon className="w-5 h-5 text-accent" />
        <h2 className="text-xl font-semibold text-foreground">
          Today&apos;s Departures
        </h2>
      </div>

      {/* Trust statement */}
      <div className="flex items-start gap-2 mb-4 text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3">
        <InfoIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          This board shows scheduled sailings. Status is from the operator when available.
          Always verify with the operator before traveling.
        </p>
      </div>

      {/* Advisories */}
      <AdvisoryBanner advisories={advisories} />

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
