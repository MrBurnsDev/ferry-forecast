'use client';

/**
 * Route Weather Context Page
 *
 * Phase 20: This page is SECONDARY to Terminal Boards.
 *
 * PURPOSE: Explain weather risk for a specific route direction
 * NOT FOR: Displaying sailings or schedules (that's Terminal Board's job)
 *
 * Users arrive here from Terminal Board when they want to understand
 * WHY weather conditions may affect a particular crossing.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getRouteById, getOperatorDisplayName, getPortDisplayName } from '@/lib/config/routes';
import { getRouteSensitivity } from '@/lib/utils/navigation';
import { isUsingV2Algorithm } from '@/lib/config/exposure';
import { RiskBar } from '@/components/RiskBar';
import { ForecastTimeline } from '@/components/ForecastTimeline';
import { ConditionsPanel } from '@/components/ConditionsPanel';
import type { ForecastResponse } from '@/types/forecast';

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

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

interface ForecastState {
  data: ForecastResponse | null;
  loading: boolean;
  error: string | null;
}

export default function RouteWeatherPage() {
  const params = useParams();
  const routeId = params.routeId as string;
  const route = getRouteById(routeId);

  const [forecast, setForecast] = useState<ForecastState>({
    data: null,
    loading: true,
    error: null,
  });

  // Fetch forecast data only (no schedule - that's Terminal Board's job)
  useEffect(() => {
    async function fetchForecast() {
      try {
        const response = await fetch(`/api/forecast/route/${routeId}`);
        const data = await response.json();

        if (!response.ok) {
          setForecast({
            data: null,
            loading: false,
            error: data.message || `Error: ${response.status}`,
          });
          return;
        }

        setForecast({
          data,
          loading: false,
          error: null,
        });
      } catch (err) {
        setForecast({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch forecast',
        });
      }
    }

    fetchForecast();
  }, [routeId]);

  if (!route) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card-maritime p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Route Not Found
          </h1>
          <p className="text-muted-foreground mb-6">
            The route &ldquo;{routeId}&rdquo; does not exist.
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

  const originName = getPortDisplayName(route.origin_port);
  const destName = getPortDisplayName(route.destination_port);
  const routeDisplayName = `${originName} → ${destName}`;

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
              <span className="text-sm text-muted-foreground">Cape Cod & Islands</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-24 lg:pt-28 py-8 lg:py-12 bathymetric-bg">
        <div className="container mx-auto px-4 lg:px-8">
          <Link
            href={`/terminal/${route.origin_port}`}
            className="inline-flex items-center gap-2 text-accent hover:text-accent/80 text-sm font-medium mb-4 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to {originName} Terminal
          </Link>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-3">
              <CloudIcon className="w-8 h-8 text-accent" />
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground">
                Weather Context
              </h1>
            </div>
            <p className="text-xl text-foreground mb-2">
              {routeDisplayName}
            </p>
            <p className="text-muted-foreground">
              {getOperatorDisplayName(route.operator)}
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          {/* Explanation Banner */}
          <div className="bg-secondary/50 border border-border/50 rounded-lg p-4 mb-8 flex items-start gap-3">
            <InfoIcon className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">
                This page explains weather conditions that may affect the <strong>{routeDisplayName}</strong> crossing.
                It does not predict cancellations.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                For today&apos;s sailing schedule and operator status, view the{' '}
                <Link href={`/terminal/${route.origin_port}`} className="text-accent hover:underline">
                  {originName} Terminal Board
                </Link>.
              </p>
            </div>
          </div>

          <div className="max-w-2xl mx-auto space-y-6">
            {/* Risk Score */}
            <div className="card-maritime p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Current Risk Level</h2>
              <RiskBar
                score={forecast.data?.current_risk?.score ?? null}
                loading={forecast.loading}
                error={forecast.error && !forecast.data ? undefined : undefined}
              />
            </div>

            {/* Weather Risk Timeline */}
            <div className="card-maritime p-6">
              <ForecastTimeline
                forecasts={forecast.data?.hourly_forecast ?? null}
                loading={forecast.loading}
                error={forecast.error && !forecast.data ? forecast.error : undefined}
              />
            </div>

            {/* Current Conditions */}
            <ConditionsPanel
              weather={forecast.data?.current_conditions?.weather ?? null}
              tide={forecast.data?.current_conditions?.tide ?? null}
              factors={forecast.data?.current_risk?.factors ?? null}
              loading={forecast.loading}
              error={forecast.error && !forecast.data ? forecast.error : undefined}
            />

            {/* Route Sensitivity */}
            {(() => {
              const sensitivity = getRouteSensitivity(routeId);
              if (!sensitivity) return null;
              return (
                <div className="card-maritime p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Route Sensitivity</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                    {sensitivity.exposureDescription}
                  </p>
                  <div className="bg-secondary/50 rounded-lg p-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      Most Affected By
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sensitivity.sensitiveWindDirections.map((dir) => (
                        <span
                          key={dir}
                          className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full"
                        >
                          {dir} winds
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 italic">
                    {isUsingV2Algorithm()
                      ? 'Computed using shelter-signature algorithm (v2). Does not include vessel behavior.'
                      : 'Computed from land shelter and route geometry. Does not include vessel behavior.'}
                  </p>
                </div>
              );
            })()}

            {/* Last Updated */}
            {forecast.data?.metadata && (
              <p className="text-xs text-muted-foreground text-center">
                Weather data last updated: {new Date(forecast.data.metadata.generated_at).toLocaleString()}
              </p>
            )}

            {/* CTA to Terminal Board */}
            <div className="text-center pt-4">
              <Link
                href={`/terminal/${route.origin_port}`}
                className="inline-block bg-accent text-accent-foreground px-6 py-3 rounded-lg font-semibold hover:bg-accent/90 transition-colors"
              >
                View {originName} Departures
              </Link>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 max-w-2xl mx-auto bg-warning-muted border border-warning/30 rounded-xl p-6">
            <p className="text-sm text-warning-foreground leading-relaxed">
              <strong>Important:</strong> Weather risk does not predict cancellations.
              Ferries may run during elevated risk, or be canceled during low risk.
              Always verify with {getOperatorDisplayName(route.operator)} for confirmed status.
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
              <span className="font-semibold text-foreground">Is the Ferry Running?</span>
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
