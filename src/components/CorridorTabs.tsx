'use client';

/**
 * CorridorTabs Component
 *
 * Phase 34B: Unified Corridor Page UX
 *
 * Single tabbed interface for corridor pages with three tabs:
 * - Today: Shows CorridorBoard with today's sailings
 * - Next 7 Days: Shows forecast predictions (hours_ahead <= 168)
 * - Next 14 Days: Shows forecast predictions (hours_ahead <= 336)
 *
 * This component owns all tab state and decides what content to render.
 * All corridor routes use this component for consistent behavior.
 */

import { useEffect, useState } from 'react';
import type { DailyCorridorBoard } from '@/types/corridor';

// ============================================================
// TYPES
// ============================================================

type TabId = 'today' | '7_day' | '14_day';

/**
 * Phase 56: WeatherContext with authority field for three-state display
 * - 'operator': Measured at ferry terminal (SSA ground truth)
 * - 'local_zip_observation': Current conditions from ZIP code location
 * - 'unavailable': No observation available - show empty state message
 */
interface WeatherContext {
  wind_speed: number | null;
  wind_gusts: number | null;
  wind_direction: number | null;
  advisory_level: string | null;
  authority: 'operator' | 'local_zip_observation' | 'unavailable';
  // Operator fields (when authority='operator')
  terminal_slug?: string;
  age_minutes?: number;
  observation_time?: string;
  // Phase 56: ZIP observation fields (when authority='local_zip_observation')
  zip_code?: string;
  town_name?: string;
  wind_speed_mph?: number;
  wind_speed_kts?: number;
  wind_direction_text?: string;
  source_label?: string;
}

interface ForecastPrediction {
  service_date: string;
  departure_time_local: string;
  risk_level: string;
  risk_score: number;
  confidence: string;
  explanation: string[];
  model_version: string;
  hours_ahead: number;
  sailing_time: string;
  // Phase 51: Wind data
  wind_speed_mph: number | null;
  wind_gust_mph: number | null;
  wind_direction_deg: number | null;
  advisory_level: string | null;
}

// Phase 51: Daily risk summary from API
interface DailyRiskSummary {
  date: string;
  risk_level: 'low' | 'moderate' | 'elevated' | 'high' | 'severe';
  risk_score: number;
  confidence: number;
  confidence_level: 'low' | 'medium' | 'high';
  primary_factors: string[];
  secondary_factors: string[];
  wind: {
    max_speed_mph: number | null;
    max_gust_mph: number | null;
    predominant_direction: string | null;
    worst_period: string | null;
  };
  sailings_analyzed: number;
  high_risk_sailings: number;
  source: 'forecast';
  model: 'gfs' | 'ecmwf' | null;
  hours_ahead: number;
}

interface DayForecast {
  service_date: string;
  predictions: ForecastPrediction[];
  highest_risk_level: string;
  prediction_count: number;
  // Phase 51: Daily risk summary
  daily_risk: DailyRiskSummary;
}

interface CorridorForecast {
  corridor_id: string;
  forecast_type: '7_day' | '14_day';
  days: DayForecast[];
  total_predictions: number;
  generated_at: string;
}

interface CorridorTabsProps {
  corridorId: string;
  board: DailyCorridorBoard | null;
  weatherContext: WeatherContext | null;
  boardLoading: boolean;
  boardError: string | null;
}

// ============================================================
// ICONS
// ============================================================

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function WindIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

// ============================================================
// RISK STYLES
// ============================================================

const RISK_STYLES: Record<string, { bg: string; text: string; label: string; border: string }> = {
  low: { bg: 'bg-green-100', text: 'text-green-800', label: 'Low Risk', border: 'border-green-200' },
  moderate: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Moderate', border: 'border-yellow-200' },
  elevated: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Elevated', border: 'border-orange-200' },
  high: { bg: 'bg-red-100', text: 'text-red-800', label: 'High Risk', border: 'border-red-200' },
  severe: { bg: 'bg-red-200', text: 'text-red-900', label: 'Severe', border: 'border-red-300' },
};

