'use client';

/**
 * Route Page
 *
 * Phase 59: Region/Operator/Route Authority
 *
 * Shows sailings for a specific operator route on a given date.
 * Navigation: Home → Region → Operator → Route (THIS PAGE)
 *
 * AUTHORITY HIERARCHY (ENFORCED):
 * 1. Region (top-level grouping)
 * 2. Operator (region-scoped, source of schedule truth)
 * 3. Route (operator-defined, explicit direction) ← THIS PAGE
 * 4. Sailings (operator-published, NEVER inferred)
 *
 * HARD RULES:
 * - Sailings are NEVER inferred from the reverse direction
 * - If operator shows ZERO sailings → this page shows ZERO sailings
 * - Canceled sailings are included with status="canceled"
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ============================================================
// ICONS
// ============================================================

function WavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function FerryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 21l.5-2A2 2 0 0 1 4.4 17.5h15.2a2 2 0 0 1 1.9 1.5l.5 2" />
      <path d="M4 17V11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
      <path d="M6 9V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4" />
      <path d="M9 9V7h6v2" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
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

// ============================================================
// TYPES
// ============================================================

interface Sailing {
  id: string;
  departure_time_local: string;
  arrival_time_local: string | null;
  status: 'scheduled' | 'on_time' | 'delayed' | 'canceled';
  status_message: string | null;
  vessel_name: string | null;
}

interface RouteState {
  operator_id: string | null;
  route_id: string | null;
  service_date: string | null;
  from_terminal: string | null;
  to_terminal: string | null;
  sailings: Sailing[];
  sailing_count: number;
  source: string | null;
  loading: boolean;
  error: string | null;
}

// ============================================================
// DISPLAY NAME LOOKUPS
// ============================================================

const OPERATOR_DISPLAY_NAMES: Record<string, string> = {
  ssa: 'The Steamship Authority',
  hyline: 'Hy-Line Cruises',
};

const TERMINAL_NAMES: Record<string, string> = {
  'woods-hole': 'Woods Hole',
  'vineyard-haven': 'Vineyard Haven',
  'oak-bluffs': 'Oak Bluffs',
  'hyannis': 'Hyannis',
  'nantucket': 'Nantucket',
};

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function RoutePage() {
  const params = useParams();
  const operatorId = params.operatorId as string;
  const routeId = params.routeId as string;

  const [state, setState] = useState<RouteState>({
    operator_id: null,
    route_id: null,
    service_date: null,
    from_terminal: null,
    to_terminal: null,
    sailings: [],
    sailing_count: 0,
    source: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchSailings() {
      try {
        const response = await fetch(`/api/operators/${operatorId}/routes/${routeId}/sailings`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: result.error || `Error: ${response.status}`,
          }));
          return;
        }

        setState({
          operator_id: result.operator_id,
          route_id: result.route_id,
          service_date: result.service_date,
          from_terminal: result.from_terminal,
          to_terminal: result.to_terminal,
          sailings: result.sailings || [],
          sailing_count: result.sailing_count || 0,
          source: result.source,
          loading: false,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch sailings',
        }));
      }
    }

    fetchSailings();
  }, [operatorId, routeId]);

  const operatorDisplayName = OPERATOR_DISPLAY_NAMES[operatorId] || operatorId;
  const fromTerminalName = state.from_terminal ? TERMINAL_NAMES[state.from_terminal] || state.from_terminal : '';
  const toTerminalName = state.to_terminal ? TERMINAL_NAMES[state.to_terminal] || state.to_terminal : '';

  // Format route ID for display while loading
  const routeDisplayName = routeId
    .split('-')
    .map((part) => part.toUpperCase())
    .join(' → ');

  // Error state
  if (state.error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card-maritime p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Route Not Found
          </h1>
          <p className="text-muted-foreground mb-6">
            {state.error}
          </p>
          <Link
            href={`/operator/${operatorId}`}
            className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-navy-light transition-colors"
          >
            Back to Routes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50" aria-label="Main navigation">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <WavesIcon className="w-8 h-8 text-accent" />
              <span className="text-xl font-bold text-foreground">Ferry Forecast</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="nav-link">Home</Link>
              <Link href="/region/cci" className="nav-link">Cape Cod & Islands</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-24 lg:pt-28 py-8 lg:py-12 bathymetric-bg">
        <div className="container mx-auto px-4 lg:px-8">
          <Link
            href={`/operator/${operatorId}`}
            className="inline-flex items-center gap-2 text-accent hover:text-accent/80 text-sm font-medium mb-4 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to {operatorDisplayName}
          </Link>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <FerryIcon className="w-8 h-8 text-accent" />
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                {fromTerminalName && toTerminalName
                  ? `${fromTerminalName} → ${toTerminalName}`
                  : routeDisplayName}
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">
              {operatorDisplayName} • {state.service_date || 'Today'}
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          <div className="max-w-2xl mx-auto">
            {/* Sailings List */}
            <div className="card-maritime p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">
                  Today&apos;s Sailings
                </h2>
                <span className="text-sm text-muted-foreground">
                  {state.sailing_count} sailing{state.sailing_count !== 1 ? 's' : ''}
                </span>
              </div>

              {state.loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-16 bg-secondary/50 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : state.sailings.length === 0 ? (
                <div className="text-center py-12">
                  <FerryIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No Sailings Today
                  </h3>
                  <p className="text-muted-foreground">
                    {operatorDisplayName} has no sailings on this route today.
                    This could be due to seasonal service or schedule changes.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {state.sailings.map((sailing) => (
                    <SailingCard key={sailing.id} sailing={sailing} />
                  ))}
                </div>
              )}
            </div>

            {/* Source Info */}
            {state.source && (
              <div className="text-center mb-8">
                <span className="text-xs text-muted-foreground">
                  Data source: {state.source}
                </span>
              </div>
            )}

            {/* Authority Notice */}
            <div className="bg-warning-muted border border-warning/30 rounded-xl p-6">
              <p className="text-sm text-warning-foreground leading-relaxed">
                <strong>Important:</strong> Sailings shown are exactly as published by {operatorDisplayName}.
                No sailings are inferred from the reverse direction. If a sailing is not listed,
                the operator has not published it. Always verify with the operator before traveling.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 lg:py-12 bg-secondary border-t border-border/50" role="contentinfo">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <WavesIcon className="w-6 h-6 text-accent" aria-hidden="true" />
              <span className="font-semibold text-foreground">Ferry Forecast</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Not affiliated with any ferry operator. Schedule data from operator websites.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// SAILING CARD COMPONENT
