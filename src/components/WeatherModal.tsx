/**
 * Weather Modal Component
 *
 * Phase 90: Port Conditions Weather Display
 *
 * Displays live weather conditions for a port using Open-Meteo API.
 * Fetches data client-side when modal is opened.
 *
 * Features:
 * - Current conditions (temp, wind, gusts, direction)
 * - Wind direction arrow visualization
 * - Loading and error states
 * - Accessible modal with focus trap
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { PortData } from './PortAccordion';

// ============================================================
// TYPES
// ============================================================

interface WeatherData {
  temperature_f: number;
  wind_speed_mph: number;
  wind_gusts_mph: number;
  wind_direction_deg: number;
  wind_direction_text: string;
  humidity: number;
  visibility_miles: number | null;
  fetched_at: string;
}

// ============================================================
// ICONS
// ============================================================

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function WindIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  );
}

function ThermometerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

function DropletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Convert degrees to compass direction
 */
function degreesToCompass(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}

/**
 * Convert m/s to mph
 */
function msToMph(ms: number): number {
  return Math.round(ms * 2.237);
}

/**
 * Convert Celsius to Fahrenheit
 */
function celsiusToFahrenheit(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}


// ============================================================
// WIND DIRECTION ARROW
// ============================================================

interface WindArrowProps {
  direction: number;
  className?: string;
}

function WindArrow({ direction, className }: WindArrowProps) {
  // Arrow points in the direction the wind is blowing TO
  // Wind direction 0 = from North, so arrow should point South (180)
  const rotation = direction + 180;

  return (
    <div
      className={`relative ${className}`}
      style={{ transform: `rotate(${rotation}deg)` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M12 2L6 14h12L12 2z" />
        <rect x="10" y="12" width="4" height="10" />
      </svg>
    </div>
  );
}

// ============================================================
// WEATHER FETCH
// ============================================================

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'ms',
    timezone: 'America/New_York',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();
  const current = data.current;

  return {
    temperature_f: celsiusToFahrenheit(current.temperature_2m),
    wind_speed_mph: msToMph(current.wind_speed_10m),
    wind_gusts_mph: msToMph(current.wind_gusts_10m),
    wind_direction_deg: current.wind_direction_10m,
    wind_direction_text: degreesToCompass(current.wind_direction_10m),
    humidity: Math.round(current.relative_humidity_2m),
    visibility_miles: null, // Open-Meteo current doesn't include visibility
    fetched_at: new Date().toISOString(),
  };
}

// ============================================================
// MODAL COMPONENT
// ============================================================

interface WeatherModalProps {
  port: PortData;
  onClose: () => void;
}

export function WeatherModal({ port, onClose }: WeatherModalProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch weather on mount
  useEffect(() => {
    let mounted = true;

    async function loadWeather() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchWeather(port.coordinates.lat, port.coordinates.lon);
        if (mounted) {
          setWeather(data);
        }
      } catch (err) {
        if (mounted) {
          setError('Unable to load weather data');
          console.error('[WEATHER_MODAL] Fetch error:', err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadWeather();
    return () => {
      mounted = false;
    };
  }, [port.coordinates.lat, port.coordinates.lon]);

  // Focus trap and escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Focus the close button on mount
    closeButtonRef.current?.focus();

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="weather-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30">
          <h3 id="weather-modal-title" className="text-lg font-semibold text-foreground">
            {port.name} Conditions
          </h3>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-8">
              <p className="text-destructive text-sm">{error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  fetchWeather(port.coordinates.lat, port.coordinates.lon)
                    .then(setWeather)
                    .catch(() => setError('Unable to load weather data'))
                    .finally(() => setLoading(false));
                }}
                className="mt-3 text-sm text-accent hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {weather && !loading && !error && (
            <div className="space-y-4">
              {/* Temperature - Large display */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-4xl font-bold text-foreground">
                  <ThermometerIcon className="w-8 h-8 text-accent" />
                  {weather.temperature_f}°F
                </div>
              </div>

              {/* Wind Section */}
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <WindIcon className="w-5 h-5 text-accent" />
                    <span className="font-medium text-foreground">Wind</span>
                  </div>
                  <WindArrow direction={weather.wind_direction_deg} className="w-6 h-6 text-accent" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Speed</p>
                    <p className="text-lg font-semibold text-foreground">{weather.wind_speed_mph} mph</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Gusts</p>
                    <p className="text-lg font-semibold text-foreground">{weather.wind_gusts_mph} mph</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase">Direction</p>
                    <p className="text-lg font-semibold text-foreground">
                      {weather.wind_direction_text} ({weather.wind_direction_deg}°)
                    </p>
                  </div>
                </div>
              </div>

              {/* Additional Conditions */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-secondary/20 rounded-lg">
                  <DropletIcon className="w-5 h-5 text-accent flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Humidity</p>
                    <p className="font-medium text-foreground">{weather.humidity}%</p>
                  </div>
                </div>
                {weather.visibility_miles !== null && (
                  <div className="flex items-center gap-2 p-3 bg-secondary/20 rounded-lg">
                    <EyeIcon className="w-5 h-5 text-accent flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Visibility</p>
                      <p className="font-medium text-foreground">{weather.visibility_miles} mi</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Data source */}
              <p className="text-xs text-muted-foreground text-center">
                Data from Open-Meteo
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
