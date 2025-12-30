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
  // Title and subtitle for the timeline - clarifies this is weather-based, not schedule-based
  const timelineTitle = 'Weather Risk Timeline';
  const timelineSubtitle = 'Next 24 hours';

  if (loading) {
    return (
      <div className="w-full">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-foreground">{timelineTitle}</h3>
          <p className="text-xs text-muted-foreground">{timelineSubtitle}</p>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-20 h-28 bg-secondary rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-foreground">{timelineTitle}</h3>
          <p className="text-xs text-muted-foreground">{timelineSubtitle}</p>
        </div>
        <div className="bg-destructive-muted border border-destructive/30 rounded-lg p-4">
          <p className="text-destructive text-sm font-medium">
            Unable to load forecast
          </p>
          <p className="text-destructive/80 text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!forecasts || forecasts.length === 0) {
    return (
      <div className="w-full">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-foreground">{timelineTitle}</h3>
          <p className="text-xs text-muted-foreground">{timelineSubtitle}</p>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <p className="text-muted-foreground text-sm">
            Forecast data not yet available
          </p>
        </div>
      </div>
    );
  }

  const colorClasses: Record<string, string> = {
    green: 'bg-success-muted/50 border-success/30',
    yellow: 'bg-warning-muted/50 border-warning/30',
    red: 'bg-destructive-muted/50 border-destructive/30',
  };

  const dotColorClasses: Record<string, string> = {
    green: 'bg-success',
    yellow: 'bg-warning',
    red: 'bg-destructive',
  };

  const textClasses: Record<string, string> = {
    green: 'text-success',
    yellow: 'text-warning',
    red: 'text-destructive',
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-foreground">{timelineTitle}</h3>
        <p className="text-xs text-muted-foreground">{timelineSubtitle}</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {forecasts.map((forecast, index) => {
          const risk = getRiskLevel(forecast.score);
          const time = parseISO(forecast.hour);
          const isNow = index === 0;

          return (
            <div
              key={index}
              className={`flex-shrink-0 w-20 p-3 rounded-lg border-2 transition-all ${colorClasses[risk.color]} ${isNow ? 'ring-2 ring-accent ring-offset-2' : ''}`}
            >
              <div className={`text-xs font-semibold text-center mb-2 ${isNow ? 'text-accent' : 'text-foreground'}`}>
                {isNow ? 'Now' : format(time, 'ha')}
              </div>
              <div className="flex justify-center mb-2">
                <div
                  className={`w-4 h-4 rounded-full ${dotColorClasses[risk.color]}`}
                />
              </div>
              <div className={`text-lg font-bold text-center ${textClasses[risk.color]}`}>
                {forecast.score}
              </div>
              <div className="text-xs text-center text-muted-foreground mt-1">
                {forecast.weather.wind_speed}mph
              </div>
            </div>
          );
        })}
      </div>

      {/* Explanatory text - clarifies this is about conditions, not specific ferry trips */}
      <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
        Shows how weather conditions may change over time. Individual ferry sailings may be affected differently based on vessel and schedule.
      </p>
    </div>
  );
}
