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
      className="w-6 h-6 text-gray-600"
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
        className: 'bg-purple-100 text-purple-800 border-purple-300',
      };
    case 'storm_warning':
      return {
        text: 'Storm Warning',
        className: 'bg-red-100 text-red-800 border-red-300',
      };
    case 'gale_warning':
      return {
        text: 'Gale Warning',
        className: 'bg-orange-100 text-orange-800 border-orange-300',
      };
    case 'small_craft_advisory':
      return {
        text: 'Small Craft Advisory',
        className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      };
    default:
      return {
        text: 'No Active Advisories',
        className: 'bg-green-100 text-green-800 border-green-300',
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
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-4">Current Conditions</h3>
        <div className="space-y-3">
          <div className="h-6 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-4">Current Conditions</h3>
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-red-600 text-sm font-medium">
            Unable to load conditions
          </p>
          <p className="text-red-500 text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-4">Current Conditions</h3>
        <div className="bg-gray-50 border border-gray-200 rounded p-3">
          <p className="text-gray-600 text-sm">
            Weather data not yet available
          </p>
        </div>
      </div>
    );
  }

  const advisory = getAdvisoryDisplay(weather.advisory_level);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold mb-4">Current Conditions</h3>

      {/* Advisory Banner */}
      <div className={`rounded border p-2 mb-4 ${advisory.className}`}>
        <span className="text-sm font-medium">{advisory.text}</span>
      </div>

      {/* Wind Conditions */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            Wind Speed
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {weather.wind_speed} <span className="text-sm font-normal">mph</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            Gusts
          </div>
          <div className="text-2xl font-bold text-gray-800">
            {weather.wind_gusts} <span className="text-sm font-normal">mph</span>
          </div>
        </div>
      </div>

      {/* Wind Direction */}
      <div className="flex items-center gap-2 mb-4">
        <WindDirectionArrow degrees={weather.wind_direction} />
        <span className="text-sm text-gray-600">
          {weather.wind_direction}° (from)
        </span>
      </div>

      {/* Tide Info */}
      {tide && (
        <div className="border-t pt-4 mt-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Tide Conditions
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Swing</div>
              <div className="text-lg font-semibold">
                {tide.swing_feet.toFixed(1)} ft
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Phase</div>
              <div className="text-lg font-semibold capitalize">
                {tide.current_phase}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contributing Factors */}
      {factors && factors.length > 0 && (
        <div className="border-t pt-4 mt-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Why This Forecast?
          </div>
          <ul className="space-y-1">
            {factors.slice(0, 3).map((factor, index) => (
              <li key={index} className="text-sm text-gray-600">
                • {factor.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