// ============================================================
// PHASE 51: WIND FORMATTING UTILITIES
// ============================================================

const MPH_TO_KNOTS = 0.868976;

/**
 * Format wind speed: "9 mph (8 kt)"
 * Phase 52: Uses "kt" not "kts" per specification
 */
function formatWindSpeed(mph: number | null): string {
  if (mph === null || isNaN(mph)) return '--';
  const knots = Math.round(mph * MPH_TO_KNOTS);
  return `${Math.round(mph)} mph (${knots} kt)`;
}

/**
 * Format wind with direction: "15 mph WNW (13 kt)"
 * Phase 52: Direction comes before knots per specification
 * Example: "15 mph WNW (13 kt)"
 */
function formatWindWithDirection(mph: number | null, direction: string | null): string {
  if (mph === null || isNaN(mph)) return '--';
  const roundedMph = Math.round(mph);
  const knots = Math.round(mph * MPH_TO_KNOTS);
  if (!direction) {
    return `${roundedMph} mph (${knots} kt)`;
  }
  return `${roundedMph} mph ${direction} (${knots} kt)`;
}

/**
 * Generate human-readable risk description
 * Examples:
 * - "Low cancellation risk"
 * - "Moderate cancellation risk - strong WNW winds likely"
 */
function formatRiskDescription(dailyRisk: DailyRiskSummary): string {
  const riskLabels: Record<string, string> = {
    low: 'Low cancellation risk',
    moderate: 'Moderate cancellation risk',
    elevated: 'Elevated cancellation risk',
    high: 'High cancellation risk',
    severe: 'Severe cancellation risk',
  };

  const baseLabel = riskLabels[dailyRisk.risk_level] || 'Unknown risk';

  // For low risk, no additional detail
  if (dailyRisk.risk_level === 'low') {
    return baseLabel;
  }

  // Add primary factor for moderate+ risk
  if (dailyRisk.primary_factors.length > 0 &&
      dailyRisk.primary_factors[0] !== 'Forecast unavailable') {
    const factor = dailyRisk.primary_factors[0].toLowerCase();
    return `${baseLabel} - ${factor}`;
  }

  return baseLabel;
}

// ============================================================
// HELPER COMPONENTS
// ============================================================