// ============================================================

interface SailingCardProps {
  sailing: Sailing;
}

function SailingCard({ sailing }: SailingCardProps) {
  const statusConfig = getStatusConfig(sailing.status);

  return (
    <div className={`p-4 rounded-lg border ${statusConfig.borderClass} ${statusConfig.bgClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${statusConfig.iconBgClass} flex items-center justify-center`}>
            <ClockIcon className={`w-5 h-5 ${statusConfig.iconClass}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                {sailing.departure_time_local}
              </span>
              {sailing.arrival_time_local && (
                <span className="text-sm text-muted-foreground">
                  → {sailing.arrival_time_local}
                </span>
              )}
            </div>
            {sailing.vessel_name && (
              <p className="text-sm text-muted-foreground">
                {sailing.vessel_name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusConfig.icon}
          <span className={`text-sm font-medium ${statusConfig.textClass}`}>
            {statusConfig.label}
          </span>
        </div>
      </div>
      {sailing.status_message && (
        <p className="mt-2 text-sm text-muted-foreground pl-13">
          {sailing.status_message}
        </p>
      )}
    </div>
  );
}

function getStatusConfig(status: Sailing['status']) {
  switch (status) {
    case 'on_time':
    case 'scheduled':
      return {
        label: 'On Time',
        icon: <CheckCircleIcon className="w-5 h-5 text-success" />,
        textClass: 'text-success',
        bgClass: 'bg-success/5',
        borderClass: 'border-success/20',
        iconBgClass: 'bg-success/10',
        iconClass: 'text-success',
      };
    case 'delayed':
      return {
        label: 'Delayed',
        icon: <AlertCircleIcon className="w-5 h-5 text-warning" />,
        textClass: 'text-warning',
        bgClass: 'bg-warning/5',
        borderClass: 'border-warning/20',
        iconBgClass: 'bg-warning/10',
        iconClass: 'text-warning',
      };
    case 'canceled':
      return {
        label: 'Canceled',
        icon: <XCircleIcon className="w-5 h-5 text-danger" />,
        textClass: 'text-danger',
        bgClass: 'bg-danger/5',
        borderClass: 'border-danger/20',
        iconBgClass: 'bg-danger/10',
        iconClass: 'text-danger',
      };
    default:
      return {
        label: 'Unknown',
        icon: <AlertCircleIcon className="w-5 h-5 text-muted-foreground" />,
        textClass: 'text-muted-foreground',
        bgClass: 'bg-secondary/50',
        borderClass: 'border-border',
        iconBgClass: 'bg-secondary',
        iconClass: 'text-muted-foreground',
      };
  }
}
