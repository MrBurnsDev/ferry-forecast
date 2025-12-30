'use client';

import type { Sailing, SailingStatus, ScheduleProvenance, ScheduleSourceType, OperatorAdvisory } from '@/lib/schedules';
import { getSailingTimeStatus } from '@/lib/schedules';
import type { OfficialStatus } from '@/types/forecast';
import {
  computeSailingRisk,
  getSailingRiskDisplay,
  type WeatherContext,
  type SailingRisk,
} from '@/lib/scoring/sailing-risk';
import { degreesToCompassBucket } from '@/lib/config/exposure';

interface TodaySailingsProps {
  sailings: Sailing[] | null;
  loading?: boolean;
  error?: string;
  provenance?: ScheduleProvenance | null;
  operatorStatus?: OfficialStatus | null;
  operatorStatusSource?: string | null;
  operatorScheduleUrl?: string;
  routeDisplayName: string;
  /** Route ID for exposure lookup */
  routeId?: string;
  /** Weather context for per-sailing risk computation */
  weather?: WeatherContext | null;
  /** Phase 17: Operator advisories (verbatim) */
  advisories?: OperatorAdvisory[] | null;
  /** Phase 17: Status source info */
  statusSource?: {
    source: 'operator_status_page' | 'schedule_page' | 'unavailable';
    url?: string;
    fetchedAt?: string;
  } | null;
}

/**
 * Get status display for a sailing
 * PHASE 16: Only show operator-confirmed statuses
 */
function getSailingStatusDisplay(status: SailingStatus, fromOperator: boolean): {
  text: string;
  className: string;
  iconClassName: string;
  show: boolean;
} {
  // Only show status if operator explicitly reports it
  if (!fromOperator && status === 'scheduled') {
    return {
      text: '',
      className: '',
      iconClassName: '',
      show: false,
    };
  }

  switch (status) {
    case 'on_time':
      return {
        text: 'Running',
        className: 'bg-success-muted/50 text-success border-success/30',
        iconClassName: 'text-success',
        show: true,
      };
    case 'delayed':
      return {
        text: 'Delayed',
        className: 'bg-warning-muted/50 text-warning border-warning/30',
        iconClassName: 'text-warning',
        show: true,
      };
    case 'canceled':
      return {
        text: 'Canceled',
        className: 'bg-destructive-muted/50 text-destructive border-destructive/30',
        iconClassName: 'text-destructive',
        show: true,
      };
    case 'scheduled':
    default:
      return {
        text: 'Scheduled',
        className: 'bg-secondary/50 text-muted-foreground border-border/30',
        iconClassName: 'text-muted-foreground',
        show: fromOperator,
      };
  }
}

/**
 * Format the provenance timestamp for display
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
 * Get source type display info
 * PHASE 16: "Schedule only" vs "Live status" distinction
 */
function getSourceTypeDisplay(
  sourceType: ScheduleSourceType,
  hasOperatorStatus: boolean
): {
  label: string;
  className: string;
  showSailings: boolean;
  scheduleLabel: string;
} {
  // If we have operator status, show "Live status"
  // Otherwise show schedule source type
  const statusLabel = hasOperatorStatus ? 'Live status' : 'Schedule only';
  const statusClassName = hasOperatorStatus
    ? 'bg-success-muted/50 text-success'
    : 'bg-secondary/50 text-muted-foreground';

  switch (sourceType) {
    case 'operator_live':
      return {
        label: statusLabel,
        className: statusClassName,
        showSailings: true,
        scheduleLabel: 'Live schedule',
      };
    case 'template':
      return {
        label: statusLabel,
        className: statusClassName,
        showSailings: true,
        scheduleLabel: 'Template schedule',
      };
    case 'unavailable':
    default:
      return {
        label: 'Unavailable',
        className: 'bg-secondary/50 text-muted-foreground',
        showSailings: false,
        scheduleLabel: 'Schedule unavailable',
      };
  }
}

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
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function WindIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

/**
 * Get time status for a sailing (departed, boarding, upcoming)
 */
function getSailingStatus(sailing: Sailing): 'departed' | 'boarding' | 'upcoming' {
  return getSailingTimeStatus(sailing.departureTimestampMs);
}

/**
 * Sailing Risk Badge - shows per-sailing weather risk
 */
function SailingRiskBadge({
  risk,
  windDirection,
}: {
  risk: SailingRisk;
  windDirection?: number;
}) {
  const display = getSailingRiskDisplay(risk.level);

  // Don't show badge for low risk unless there's a direction effect
  if (risk.level === 'low' && !risk.directionAffected) {
    return null;
  }

  const windCompass = windDirection !== undefined ? degreesToCompassBucket(windDirection) : null;

  return (
    <div className="flex items-center gap-1">
      <span
        className={`text-xs px-2 py-0.5 rounded border ${display.bgClassName}`}
        title={risk.reason || `${display.label} risk for this sailing`}
      >
        <span className={display.className}>{display.label}</span>
      </span>
      {risk.windRelation && windCompass && (
        <span className="text-xs text-muted-foreground" title={`${windCompass} ${risk.windRelation}`}>
          <WindIcon className="w-3 h-3 inline" />
        </span>
      )}
    </div>
  );
}

