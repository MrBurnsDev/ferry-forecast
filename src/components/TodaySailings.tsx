'use client';

import type { Sailing, SailingStatus, ScheduleProvenance, ScheduleSourceType } from '@/lib/schedules';
import { hasSailingDeparted, getSailingTimeStatus } from '@/lib/schedules';
import type { OfficialStatus } from '@/types/forecast';

interface TodaySailingsProps {
  sailings: Sailing[] | null;
  loading?: boolean;
  error?: string;
  provenance?: ScheduleProvenance | null;
  operatorStatus?: OfficialStatus | null;
  operatorStatusSource?: string | null;
  operatorScheduleUrl?: string;
  routeDisplayName: string;
}

/**
 * Get status display for a sailing
 */
function getSailingStatusDisplay(status: SailingStatus, fromOperator: boolean): {
  text: string;
  className: string;
  iconClassName: string;
} {
  switch (status) {
    case 'on_time':
      return {
        text: 'Running',
        className: 'bg-success-muted/50 text-success border-success/30',
        iconClassName: 'text-success',
      };
    case 'delayed':
      return {
        text: 'Delayed',
        className: 'bg-warning-muted/50 text-warning border-warning/30',
        iconClassName: 'text-warning',
      };
    case 'canceled':
      return {
        text: fromOperator ? 'Canceled' : 'Likely Canceled',
        className: 'bg-destructive-muted/50 text-destructive border-destructive/30',
        iconClassName: 'text-destructive',
      };
    case 'scheduled':
    default:
      return {
        text: 'Scheduled',
        className: 'bg-secondary/50 text-muted-foreground border-border/30',
        iconClassName: 'text-muted-foreground',
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
 */
function getSourceTypeDisplay(sourceType: ScheduleSourceType): {
  label: string;
  className: string;
  showSailings: boolean;
} {
  switch (sourceType) {
    case 'operator_live':
      return {
        label: 'Live',
        className: 'bg-success-muted/50 text-success',
        showSailings: true,
      };
    case 'template':
      return {
        label: 'Template (not live)',
        className: 'bg-warning-muted/50 text-warning',
        showSailings: true,
      };
    case 'unavailable':
    default:
      return {
        label: 'Unavailable',
        className: 'bg-secondary/50 text-muted-foreground',
        showSailings: false,
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

/**
 * Check if a sailing has already departed
 * Uses timezone-aware timestamp comparison with 5-minute grace period
 */
function checkSailingDeparted(sailing: Sailing): boolean {
  return hasSailingDeparted(sailing.departureTimestampMs);
}

/**
 * Get time status for a sailing (departed, boarding, upcoming)
 */
function getSailingStatus(sailing: Sailing): 'departed' | 'boarding' | 'upcoming' {
  return getSailingTimeStatus(sailing.departureTimestampMs);
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
}: TodaySailingsProps) {
  // Determine source type display
  const sourceType = provenance?.source_type || 'unavailable';
  const sourceDisplay = getSourceTypeDisplay(sourceType);

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

  // Handle unavailable state (no static fallback anymore)
  if (sourceType === 'unavailable' || error) {
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
            Live schedule unavailable
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
  const upcomingSailings = sailings.filter((s) => !checkSailingDeparted(s));
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

      {/* Status Summary */}
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

          return (
            <div
              key={index}
              className={`flex items-center gap-4 p-3 rounded-lg border ${
                departed
                  ? 'bg-secondary/30 border-border/20 opacity-60'
                  : 'bg-card border-border/50'
              }`}
            >
              {/* Time */}
              <div className="flex items-center gap-2 w-24 flex-shrink-0">
                <ClockIcon className={`w-4 h-4 ${departed ? 'text-muted-foreground' : 'text-foreground'}`} />
                <span className={`font-mono font-medium ${departed ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {sailing.departureTimeDisplay}
                </span>
              </div>

              {/* Direction */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`truncate ${departed ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {sailing.direction.from}
                </span>
                <ArrowRightIcon className={`w-4 h-4 flex-shrink-0 ${departed ? 'text-muted-foreground' : 'text-muted-foreground'}`} />
                <span className={`truncate ${departed ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {sailing.direction.to}
                </span>
              </div>

              {/* Status */}
              <div className="flex-shrink-0">
                {departed ? (
                  <span className="text-xs text-muted-foreground italic">Departed</span>
                ) : boarding ? (
                  <span className="text-xs px-2 py-1 rounded-full border bg-accent-muted/50 text-accent border-accent/30">
                    Boarding
                  </span>
                ) : (
                  <span className={`text-xs px-2 py-1 rounded-full border ${statusDisplay.className}`}>
                    {statusDisplay.text}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
