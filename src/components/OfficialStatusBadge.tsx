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
  icon: string;
} {
  switch (status) {
    case 'on_time':
      return {
        text: 'On Time',
        className: 'bg-green-100 text-green-800 border-green-300',
        icon: '✓',
      };
    case 'delayed':
      return {
        text: 'Delayed',
        className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        icon: '⏱',
      };
    case 'canceled':
      return {
        text: 'Canceled',
        className: 'bg-red-100 text-red-800 border-red-300',
        icon: '✕',
      };
    case 'unknown':
    default:
      return {
        text: 'No official status available',
        className: 'bg-gray-100 text-gray-600 border-gray-300',
        icon: '?',
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

export function OfficialStatusBadge({
  status,
  source,
  updatedAt,
  message,
  loading,
}: OfficialStatusBadgeProps) {
  if (loading) {
    return (
      <div className="border rounded-lg p-4 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-300 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-300 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const display = getStatusDisplay(status);

  return (
    <div className={`border rounded-lg p-4 ${display.className}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{display.icon}</span>
        <span className="font-semibold">Operator Reported: {display.text}</span>
      </div>

      {message && (
        <p className="text-sm mb-2">{message}</p>
      )}

      <div className="text-xs opacity-75">
        {source && <span>Source: {formatSource(source)}</span>}
        {updatedAt && (
          <span className="ml-2">
            • Updated: {new Date(updatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {!status || status === 'unknown' ? (
        <p className="text-xs mt-2 italic">
          Official status from the ferry operator is not currently available.
          Check the operator&apos;s website for the most accurate information.
        </p>
      ) : null}
    </div>
  );
}
