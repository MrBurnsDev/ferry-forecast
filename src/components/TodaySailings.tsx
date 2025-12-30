'use client';

import type { Sailing, SailingStatus } from '@/lib/schedules';
import type { OfficialStatus } from '@/types/forecast';

interface TodaySailingsProps {
  sailings: Sailing[] | null;
  loading?: boolean;
  error?: string;
  operatorStatus?: OfficialStatus | null;
  operatorStatusSource?: string | null;
  operatorScheduleUrl?: string;
  isStaticSchedule?: boolean;
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

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

/**
 * Check if a sailing has already departed
 */
function hasDeparted(departureTime: string): boolean {
  return new Date(departureTime) < new Date();
}

export function TodaySailings({
  sailings,
  loading,
  error,
  operatorStatus,
  operatorStatusSource,
  operatorScheduleUrl,
  isStaticSchedule,
  routeDisplayName,
}: TodaySailingsProps) {
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

  if (error) {
    return (
      <div className="card-maritime p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Today&apos;s Sailings</h2>
        <div className="bg-secondary/50 rounded-lg p-4">
          <p className="text-muted-foreground text-sm">
            Unable to load schedule. Please check the operator&apos;s website directly.
          </p>
          {operatorScheduleUrl && (
            <a
              href={operatorScheduleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-accent text-sm hover:underline"
            >
              View operator schedule <ExternalLinkIcon className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!sailings || sailings.length === 0) {
    return (
      <div className="card-maritime p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Today&apos;s Sailings</h2>
        <div className="bg-secondary/50 rounded-lg p-4">
          <p className="text-muted-foreground text-sm">
            No sailings scheduled for today. This may be due to seasonal service or weather conditions.
          </p>
        </div>
      </div>
    );
  }

  // Count upcoming vs departed
  const upcomingSailings = sailings.filter((s) => !hasDeparted(s.departureTime));
  const canceledCount = sailings.filter((s) => s.status === 'canceled').length;

  return (
    <div className="card-maritime p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
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
          const departed = hasDeparted(sailing.departureTime);
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
        {isStaticSchedule && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <InfoIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Schedule shown is approximate. Actual times may vary by season.
              Check with the operator for confirmed times.
            </p>
          </div>
        )}

        {canceledCount > 0 && canceledCount < sailings.length && (
          <p className="text-xs text-muted-foreground">
            {canceledCount} of {sailings.length} sailings affected today.
            {upcomingSailings.length > canceledCount && ' Other sailings may still run.'}
          </p>
        )}

        <p className="text-xs text-muted-foreground italic">
          Live sailing status is published by the operator. Always verify before traveling.
        </p>
      </div>
    </div>
  );
}
