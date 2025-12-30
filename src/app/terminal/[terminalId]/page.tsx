'use client';

/**
 * Terminal Discovery Page
 *
 * Phase 21: Service Corridor Architecture
 *
 * This page is now a DISCOVERY page that helps users find the right corridor.
 * The actual operational view (all sailings) is on the Corridor Board.
 *
 * Flow: Home → Terminal → Corridor Board
 */

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getTerminalById } from '@/lib/config/terminals';
import { getCorridorSummariesForTerminal } from '@/lib/config/corridors';

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

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
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
// MAIN PAGE COMPONENT
// ============================================================

export default function TerminalPage() {
  const params = useParams();
  const terminalId = params.terminalId as string;
  const terminal = getTerminalById(terminalId);

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

  // Get corridors from this terminal
  const corridorSummaries = getCorridorSummariesForTerminal(terminalId);

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
              Select your destination to view today&apos;s sailings
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          <div className="max-w-2xl mx-auto">
            {/* Corridor Selection */}
            <div className="card-maritime p-6 mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-6">
                Where are you going?
              </h2>
              <div className="space-y-4">
                {corridorSummaries.map((corridor) => (
                  <Link
                    key={corridor.id}
                    href={`/corridor/${corridor.id}`}
                    className="group flex items-center justify-between p-5 rounded-xl bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-accent/30 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                        <FerryIcon className="w-6 h-6 text-accent" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                          {corridor.other_terminal.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {corridor.operators.map((op) => op.name).join(', ')}
                        </p>
                      </div>
                    </div>
                    <ArrowRightIcon className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Explanation */}
            <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 mb-8">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">How it works:</strong> Select your destination to see all sailings in both directions between {terminal.name} and that destination. This includes departures and arrivals, ordered by time.
              </p>
            </div>

            {/* Other Terminals */}
            <div className="card-maritime p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Other Terminals
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {['woods-hole', 'vineyard-haven', 'oak-bluffs', 'hyannis', 'nantucket']
                  .filter((id) => id !== terminalId)
                  .map((id) => {
                    const t = getTerminalById(id);
                    return t ? (
                      <Link
                        key={id}
                        href={`/terminal/${id}`}
                        className="p-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors text-center"
                      >
                        {t.name}
                      </Link>
                    ) : null;
                  })}
              </div>
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
