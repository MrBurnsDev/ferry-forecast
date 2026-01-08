'use client';

/**
 * Region Page
 *
 * Phase 59: Region/Operator/Route Authority
 * Phase 62: Region State + Route Guardrails
 *
 * Shows all operators for a given region.
 * Navigation: Home → Region → Operator → Route
 *
 * AUTHORITY HIERARCHY (ENFORCED):
 * 1. Region (top-level grouping) ← THIS PAGE
 * 2. Operator (region-scoped, source of schedule truth)
 * 3. Route (operator-defined, explicit direction)
 * 4. Sailings (operator-published, NEVER inferred)
 *
 * Phase 62: Sets activeRegionId in global state when user navigates here
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRegion, isValidRegionId, type RegionId } from '@/lib/region';
import { HeaderRegionSelector } from '@/components/RegionSelector';

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

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

// ============================================================
// TYPES
// ============================================================

interface Operator {
  operator_id: string;
  display_name: string;
  slug: string;
  official_url: string;
  active_today: boolean;
}

interface RegionState {
  region_id: string | null;
  operators: Operator[];
  loading: boolean;
  error: string | null;
}

// ============================================================
// DISPLAY NAME LOOKUP
// ============================================================

const REGION_DISPLAY_NAMES: Record<string, string> = {
  cci: 'Cape Cod & Islands',
};

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function RegionPage() {
  const params = useParams();
  const regionId = params.regionId as string;
  const { setActiveRegion, activeRegionId } = useRegion();

  const [state, setState] = useState<RegionState>({
    region_id: null,
    operators: [],
    loading: true,
    error: null,
  });

  // Phase 62: Set active region when user navigates to this page
  useEffect(() => {
    if (isValidRegionId(regionId) && activeRegionId !== regionId) {
      setActiveRegion(regionId as RegionId);
    }
  }, [regionId, activeRegionId, setActiveRegion]);

  useEffect(() => {
    async function fetchOperators() {
      try {
        const response = await fetch(`/api/regions/${regionId}/operators`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          setState({
            region_id: null,
            operators: [],
            loading: false,
            error: result.error || `Error: ${response.status}`,
          });
          return;
        }

        setState({
          region_id: result.region_id,
          operators: result.operators || [],
          loading: false,
          error: null,
        });
      } catch (err) {
        setState({
          region_id: null,
          operators: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch operators',
        });
      }
    }

    fetchOperators();
  }, [regionId]);

  const regionDisplayName = REGION_DISPLAY_NAMES[regionId] || regionId;

  // Error state
  if (state.error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card-maritime p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Region Not Found
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
              <span className="text-xl font-bold text-foreground">Is the Ferry Running?</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="nav-link">Home</Link>
              <HeaderRegionSelector />
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-24 lg:pt-28 py-8 lg:py-12 bathymetric-bg">
        <div className="container mx-auto px-4 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-accent hover:text-accent/80 text-sm font-medium mb-4 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <GlobeIcon className="w-8 h-8 text-accent" />
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                {regionDisplayName}
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Select an operator to view their routes and sailings
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          <div className="max-w-2xl mx-auto">
            {/* Operator Selection */}
            <div className="card-maritime p-6 mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-6">
                Ferry Operators
              </h2>

              {state.loading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-20 bg-secondary/50 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {state.operators.map((operator) => (
                    <Link
                      key={operator.operator_id}
                      href={`/operator/${operator.operator_id}`}
                      className="group flex items-center justify-between p-5 rounded-xl bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-accent/30 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                          <BuildingIcon className="w-6 h-6 text-accent" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                            {operator.display_name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {operator.active_today ? 'Operating today' : 'Seasonal service'}
                          </p>
                        </div>
                      </div>
                      <ArrowRightIcon className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Authority Notice */}
            <div className="bg-secondary/50 border border-border/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Phase 59:</strong> Operators are the source of schedule truth.
                Routes and sailings come directly from each operator - never inferred, never mirrored.
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
              <span className="font-semibold text-foreground">Is the Ferry Running?</span>
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
