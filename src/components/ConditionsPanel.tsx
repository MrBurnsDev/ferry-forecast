'use client';

import type { WeatherSnapshot, TideSwing, ContributingFactor } from '@/types/forecast';

interface ConditionsPanelProps {
  weather: WeatherSnapshot | null;
  tide: TideSwing | null;
  factors: ContributingFactor[] | null;
  loading?: boolean;
  error?: string;
}

function WindDirectionArrow({ degrees }: { degrees: number }) {
  return (
    <svg
      className="w-6 h-6 text-primary"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      style={{ transform: `rotate(${degrees}deg)` }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 10l7-7m0 0l7 7m-7-7v18"
      />
    </svg>
  );
}

function getAdvisoryDisplay(level: string): { text: string; className: string } {
  switch (level) {
    case 'hurricane_warning':
      return {
        text: 'Hurricane Warning',
        className: 'bg-destructive text-destructive-foreground',
      };
    case 'storm_warning':
      return {
        text: 'Storm Warning',
        className: 'bg-destructive text-destructive-foreground',
      };
    case 'gale_warning':
      return {
        text: 'Gale Warning',
        className: 'bg-warning text-warning-foreground',
      };
    case 'small_craft_advisory':
      return {
        text: 'Small Craft Advisory',
        className: 'bg-warning-muted text-warning-foreground',
      };
    default:
      return {
        text: 'No Active Advisories',
        className: 'bg-success-muted text-success',
      };
  }
}

export function ConditionsPanel({
  weather,
  tide,
  factors,
  loading,
  error,
}: ConditionsPanelProps) {
  if (loading) {
    return (
      <div className="card-maritime p-5 lg:p-6">
        <h3 className="text-xl font-semibold text-foreground mb-5">Current Conditions</h3>
        <div className="space-y-4">
          <div className="h-8 bg-secondary rounded-lg animate-pulse" />
          <div className="h-8 bg-secondary rounded-lg animate-pulse" />
          <div className="h-8 bg-secondary rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-maritime p-5 lg:p-6">
        <h3 className="text-xl font-semibold text-foreground mb-5">Current Conditions</h3>
        <div className="bg-destructive-muted border border-destructive/30 rounded-lg p-4">
          <p className="text-destructive text-sm font-medium">
            Unable to load conditions
          </p>
          <p className="text-destructive/80 text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="card-maritime p-5 lg:p-6">
        <h3 className="text-xl font-semibold text-foreground mb-5">Current Conditions</h3>
        <div className="bg-secondary rounded-lg p-4">
          <p className="text-muted-foreground text-sm">
            Weather data not yet available
          </p>
        </div>
      </div>
    );
  }

  const advisory = getAdvisoryDisplay(weather.advisory_level);

  return (
    <div className="card-maritime p-5 lg:p-6">
      <h3 className="text-xl font-semibold text-foreground mb-5">Current Conditions</h3>

      {/* Advisory Banner */}
      <div className={`rounded-lg px-4 py-3 mb-5 ${advisory.className}`}>
        <span className="text-sm font-semibold">{advisory.text}</span>
      </div>

      {/* Wind Conditions */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="p-4 bg-secondary rounded-lg">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Wind Speed
          </div>
          <div className="text-2xl font-bold text-foreground">
            {weather.wind_speed} <span className="text-sm font-normal text-muted-foreground">mph</span>
          </div>
        </div>
        <div className="p-4 bg-secondary rounded-lg">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Gusts
          </div>
          <div className="text-2xl font-bold text-foreground">
            {weather.wind_gusts} <span className="text-sm font-normal text-muted-foreground">mph</span>
          </div>
        </div>
      </div>

      {/* Wind Direction */}
      <div className="flex items-center gap-3 p-4 bg-secondary rounded-lg mb-5">
        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
          <WindDirectionArrow degrees={weather.wind_direction} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Wind Direction
          </div>
          <div className="text-lg font-semibold text-foreground">
            {weather.wind_direction}° <span className="text-muted-foreground font-normal">(from)</span>
          </div>
        </div>
      </div>

      {/* Tide Info */}
      {tide && (
        <div className="border-t border-border/50 pt-5 mt-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Tide Conditions
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-sm text-muted-foreground">Swing</div>
              <div className="text-xl font-bold text-foreground">
                {tide.swing_feet.toFixed(1)} ft
              </div>
            </div>
            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-sm text-muted-foreground">Phase</div>
              <div className="text-xl font-bold text-foreground capitalize">
                {tide.current_phase}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contributing Factors */}
      {factors && factors.length > 0 && (
        <div className="border-t border-border/50 pt-5 mt-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Why This Forecast?
          </div>
          <ul className="space-y-2">
            {factors.slice(0, 3).map((factor, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-accent mt-0.5">•</span>
                <span>{factor.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
