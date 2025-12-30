'use client';

import type { OfficialStatus } from '@/types/forecast';

interface OfficialStatusBadgeProps {
  status: OfficialStatus | null;
  source: string | null;
  updatedAt: string | null;
  message?: string;
  loading?: boolean;
}

/**
 * Determines if current time is likely outside ferry operating hours
 * Cape Cod ferries generally don't run between ~10 PM and ~6 AM
 * This is a heuristic - actual schedules vary by season and route
 */
function isLikelyOvernightPeriod(): boolean {
  const hour = new Date().getHours();
  // Overnight: 10 PM (22) to 6 AM (6)
  return hour >= 22 || hour < 6;
}

/**
 * Determines if it's early morning when first ferries might be starting
 */
function isEarlyMorning(): boolean {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 7;
}

function getStatusDisplay(status: OfficialStatus | null): {
  text: string;
  className: string;
  bgClass: string;
  iconClass: string;
} {
  switch (status) {
    case 'on_time':
      return {
        text: 'On Time',
        className: 'status-badge-success',
        bgClass: 'bg-success-muted/50',
        iconClass: 'text-success',
      };
    case 'delayed':
      return {
        text: 'Delayed',
        className: 'status-badge-warning',
        bgClass: 'bg-warning-muted/50',
        iconClass: 'text-warning',
      };
    case 'canceled':
      return {
        text: 'Canceled',
        className: 'status-badge-danger',
        bgClass: 'bg-destructive-muted/50',
        iconClass: 'text-destructive',
      };
    case 'unknown':
    default:
      return {
        text: 'No Live Status',
        className: 'bg-secondary text-muted-foreground',
        bgClass: 'bg-secondary/50',
        iconClass: 'text-muted-foreground',
      };
  }
}

function formatSource(source: string | null): string {
  if (!source) return 'Operator';

  switch (source) {
    case 'steamship-authority':
      return 'The Steamship Authority';
    case 'hy-line-cruises':
      return 'Hy-Line Cruises';
    default:
      return source;
  }
}

function StatusIcon({ status }: { status: OfficialStatus | null }) {
  const baseClass = "w-7 h-7";

  switch (status) {
    case 'on_time':
      return (
        <svg className={`${baseClass} text-success`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'delayed':
      return (
        <svg className={`${baseClass} text-warning`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'canceled':
      return (
        <svg className={`${baseClass} text-destructive`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return (
        <svg className={`${baseClass} text-muted-foreground`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

export function OfficialStatusBadge({
  status,
  source,
  updatedAt,
  message,
  loading,
}: OfficialStatusBadgeProps) {
  if (loading) {
    return (
      <div className="card-maritime p-4 lg:p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary rounded-lg animate-pulse" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-secondary rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const display = getStatusDisplay(status);
  const isOvernight = isLikelyOvernightPeriod();
  const isEarly = isEarlyMorning();
  const hasKnownStatus = status && status !== 'unknown';

  // For known statuses (on_time, delayed, canceled), show full display
  if (hasKnownStatus) {
    return (
      <div className="card-maritime p-5 lg:p-6" role="region" aria-label="Operator Status">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${display.bgClass}`}>
            <StatusIcon status={status} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h3 className="text-lg font-semibold text-foreground">
                Operator Status
              </h3>
              <span className={`status-badge ${display.className}`} role="status" aria-live="polite">
                {display.text}
              </span>
            </div>

            {message && (
              <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                {message}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
              {source && (
                <span>Source: {formatSource(source)}</span>
              )}
              {updatedAt && (
                <span>Updated: {new Date(updatedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For unknown status, show context-aware informational message
  // This is intentionally smaller and calmer - not an error state
  return (
    <div className="bg-secondary/50 rounded-lg p-4" role="region" aria-label="Service Information">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          {/* Info icon instead of question mark - less alarming */}
          <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-medium">
            {isOvernight
              ? 'Overnight period'
              : isEarly
              ? 'Early morning'
              : 'Live status unavailable'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isOvernight
              ? 'No scheduled sailings at this time. Service typically resumes in the morning.'
              : isEarly
              ? 'First sailings of the day may be starting soon.'
              : 'Check the operator\'s website for current schedule and status.'}
          </p>
        </div>
      </div>
    </div>
  );
}
