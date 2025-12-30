'use client';

import type { OfficialStatus } from '@/types/forecast';

interface OfficialStatusBadgeProps {
  status: OfficialStatus | null;
  source: string | null;
  updatedAt: string | null;
  message?: string;
  loading?: boolean;
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
        text: 'Status Unknown',
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
        <svg className={`${baseClass} text-success`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'delayed':
      return (
        <svg className={`${baseClass} text-warning`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'canceled':
      return (
        <svg className={`${baseClass} text-destructive`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return (
        <svg className={`${baseClass} text-muted-foreground`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <div className="card-maritime p-6 lg:p-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-secondary rounded-xl animate-pulse" />
          <div className="flex-1">
            <div className="h-5 w-32 bg-secondary rounded animate-pulse mb-2" />
            <div className="h-4 w-48 bg-secondary rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const display = getStatusDisplay(status);

  return (
    <div className="card-maritime p-6 lg:p-8">
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${display.bgClass}`}>
          <StatusIcon status={status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className="text-xl lg:text-2xl font-semibold text-foreground">
              Operator Status
            </h3>
            <span className={`status-badge ${display.className}`}>
              {display.text}
            </span>
          </div>

          {message && (
            <p className="text-muted-foreground leading-relaxed mb-3">
              {message}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {source && (
              <span>Source: {formatSource(source)}</span>
            )}
            {updatedAt && (
              <span>Updated: {new Date(updatedAt).toLocaleTimeString()}</span>
            )}
          </div>

          {(!status || status === 'unknown') && (
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
              Official status from the ferry operator is not currently available.
              Check the operator&apos;s website for the most accurate information.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
