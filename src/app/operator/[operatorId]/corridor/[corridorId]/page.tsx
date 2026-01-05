'use client';

/**
 * Corridor Page
 *
 * Phase 66: Corridor-Based Selection
 *
 * This page shows sailings in BOTH directions for a corridor.
 * Navigation: Home → Region → Operator → Corridor (THIS PAGE)
 *
 * DESIGN PRINCIPLE:
 * Users think in terms of crossings, not directions.
 * This page shows the full bidirectional view of a crossing.
 *
 * Features:
 * - Tabs: Today / Next 7 Days / Next 14 Days
 * - Weather & Conditions card
 * - Risk badges on sailings
 * - Daily forecast cards with risk levels
 * - BOTH directions shown together
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getCorridorById } from '@/lib/config/corridors';
import { CorridorTabs } from '@/components/CorridorTabs';
import type { DailyCorridorBoard } from '@/types/corridor';

// ============================================================
// TYPES
// ============================================================

interface WeatherContext {
  wind_speed: number | null;
  wind_gusts: number | null;
  wind_direction: number | null;
  advisory_level: string | null;
  authority: 'operator' | 'local_zip_observation' | 'unavailable';
  terminal_slug?: string;
  age_minutes?: number;
  observation_time?: string;
  zip_code?: string;
  town_name?: string;
  wind_speed_mph?: number;
  wind_speed_kts?: number;
  wind_direction_text?: string;
  source_label?: string;
}

interface CorridorState {
  corridorId: string | null;
  displayName: string | null;
  board: DailyCorridorBoard | null;
  weatherContext: WeatherContext | null;
  loading: boolean;
  error: string | null;
}

/**
 * Map URL operatorId to internal operator_id used in sailings
 */
const OPERATOR_ID_MAP: Record<string, string> = {
  ssa: 'steamship-authority',
  hyline: 'hy-line-cruises',
};

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

// ============================================================
// DISPLAY NAME LOOKUPS
// ============================================================

const OPERATOR_DISPLAY_NAMES: Record<string, string> = {
  ssa: 'The Steamship Authority',
  hyline: 'Hy-Line Cruises',
};

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function CorridorPage() {
  const params = useParams();
  const operatorId = params.operatorId as string;
  const corridorId = params.corridorId as string;

  const [state, setState] = useState<CorridorState>({
    corridorId: null,
    displayName: null,
    board: null,
    weatherContext: null,
    loading: true,
    error: null,
  });

  // Look up the corridor
  useEffect(() => {
    const corridor = getCorridorById(corridorId);

    if (!corridor) {
      setState({
        corridorId: null,
        displayName: null,
        board: null,
        weatherContext: null,
        loading: false,
        error: `Crossing "${corridorId}" not found. This crossing may have been renamed or is no longer available.`,
      });
      return;
    }

    // Capture for closure
    const displayName = corridor.display_name;

    // Build internal operator ID for API filtering
    const internalOperatorId = OPERATOR_ID_MAP[operatorId] || operatorId;

    // Fetch corridor data with operator filter for single-operator pages
    async function fetchCorridorData() {
      try {
        // Pass operator param for server-side filtering
        const url = `/api/corridor/${corridorId}?operator=${encodeURIComponent(internalOperatorId)}`;
        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok || !result.success) {
          setState({
            corridorId,
            displayName,
            board: null,
            weatherContext: null,
            loading: false,
            error: result.error || `Error: ${response.status}`,
          });
          return;
        }

        setState({
          corridorId,
          displayName,
          board: result.board,
          weatherContext: result.weather_context,
          loading: false,
          error: null,
        });
      } catch (err) {
        setState({
          corridorId,
          displayName,
          board: null,
          weatherContext: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch crossing data',
        });
      }
    }

    setState((prev) => ({ ...prev, corridorId, displayName, loading: true }));
    fetchCorridorData();
  }, [corridorId, operatorId]);

  const operatorDisplayName = OPERATOR_DISPLAY_NAMES[operatorId] || operatorId;

  // Error state - corridor not found
  if (state.error && !state.corridorId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card-maritime p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Crossing Not Found
          </h1>
          <p className="text-muted-foreground mb-6">
            {state.error}
          </p>
          <Link
            href={`/operator/${operatorId}`}
            className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-navy-light transition-colors"
          >
            Back to Crossings
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
                {state.displayName || corridorId.replace(/-/g, ' ')}
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">
              {operatorDisplayName}
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          <div className="max-w-4xl mx-auto">
            {/* Corridor Tabs - Shows both directions */}
            {state.corridorId && (
              <CorridorTabs
                corridorId={state.corridorId}
                board={state.board}
                weatherContext={state.weatherContext}
                boardLoading={state.loading}
                boardError={state.error}
                operatorFilter={OPERATOR_ID_MAP[operatorId] || operatorId}
              />
            )}
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
