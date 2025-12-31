'use client';

/**
 * Corridor Page
 *
 * Phase 34B: Unified Corridor Page UX
 *
 * Single page layout for all corridor views with unified tabbed interface:
 * - Today (live sailings)
 * - Next 7 Days (forecast)
 * - Next 14 Days (extended forecast)
 *
 * Uses CorridorTabs component which owns all tab state and content rendering.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CorridorTabs } from '@/components/CorridorTabs';
import type { DailyCorridorBoard } from '@/types/corridor';

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

interface WeatherContext {
  wind_speed: number;
  wind_gusts: number;
  wind_direction: number;
  advisory_level: string;
}

interface BoardState {
  data: DailyCorridorBoard | null;
  weatherContext: WeatherContext | null;
  loading: boolean;
  error: string | null;
}

export default function CorridorPage() {
  const params = useParams();
  const corridorId = params.corridorId as string;

  const [board, setBoard] = useState<BoardState>({
    data: null,
    weatherContext: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchBoard() {
      try {
        const response = await fetch(`/api/corridor/${corridorId}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          setBoard({
            data: null,
            weatherContext: null,
            loading: false,
            error: result.error || `Error: ${response.status}`,
          });
          return;
        }

        setBoard({
          data: result.board,
          weatherContext: result.weather_context || null,
          loading: false,
          error: null,
        });
      } catch (err) {
        setBoard({
          data: null,
          weatherContext: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch corridor board',
        });
      }
    }

    fetchBoard();
  }, [corridorId]);

  // Format corridor name for display while loading
  const corridorDisplayName = corridorId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(' Hole', ' Hole ↔')
    .replace(' Haven', ' Haven')
    .replace(' Bluffs', ' Bluffs')
    .replace('Hyannis Nantucket', 'Hyannis ↔ Nantucket')
    .replace('Hyannis Vineyard', 'Hyannis ↔ Vineyard');

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
              <span className="text-sm text-muted-foreground">Cape Cod & Islands</span>
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
            Back to Terminals
          </Link>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-3">
              <FerryIcon className="w-8 h-8 text-accent" />
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                {board.data?.corridor.display_name || corridorDisplayName}
              </h1>
            </div>
            <p className="text-muted-foreground">
              {board.data?.operators.map((op) => op.name).join(' • ') || 'Loading operators...'}
            </p>
          </div>
        </div>
      </section>

      {/* Main Content - Single Unified Tab Interface */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          <div className="max-w-3xl mx-auto">
            {/* Unified CorridorTabs - owns all tab state and content */}
            <CorridorTabs
              corridorId={corridorId}
              board={board.data}
              weatherContext={board.weatherContext}
              boardLoading={board.loading}
              boardError={board.error}
            />

            {/* Disclaimer */}
            <div className="mt-8 bg-warning-muted border border-warning/30 rounded-xl p-6">
              <p className="text-sm text-warning-foreground leading-relaxed">
                <strong>Important:</strong> This board shows scheduled sailings in both directions.
                Status information is from the operator when available.
                Always verify with the operator before traveling, especially during severe weather.
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
