'use client';

import { format, parseISO } from 'date-fns';
import type { HourlyForecast } from '@/types/forecast';
import { getRiskLevel } from '@/lib/scoring/score';

interface ForecastTimelineProps {
  forecasts: HourlyForecast[] | null;
  loading?: boolean;
  error?: string;
}

export function ForecastTimeline({
  forecasts,
  loading,
  error,
}: ForecastTimelineProps) {
  if (loading) {
    return (
      <div className="w-full">
        <h3 className="text-lg font-semibold mb-4">24-Hour Forecast</h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-16 h-24 bg-gray-200 rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <h3 className="text-lg font-semibold mb-4">24-Hour Forecast</h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm font-medium">
            Unable to load forecast
          </p>
          <p className="text-red-500 text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!forecasts || forecasts.length === 0) {
    return (
      <div className="w-full">
        <h3 className="text-lg font-semibold mb-4">24-Hour Forecast</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-gray-600 text-sm">
            Forecast data not yet available
          </p>
        </div>
      </div>
    );
  }

  const colorClasses: Record<string, string> = {
    green: 'bg-green-100 border-green-300',
    yellow: 'bg-yellow-100 border-yellow-300',
    red: 'bg-red-100 border-red-300',
  };

  const dotColorClasses: Record<string, string> = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">24-Hour Forecast</h3>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {forecasts.map((forecast, index) => {
          const risk = getRiskLevel(forecast.score);
          const time = parseISO(forecast.hour);

          return (
            <div
              key={index}
              className={`flex-shrink-0 w-16 p-2 rounded border ${colorClasses[risk.color]}`}
            >
              <div className="text-xs font-medium text-gray-700 text-center">
                {format(time, 'ha')}
              </div>
              <div className="flex justify-center my-2">
                <div
                  className={`w-4 h-4 rounded-full ${dotColorClasses[risk.color]}`}
                />
              </div>
              <div className="text-xs text-center text-gray-600">
                {forecast.score}
              </div>
              <div className="text-xs text-center text-gray-500">
                {forecast.weather.wind_speed}mph
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
