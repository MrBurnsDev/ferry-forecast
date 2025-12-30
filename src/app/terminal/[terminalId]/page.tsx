'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TerminalBoard } from '@/components/TerminalBoard';
import { getTerminalById, getDestinationsFromTerminal } from '@/lib/config/terminals';
import type { DailyTerminalBoard, TerminalBoardResponse } from '@/types/terminal-board';

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

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ============================================================
// STATE INTERFACE
// ============================================================

interface BoardState {
  board: DailyTerminalBoard | null;
  loading: boolean;
  error: string | null;
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function TerminalPage() {
  const params = useParams();
  const terminalId = params.terminalId as string;
  const terminal = getTerminalById(terminalId);

  const [boardState, setBoardState] = useState<BoardState>({
    board: null,
    loading: true,
    error: null,
  });

  // Fetch terminal board data
  useEffect(() => {
    async function fetchBoard() {
      try {
        const response = await fetch(`/api/terminal/${terminalId}`);
        const data: TerminalBoardResponse = await response.json();

        if (!response.ok || !data.success) {
          setBoardState({
            board: null,
            loading: false,
            error: data.error || `Error: ${response.status}`,
          });
          return;
        }

        setBoardState({
          board: data.board,
          loading: false,
          error: null,
        });
      } catch (err) {
        setBoardState({
          board: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch terminal board',
        });
      }
    }

    fetchBoard();
  }, [terminalId]);

  // Terminal not found
  if (!terminal) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card-maritime p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Terminal Not Found
          </h1>
          <p className="text-muted-foreground mb-6">
            The terminal &ldquo;{terminalId}&rdquo; does not exist.
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

  // Get destinations for quick links
  const destinations = getDestinationsFromTerminal(terminalId);

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
            Back to Terminal Selection
          </Link>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <MapPinIcon className="w-8 h-8 text-accent" />
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                {terminal.name}
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Departures for today &middot; {boardState.board?.service_date_local || 'Loading...'}
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          {/* Trust Statement */}
          <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 mb-8 flex items-start gap-3">
            <InfoIcon className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              This terminal board mirrors the operator&apos;s official schedule. Status updates come directly from the operator when available. Always verify before traveling.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Board */}
            <div className="lg:col-span-2">
              <TerminalBoard
                board={boardState.board}
                loading={boardState.loading}
                error={boardState.error || undefined}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Destinations Card */}
              <div className="card-maritime p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  Destinations from {terminal.name}
                </h3>
                <div className="space-y-2">
                  {destinations.map((dest) => (
                    <Link
                      key={dest.id}
                      href={`/terminal/${dest.id}`}
                      className="block p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <span className="text-foreground font-medium">{dest.name}</span>
                      <span className="text-muted-foreground text-sm ml-2">→ View board</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Operators Card */}
              {boardState.board?.operators && boardState.board.operators.length > 0 && (
                <div className="card-maritime p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">
                    Operators
                  </h3>
                  <div className="space-y-2">
                    {boardState.board.operators.map((op) => (
                      <div key={op.id} className="text-sm">
                        <span className="text-foreground">{op.name}</span>
                        {op.status_url && (
                          <a
                            href={op.status_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-accent hover:underline text-xs mt-1"
                          >
                            Official status page →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Terminals Quick Links */}
              <div className="card-maritime p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  Other Terminals
                </h3>
                <div className="space-y-2">
                  {['woods-hole', 'vineyard-haven', 'oak-bluffs', 'hyannis', 'nantucket']
                    .filter((id) => id !== terminalId)
                    .map((id) => {
                      const t = getTerminalById(id);
                      return t ? (
                        <Link
                          key={id}
                          href={`/terminal/${id}`}
                          className="block p-2 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
                        >
                          {t.name}
                        </Link>
                      ) : null;
                    })}
                </div>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 bg-warning-muted border border-warning/30 rounded-xl p-6">
            <p className="text-sm text-warning-foreground leading-relaxed">
              <strong>Important:</strong> This terminal board displays scheduled departures with operator status when available. Weather conditions may affect service independently. Always verify with the ferry operator before traveling.
            </p>
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
              Not affiliated with any ferry operator. Data: NOAA Marine Forecast, NWS Advisories, NOAA CO-OPS Tides
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
