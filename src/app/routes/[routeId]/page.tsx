'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { getRouteById, getOperatorDisplayName, getPortDisplayName } from '@/lib/config/routes';
import { RiskBar } from '@/components/RiskBar';
import { ForecastTimeline } from '@/components/ForecastTimeline';
import { ConditionsPanel } from '@/components/ConditionsPanel';
import { OfficialStatusBadge } from '@/components/OfficialStatusBadge';
import type { ForecastResponse } from '@/types/forecast';

interface RoutePageProps {
  params: Promise<{
    routeId: string;
  }>;
}

interface ForecastState {
  data: ForecastResponse | null;
  loading: boolean;
  error: string | null;
}

export default function RoutePage({ params }: RoutePageProps) {
  const resolvedParams = use(params);
  const routeId = resolvedParams.routeId;
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
          // Handle expected "not implemented" state
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Route Not Found
          </h1>
          <p className="text-gray-600 mb-6">
            The route &ldquo;{routeId}&rdquo; does not exist.
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy text-white py-6">
        <div className="max-w-4xl mx-auto px-4">
          <Link
            href="/"
            className="text-ocean-light hover:text-white text-sm mb-2 inline-block"
          >
            ← Back to Route Selection
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold">
            {getPortDisplayName(route.origin_port)} →{' '}
            {getPortDisplayName(route.destination_port)}
          </h1>
          <p className="text-ocean-light">
            {getOperatorDisplayName(route.operator)}
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Error State */}
        {forecast.error && !forecast.loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-amber-800 mb-1">
              Forecast Data Unavailable
            </h3>
            <p className="text-amber-700 text-sm">{forecast.error}</p>
            <p className="text-amber-600 text-xs mt-2">
              This feature is under development. Check back soon for live
              forecasts.
            </p>
          </div>
        )}

        {/* Risk Score */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <RiskBar
            score={forecast.data?.current_risk?.score ?? null}
            loading={forecast.loading}
            error={forecast.error && !forecast.data ? undefined : undefined}
          />
        </div>

        {/* Official Status */}
        <div className="mb-6">
          <OfficialStatusBadge
            status={forecast.data?.official_status?.status ?? null}
            source={forecast.data?.official_status?.source ?? null}
            updatedAt={forecast.data?.official_status?.updated_at ?? null}
            message={forecast.data?.official_status?.message}
            loading={forecast.loading}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Conditions Panel */}
          <ConditionsPanel
            weather={forecast.data?.current_conditions?.weather ?? null}
            tide={forecast.data?.current_conditions?.tide ?? null}
            factors={forecast.data?.current_risk?.factors ?? null}
            loading={forecast.loading}
            error={forecast.error && !forecast.data ? forecast.error : undefined}
          />

          {/* Route Info */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold mb-4">Route Information</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Origin</dt>
                <dd className="font-medium">
                  {getPortDisplayName(route.origin_port)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Destination</dt>
                <dd className="font-medium">
                  {getPortDisplayName(route.destination_port)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Operator</dt>
                <dd className="font-medium">
                  {getOperatorDisplayName(route.operator)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Crossing Type</dt>
                <dd className="font-medium capitalize">
                  {route.crossing_type.replace('_', ' ')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Route Bearing</dt>
                <dd className="font-medium">{route.bearing_degrees}°</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* 24-Hour Timeline */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <ForecastTimeline
            forecasts={forecast.data?.hourly_forecast ?? null}
            loading={forecast.loading}
            error={forecast.error && !forecast.data ? forecast.error : undefined}
          />
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>Important:</strong> This forecast shows the predicted{' '}
          <em>risk of disruption</em> based on weather conditions. It is not a
          guarantee of delays or cancellations. Always verify with{' '}
          {getOperatorDisplayName(route.operator)} for official status before
          traveling.
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-600">
          <p>Ferry Forecast is not affiliated with any ferry operator.</p>
          {forecast.data?.metadata && (
            <p className="mt-1 text-xs text-gray-400">
              Last updated:{' '}
              {new Date(forecast.data.metadata.generated_at).toLocaleString()}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
