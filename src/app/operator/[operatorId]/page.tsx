'use client';

/**
 * Operator Page
 *
 * Phase 59: Region/Operator/Route Authority
 *
 * Shows all routes for a given operator.
 * Navigation: Home → Region → Operator → Route
 *
 * AUTHORITY HIERARCHY (ENFORCED):
 * 1. Region (top-level grouping)
 * 2. Operator (region-scoped, source of schedule truth) ← THIS PAGE
 * 3. Route (operator-defined, explicit direction)
 * 4. Sailings (operator-published, NEVER inferred)
 *
 * HARD RULES:
 * - Routes are NEVER shared across operators
 * - Direction is explicit - never inferred
 * - Routes exist even if they have zero sailings today
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

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
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

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9v.01" />
      <path d="M9 12v.01" />
      <path d="M9 15v.01" />
      <path d="M9 18v.01" />
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

// ============================================================
// TYPES
// ============================================================

interface OperatorRoute {
  route_id: string;
  from_terminal: string;
  to_terminal: string;
  display_name: string;
  active: boolean;
}

interface OperatorState {
  operator_id: string | null;
  routes: OperatorRoute[];
  loading: boolean;
  error: string | null;
}

// ============================================================
// DISPLAY NAME LOOKUP
// ============================================================

const OPERATOR_DISPLAY_NAMES: Record<string, { name: string; url: string }> = {
  ssa: { name: 'The Steamship Authority', url: 'https://www.steamshipauthority.com' },
  hyline: { name: 'Hy-Line Cruises', url: 'https://hylinecruises.com' },
};

// Terminal display names
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

export default function OperatorPage() {
  const params = useParams();
  const operatorId = params.operatorId as string;

  const [state, setState] = useState<OperatorState>({
    operator_id: null,
    routes: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchRoutes() {
      try {
        const response = await fetch(`/api/operators/${operatorId}/routes`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          setState({
            operator_id: null,
            routes: [],
            loading: false,
            error: result.error || `Error: ${response.status}`,
          });
          return;
        }

        setState({
          operator_id: result.operator_id,
          routes: result.routes || [],
          loading: false,
          error: null,
        });
      } catch (err) {
        setState({
          operator_id: null,
          routes: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch routes',
        });
      }
    }

    fetchRoutes();
  }, [operatorId]);

  const operatorInfo = OPERATOR_DISPLAY_NAMES[operatorId] || { name: operatorId, url: '' };

  // Error state
  if (state.error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card-maritime p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Operator Not Found
          </h1>
          <p className="text-muted-foreground mb-6">
            {state.error}
          </p>
          <Link
            href="/"
            className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-navy-light transition-colors"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  // Group routes by terminal pair for better UX
  const routePairs = groupRoutesByPair(state.routes);

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
            href="/region/cci"
            className="inline-flex items-center gap-2 text-accent hover:text-accent/80 text-sm font-medium mb-4 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Cape Cod & Islands
          </Link>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <BuildingIcon className="w-8 h-8 text-accent" />
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                {operatorInfo.name}
              </h1>
            </div>
            <p className="text-muted-foreground text-lg mb-3">
              Select a route to view today&apos;s sailings
            </p>
            {operatorInfo.url && (
              <a
                href={operatorInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent/80 transition-colors"
              >
                Official Website
                <ExternalLinkIcon className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          <div className="max-w-2xl mx-auto">
            {/* Route Selection */}
            <div className="card-maritime p-6 mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-6">
                Routes
              </h2>

              {state.loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-24 bg-secondary/50 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {routePairs.map((pair) => (
                    <div key={pair.key} className="space-y-3">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        {TERMINAL_NAMES[pair.terminalA] || pair.terminalA} ↔ {TERMINAL_NAMES[pair.terminalB] || pair.terminalB}
                      </h3>
                      <div className="space-y-2">
                        {pair.routes.map((route) => (
                          <Link
                            key={route.route_id}
                            href={`/operator/${operatorId}/route/${route.route_id}`}
                            className="group flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-accent/30 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                                <FerryIcon className="w-5 h-5 text-accent" />
                              </div>
                              <div>
                                <h4 className="font-semibold text-foreground group-hover:text-accent transition-colors">
                                  {route.display_name}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {route.active ? 'Active route' : 'Seasonal'}
                                </p>
                              </div>
                            </div>
                            <ArrowRightIcon className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Authority Notice */}
            <div className="bg-secondary/50 border border-border/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Phase 59 Authority:</strong> Routes are explicitly defined
                by {operatorInfo.name}. Each direction is a separate route - sailings are NEVER inferred
                from the reverse direction.
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
// HELPER FUNCTIONS
// ============================================================

interface RoutePair {
  key: string;
  terminalA: string;
  terminalB: string;
  routes: OperatorRoute[];
}

function groupRoutesByPair(routes: OperatorRoute[]): RoutePair[] {
  const pairMap = new Map<string, RoutePair>();

  for (const route of routes) {
    // Create a canonical key for the terminal pair (alphabetically sorted)
    const terminals = [route.from_terminal, route.to_terminal].sort();
    const key = `${terminals[0]}--${terminals[1]}`;

    if (!pairMap.has(key)) {
      pairMap.set(key, {
        key,
        terminalA: terminals[0],
        terminalB: terminals[1],
        routes: [],
      });
    }

    pairMap.get(key)!.routes.push(route);
  }

  return Array.from(pairMap.values());
}
