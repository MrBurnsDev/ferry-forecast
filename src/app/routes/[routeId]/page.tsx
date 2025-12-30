'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getRouteById, getOperatorDisplayName, getPortDisplayName } from '@/lib/config/routes';
import { RiskBar } from '@/components/RiskBar';
import { ForecastTimeline } from '@/components/ForecastTimeline';
import { ConditionsPanel } from '@/components/ConditionsPanel';
import { OfficialStatusBadge } from '@/components/OfficialStatusBadge';
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

interface ForecastState {
  data: ForecastResponse | null;
  loading: boolean;
  error: string | null;
}

export default function RoutePage() {
  const params = useParams();
  const routeId = params.routeId as string;
  const route = getRouteById(routeId);

  const [forecast, setForecast] = useState<ForecastState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchForecast() {
      try {
        const response = await fetch(`/api/forecast/route/${routeId}`);
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 503) {
            setForecast({
              data: null,
              loading: false,
              error: data.message || 'Forecast data not yet available',
            });
          } else {
            setForecast({
              data: null,
              loading: false,
              error: data.message || `Error: ${response.status}`,
            });
          }
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
            Back to Route Selection
          </Link>
          <div className="max-w-2xl">
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-3">
              {getPortDisplayName(route.origin_port)} → {getPortDisplayName(route.destination_port)}
            </h1>
            <p className="text-muted-foreground text-lg">
              {getOperatorDisplayName(route.operator)}
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="main-content" className="flex-1" role="main">
        <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
          {/* Error State */}
          {forecast.error && !forecast.loading && (
            <div className="bg-warning-muted border border-warning/30 rounded-xl p-5 mb-6">
              <h3 className="font-semibold text-warning-foreground mb-1">
                Forecast Data Unavailable
              </h3>
              <p className="text-warning-foreground/80 text-sm">{forecast.error}</p>
              <p className="text-warning-foreground/60 text-xs mt-2">
                This feature is under development. Check back soon for live forecasts.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content Area */}
            <div className="lg:col-span-2 space-y-6">
              {/* Risk Score */}
              <div className="card-maritime p-6 lg:p-8">
                <RiskBar
                  score={forecast.data?.current_risk?.score ?? null}
                  loading={forecast.loading}
                  error={forecast.error && !forecast.data ? undefined : undefined}
                />
              </div>

              {/* Official Status */}
              <OfficialStatusBadge
                status={forecast.data?.official_status?.status ?? null}
                source={forecast.data?.official_status?.source ?? null}
                updatedAt={forecast.data?.official_status?.updated_at ?? null}
                message={forecast.data?.official_status?.message}
                loading={forecast.loading}
              />

              {/* 24-Hour Timeline */}
              <div className="card-maritime p-6 lg:p-8">
                <ForecastTimeline
                  forecasts={forecast.data?.hourly_forecast ?? null}
                  loading={forecast.loading}
                  error={forecast.error && !forecast.data ? forecast.error : undefined}
                />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Conditions Panel */}
              <ConditionsPanel
                weather={forecast.data?.current_conditions?.weather ?? null}
                tide={forecast.data?.current_conditions?.tide ?? null}
                factors={forecast.data?.current_risk?.factors ?? null}
                loading={forecast.loading}
                error={forecast.error && !forecast.data ? forecast.error : undefined}
              />

              {/* Route Info */}
              <div className="card-maritime p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Route Information</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between p-3 rounded-lg bg-secondary/50">
                    <dt className="text-muted-foreground">Origin</dt>
                    <dd className="font-medium text-foreground">
                      {getPortDisplayName(route.origin_port)}
                    </dd>
                  </div>
                  <div className="flex justify-between p-3 rounded-lg bg-secondary/50">
                    <dt className="text-muted-foreground">Destination</dt>
                    <dd className="font-medium text-foreground">
                      {getPortDisplayName(route.destination_port)}
                    </dd>
                  </div>
                  <div className="flex justify-between p-3 rounded-lg bg-secondary/50">
                    <dt className="text-muted-foreground">Operator</dt>
                    <dd className="font-medium text-foreground">
                      {getOperatorDisplayName(route.operator)}
                    </dd>
                  </div>
                  <div className="flex justify-between p-3 rounded-lg bg-secondary/50">
                    <dt className="text-muted-foreground">Crossing Type</dt>
                    <dd className="font-medium text-foreground capitalize">
                      {route.crossing_type.replace('_', ' ')}
                    </dd>
                  </div>
                  <div className="flex justify-between p-3 rounded-lg bg-secondary/50">
                    <dt className="text-muted-foreground">Route Bearing</dt>
                    <dd className="font-medium text-foreground">{route.bearing_degrees}°</dd>
                  </div>
                </dl>
              </div>

              {/* Forecast Summary */}
              <div className="card-maritime p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Forecast Summary</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {forecast.loading
                    ? 'Loading forecast data...'
                    : forecast.error
                    ? 'Unable to generate summary.'
                    : 'Conditions are being monitored continuously. Check the 24-hour timeline for detailed predictions.'}
                </p>
                {forecast.data?.metadata && (
                  <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/50">
                    Last updated: {new Date(forecast.data.metadata.generated_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 bg-warning-muted border border-warning/30 rounded-xl p-6">
            <p className="text-sm text-warning-foreground leading-relaxed">
              <strong>Important:</strong> This forecast shows the predicted{' '}
              <em>risk of disruption</em> based on weather conditions. It is not a
              guarantee of delays or cancellations. Always verify with{' '}
              {getOperatorDisplayName(route.operator)} for official status before traveling.
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