function RiskBadge({ level }: { level: string }) {
  const style = RISK_STYLES[level] || RISK_STYLES.moderate;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high: 'bg-blue-100 text-blue-800',
    medium: 'bg-gray-100 text-gray-700',
    low: 'bg-gray-50 text-gray-500',
  };
  const style = styles[confidence] || styles.medium;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${style}`}>
      {confidence} conf.
    </span>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3 text-muted-foreground">
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>Loading...</span>
      </div>
    </div>
  );
}

/**
 * Phase 51: Enhanced DayCard with daily cancellation risk summary
 *
 * Displays:
 * - Human-readable risk description (e.g., "Moderate cancellation risk - strong WNW winds likely")
 * - Wind data in "mph (kts) direction" format
 * - Confidence indicator
 * - Source attribution (Forecast NOAA)
 */
function DayCard({ day, isExpanded, onToggle }: { day: DayForecast; isExpanded: boolean; onToggle: () => void }) {
  const style = RISK_STYLES[day.daily_risk?.risk_level || day.highest_risk_level] || RISK_STYLES.moderate;
  const riskDescription = day.daily_risk ? formatRiskDescription(day.daily_risk) : null;
  const hasWindData = day.daily_risk?.wind?.max_speed_mph !== null;

  return (
    <div className={`border rounded-lg overflow-hidden bg-card ${style.border}`}>
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-5 h-5 text-muted-foreground" />
          <div className="text-left">
            <div className="font-medium text-foreground">{formatDate(day.service_date)}</div>
            <div className="text-xs text-muted-foreground">
              {day.prediction_count} sailing{day.prediction_count !== 1 ? 's' : ''} forecast
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge level={day.daily_risk?.risk_level || day.highest_risk_level} />
          <svg
            className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Phase 51: Daily Risk Summary - always visible below header */}
      {day.daily_risk && (
        <div className={`px-4 pb-3 ${style.bg}`}>
          {/* Risk description */}
          <p className={`text-sm font-medium ${style.text}`}>
            {riskDescription}
          </p>

          {/* Wind & details row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            {/* Wind display: "9 mph (8 kts) WNW" */}
            {hasWindData && (
              <span className="flex items-center gap-1">
                <WindIcon className="w-3.5 h-3.5" />
                <span>
                  {formatWindWithDirection(
                    day.daily_risk.wind.max_speed_mph,
                    day.daily_risk.wind.predominant_direction
                  )}
                </span>
                {day.daily_risk.wind.max_gust_mph !== null &&
                  day.daily_risk.wind.max_gust_mph > (day.daily_risk.wind.max_speed_mph || 0) * 1.2 && (
                  <span className="text-orange-600">
                    (gusts {formatWindSpeed(day.daily_risk.wind.max_gust_mph)})
                  </span>
                )}
              </span>
            )}

            {/* Worst period */}
            {day.daily_risk.wind.worst_period && (
              <span>Worst: {day.daily_risk.wind.worst_period}</span>
            )}

            {/* Confidence */}
            <span>
              {day.daily_risk.confidence_level} confidence
            </span>

            {/* Source attribution */}
            <span className="text-muted-foreground/70">
              Forecast (NOAA)
            </span>
          </div>

          {/* High-risk sailings warning */}
          {day.daily_risk.high_risk_sailings > 0 && (
            <div className="mt-2 text-xs text-orange-700 dark:text-orange-400">
              {day.daily_risk.high_risk_sailings} of {day.daily_risk.sailings_analyzed} sailings at elevated+ risk
            </div>
          )}
        </div>
      )}

      {/* Expanded: Individual sailing predictions */}
      {isExpanded && (
        <div className="border-t border-border/50 p-4 space-y-3 bg-muted/30">
          {day.predictions.map((prediction, idx) => (
            <div
              key={`${prediction.service_date}-${prediction.departure_time_local}-${idx}`}
              className="flex items-start gap-3 p-3 bg-card rounded-lg"
            >
              <div className="flex-shrink-0 text-center min-w-[60px]">
                <div className="text-sm font-medium text-foreground">{prediction.departure_time_local}</div>
                <ConfidenceBadge confidence={prediction.confidence} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <RiskBadge level={prediction.risk_level} />
                  <span className="text-xs text-muted-foreground">
                    Score: {prediction.risk_score}
                  </span>
                </div>
                {/* Phase 51: Wind data for individual sailing */}
                {prediction.wind_speed_mph !== null && (
                  <div className="text-xs text-muted-foreground mb-1">
                    <span className="inline-flex items-center gap-1">
                      <WindIcon className="w-3 h-3" />
                      {formatWindWithDirection(prediction.wind_speed_mph, degreesToCompass(prediction.wind_direction_deg))}
                      {prediction.wind_gust_mph !== null &&
                        prediction.wind_gust_mph > prediction.wind_speed_mph * 1.2 && (
                        <span className="text-orange-600 ml-1">
                          gusts {formatWindSpeed(prediction.wind_gust_mph)}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {prediction.explanation.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {prediction.explanation.join(' • ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Convert degrees to 16-point compass direction
 */
function degreesToCompass(deg: number | null | undefined): string | null {
  if (deg === null || deg === undefined || isNaN(deg)) return null;
  const COMPASS_POINTS = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_POINTS[index];
}

// ============================================================
// FORECAST CONTENT (7-day / 14-day tabs)
// ============================================================

function ForecastContent({
  corridorId,
  forecastType,
}: {
  corridorId: string;
  forecastType: '7_day' | '14_day';
}) {
  const [forecast, setForecast] = useState<CorridorForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchForecast() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/corridor/${corridorId}/forecast?type=${forecastType}`);

        // Check for non-200 responses before parsing JSON
        if (!response.ok) {
          // Try to get error message from response
          try {
            const result = await response.json();
            setError(result.error || `Server error: ${response.status}`);
          } catch {
            setError(`Server error: ${response.status}`);
          }
          setForecast(null);
          return;
        }

        const result = await response.json();

        // Check for API-level success flag
        if (!result.success) {
          setError(result.error || 'Failed to load forecast');
          setForecast(null);
        } else {
          // Successfully got forecast data (may be empty, which is fine)
          setForecast(result.forecast);
          setError(null);
        }
      } catch (err) {
        // Network error or JSON parse failure
        setError(err instanceof Error ? err.message : 'Failed to connect to server');
        setForecast(null);
      } finally {
        setLoading(false);
      }
    }

    fetchForecast();
  }, [corridorId, forecastType]);

  const toggleDay = (serviceDate: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(serviceDate)) {
        next.delete(serviceDate);
      } else {
        next.add(serviceDate);
      }
      return next;
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  // Only show error for true errors (network, server, etc.)
  // NOT for empty data
  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  // Empty data case: table exists but no predictions yet
  if (!forecast || forecast.days.length === 0) {
    return (
      <div className="py-12 text-center">
        <WindIcon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-muted-foreground">
          Forecast data is updating. Check back shortly.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Predictions are generated every 6 hours.
        </p>
      </div>
    );
  }

  // Has forecast data
  return (
    <div className="space-y-3">
      {forecast.days.map((day) => (
        <DayCard
          key={day.service_date}
          day={day}
          isExpanded={expandedDays.has(day.service_date)}
          onToggle={() => toggleDay(day.service_date)}
        />
      ))}

      {/* Footer info */}
      <div className="pt-4 border-t border-border/30">
        <p className="text-xs text-muted-foreground text-center">
          {forecast.total_predictions} predictions • Generated {new Date(forecast.generated_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// TODAY CONTENT (existing CorridorBoard logic inlined)
// ============================================================

// Import the existing CorridorBoard component
import { CorridorBoard } from '@/components/CorridorBoard';

function TodayContent({
  board,
  weatherContext,
  loading,
  error,
}: {
  board: DailyCorridorBoard | null;
  weatherContext: WeatherContext | null;
  loading: boolean;
  error: string | null;
}) {
  // Just wrap CorridorBoard - it already handles loading/error/empty states
  return (
    <CorridorBoard
      board={board}
      weatherContext={weatherContext}
      loading={loading}
      error={error || undefined}
    />
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CorridorTabs({
  corridorId,
  board,
  weatherContext,
  boardLoading,
  boardError,
}: CorridorTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('today');

  const tabs: { id: TabId; label: string; icon: typeof ClockIcon }[] = [
    { id: 'today', label: 'Today', icon: ClockIcon },
    { id: '7_day', label: 'Next 7 Days', icon: CalendarIcon },
    { id: '14_day', label: 'Next 14 Days', icon: CalendarIcon },
  ];

  return (
    <div className="card-maritime overflow-hidden">
      {/* Tab Header */}
      <div className="border-b border-border/50 p-4">
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'today' && (
          <TodayContent
            board={board}
            weatherContext={weatherContext}
            loading={boardLoading}
            error={boardError}
          />
        )}

        {activeTab === '7_day' && (
          <ForecastContent corridorId={corridorId} forecastType="7_day" />
        )}

        {activeTab === '14_day' && (
          <ForecastContent corridorId={corridorId} forecastType="14_day" />
        )}
      </div>
    </div>
  );
}