export function TodaySailings({
  sailings,
  loading,
  error,
  provenance,
  operatorStatus,
  operatorStatusSource,
  operatorScheduleUrl,
  routeDisplayName,
  routeId,
  weather,
  advisories,
  statusSource,
}: TodaySailingsProps) {
  // Phase 17: Check if we have per-sailing status from operator status page
  const hasPerSailingStatus = statusSource?.source === 'operator_status_page';

  // Determine source type display
  const sourceType = provenance?.source_type || 'unavailable';
  // Phase 17: hasOperatorStatus is true if we have status page OR route-level status
  const hasOperatorStatus = hasPerSailingStatus || !!(operatorStatus && operatorStatus !== 'unknown');
  const sourceDisplay = getSourceTypeDisplay(sourceType, hasOperatorStatus);

  // Compute per-sailing risks if we have weather and sailings
  const sailingRisks = new Map<number, SailingRisk>();
  if (sailings && weather && routeId) {
    sailings.forEach((sailing, index) => {
      const risk = computeSailingRisk(sailing, weather, routeId);
      sailingRisks.set(index, risk);
    });
  }

  if (loading) {
    return (
      <div className="card-maritime p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Today&apos;s Sailings</h2>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-secondary rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // PHASE 16: Only show "unavailable" if we truly have no sailings
  // Even if live status failed, we may have schedule times to show
  const hasSailings = sailings && sailings.length > 0;

  if (!hasSailings && (sourceType === 'unavailable' || error)) {
    return (
      <div className="card-maritime p-6">
        <h2 className="text-xl font-semibold text-foreground mb-2">Today&apos;s Sailings</h2>
        <p className="text-sm text-muted-foreground mb-4">{routeDisplayName}</p>

        {/* Source Info - Always show even when unavailable */}
        {provenance && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <span className={`px-2 py-0.5 rounded ${sourceDisplay.className}`}>
              {sourceDisplay.label}
            </span>
            {provenance.source_name && (
              <span>Source: {provenance.source_name}</span>
            )}
          </div>
        )}

        <div className="bg-secondary/50 rounded-lg p-6 text-center">
          <AlertCircleIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium mb-2">
            Schedule unavailable
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            {provenance?.error_message || error || 'Could not load schedule from operator website.'}
          </p>
          {operatorScheduleUrl && (
            <a
              href={operatorScheduleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Open operator schedule <ExternalLinkIcon className="w-4 h-4" />
            </a>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center italic">
          We only show schedules we can verify from the operator. No made-up times.
        </p>
      </div>
    );
  }

  // Handle template schedule (explicit labeling)
  const isTemplate = sourceType === 'template';

  if (!sailings || sailings.length === 0) {
    return (
      <div className="card-maritime p-6">
        <h2 className="text-xl font-semibold text-foreground mb-2">Today&apos;s Sailings</h2>
        <p className="text-sm text-muted-foreground mb-4">{routeDisplayName}</p>

        {provenance && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <span className={`px-2 py-0.5 rounded ${sourceDisplay.className}`}>
              {sourceDisplay.label}
            </span>
            <span>Checked at {formatFetchedAt(provenance.fetched_at)}</span>
          </div>
        )}

        <div className="bg-secondary/50 rounded-lg p-4">
          <p className="text-muted-foreground text-sm">
            No sailings found for today. This may be due to seasonal service or check the operator directly.
          </p>
        </div>
      </div>
    );
  }

  // Count upcoming vs departed
  const upcomingSailings = sailings.filter((s) => getSailingStatus(s) !== 'departed');
  const canceledCount = sailings.filter((s) => s.status === 'canceled').length;

  return (
    <div className="card-maritime p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Today&apos;s Sailings</h2>
          <p className="text-sm text-muted-foreground mt-1">{routeDisplayName}</p>
        </div>
        {operatorScheduleUrl && (
          <a
            href={operatorScheduleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent text-sm hover:underline flex-shrink-0"
          >
            Full schedule <ExternalLinkIcon className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Source Provenance Line - REQUIRED */}
      {provenance && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 flex-wrap">
          <span className={`px-2 py-0.5 rounded ${sourceDisplay.className}`}>
            {sourceDisplay.label}
          </span>
          <span>Source: {provenance.source_name}</span>
          <span>-</span>
          <span>fetched at {formatFetchedAt(provenance.fetched_at)}</span>
          {/* Phase 17: Show status source */}
          {statusSource && statusSource.source === 'operator_status_page' && (
            <>
              <span>-</span>
              <span className="text-success">
                status from operator
              </span>
            </>
          )}
        </div>
      )}

      {/* Template Warning */}
      {isTemplate && (
        <div className="bg-warning-muted/50 border border-warning/30 rounded-lg p-3 mb-4">
          <p className="text-sm text-warning font-medium">
            Template schedule - not live
          </p>
          <p className="text-xs text-warning/80 mt-1">
            These times are approximate and may not reflect today&apos;s actual schedule.
          </p>
        </div>
      )}

      {/* Phase 17: Operator Advisory Banner - verbatim from operator */}
      {advisories && advisories.length > 0 && (
        <div className="bg-warning-muted border border-warning/40 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              {advisories.map((advisory, index) => (
                <div key={index} className={index > 0 ? 'mt-3 pt-3 border-t border-warning/20' : ''}>
                  <p className="text-sm font-medium text-warning">{advisory.title}</p>
                  <p className="text-sm text-warning-foreground mt-1">{advisory.text}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-2">
                — {provenance?.source_name || 'Operator'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live Status Unavailable Notice */}
      {!hasOperatorStatus && sourceType !== 'unavailable' && (
        <div className="bg-secondary/50 border border-border/30 rounded-lg p-3 mb-4">
          <p className="text-sm text-muted-foreground">
            Live status unavailable - schedule shown below
          </p>
        </div>
      )}

      {/* Operator Status Summary */}
      {operatorStatus && operatorStatus !== 'unknown' && (
        <div className={`rounded-lg p-3 mb-4 ${
          operatorStatus === 'canceled'
            ? 'bg-destructive-muted/50 border border-destructive/30'
            : operatorStatus === 'delayed'
            ? 'bg-warning-muted/50 border border-warning/30'
            : 'bg-success-muted/50 border border-success/30'
        }`}>
          <p className={`text-sm font-medium ${
            operatorStatus === 'canceled'
              ? 'text-destructive'
              : operatorStatus === 'delayed'
              ? 'text-warning'
              : 'text-success'
          }`}>
            {operatorStatus === 'canceled' && 'Service disruption reported by operator'}
            {operatorStatus === 'delayed' && 'Delays reported by operator'}
            {operatorStatus === 'on_time' && 'Service running normally'}
          </p>
          {operatorStatusSource && (
            <p className="text-xs text-muted-foreground mt-1">
              Source: {operatorStatusSource}
            </p>
          )}
        </div>
      )}

      {/* Sailings List */}
      <div className="space-y-2">
        {sailings.map((sailing, index) => {
          const timeStatus = getSailingStatus(sailing);
          const departed = timeStatus === 'departed';
          const boarding = timeStatus === 'boarding';
          const statusDisplay = getSailingStatusDisplay(sailing.status, sailing.statusFromOperator);
          const risk = sailingRisks.get(index);

          return (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                departed
                  ? 'bg-secondary/30 border-border/20 opacity-60'
                  : 'bg-card border-border/50'
              }`}
            >
              {/* Time */}
              <div className="flex items-center gap-2 w-20 flex-shrink-0">
                <ClockIcon className={`w-4 h-4 ${departed ? 'text-muted-foreground' : 'text-foreground'}`} />
                <span className={`font-mono font-medium text-sm ${departed ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {sailing.departureTimeDisplay}
                </span>
              </div>

              {/* Direction */}
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <span className={`truncate text-sm ${departed ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {sailing.direction.from}
                </span>
                <ArrowRightIcon className={`w-3 h-3 flex-shrink-0 ${departed ? 'text-muted-foreground' : 'text-muted-foreground'}`} />
                <span className={`truncate text-sm ${departed ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {sailing.direction.to}
                </span>
              </div>

              {/* Per-Sailing Risk Badge (only for upcoming sailings) */}
              {!departed && risk && (
                <SailingRiskBadge risk={risk} windDirection={weather?.windDirection} />
              )}

              {/* Status */}
              <div className="flex-shrink-0">
                {departed ? (
                  <span className="text-xs text-muted-foreground italic">Departed</span>
                ) : boarding ? (
                  <span className="text-xs px-2 py-1 rounded-full border bg-accent-muted/50 text-accent border-accent/30">
                    Boarding
                  </span>
                ) : statusDisplay.show ? (
                  <span className={`text-xs px-2 py-1 rounded-full border ${statusDisplay.className}`}>
                    {statusDisplay.text}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Risk Explanation - only show if we have weather data and elevated risks */}
      {weather && sailingRisks.size > 0 && (
        <div className="mt-4 pt-4 border-t border-border/50">
          {Array.from(sailingRisks.values()).some(r => r.reason) && (
            <div className="text-xs text-muted-foreground mb-2">
              <WindIcon className="w-3 h-3 inline mr-1" />
              Risk badges show weather exposure for each sailing direction.
              {' '}Higher risk does NOT predict cancellation.
            </div>
          )}
        </div>
      )}

      {/* Footer Notes */}
      <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
        {canceledCount > 0 && canceledCount < sailings.length && (
          <p className="text-xs text-muted-foreground">
            {canceledCount} of {sailings.length} sailings affected today.
            {upcomingSailings.length > canceledCount && ' Other sailings may still run.'}
          </p>
        )}

        <p className="text-xs text-muted-foreground italic">
          Always verify with the operator before traveling.
        </p>
      </div>
    </div>
  );
}
