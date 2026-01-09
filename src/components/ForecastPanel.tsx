'use client';

/**
 * ForecastPanel Component
 *
 * Phase 33: 7-Day and 14-Day Travel Forecast UX
 *
 * Displays predictions from ferry_forecast.prediction_snapshots_v2
 * with tabs for 7-day and 14-day forecasts.
 *
 * DATA SOURCE:
 * - Reads from prediction_snapshots_v2 via /api/corridor/[corridorId]/forecast
 * - Uses hours_ahead to determine forecast window:
 *   - 7-day: hours_ahead <= 168
 *   - 14-day: hours_ahead <= 336
 *
 * NO PLACEHOLDER DATA - shows updating message if no predictions exist.
 */

import { useEffect, useState } from 'react';

// Types matching the API response (from prediction_snapshots_v2 schema)
interface ForecastPrediction {
  service_date: string;
  departure_time_local: string;
  risk_level: string;
  risk_score: number;
  confidence: string;
  explanation: string[];
  model_version: string;
  hours_ahead: number;
  // Phase 81: Likelihood fields
  likelihood_to_run_pct?: number;
  likelihood_confidence?: 'high' | 'medium' | 'low';
}

interface DayForecast {
  service_date: string;
  predictions: ForecastPrediction[];
  highest_risk_level: string;
  prediction_count: number;
}

interface CorridorForecast {
  corridor_id: string;
  forecast_type: '7_day' | '14_day';
  days: DayForecast[];
  total_predictions: number;
  generated_at: string;
}

interface ForecastPanelProps {
  corridorId: string;
}

// Risk level colors and labels
const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-green-100', text: 'text-green-800', label: 'Low Risk' },
  moderate: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Moderate' },
  elevated: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Elevated' },
  high: { bg: 'bg-red-100', text: 'text-red-800', label: 'High Risk' },
  severe: { bg: 'bg-red-200', text: 'text-red-900', label: 'Severe' },
};

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

/**
 * Phase 81: Likelihood display for forecast predictions
 * Converts risk_score to likelihood_to_run_pct if not provided
 */
function LikelihoodDisplay({ prediction }: { prediction: ForecastPrediction }) {
  // Use likelihood if available, otherwise convert from risk score
  const likelihood = prediction.likelihood_to_run_pct ?? Math.max(0, 100 - prediction.risk_score);
  const confidence = prediction.likelihood_confidence || prediction.confidence;
  const isEstimate = confidence !== 'high';

  // Color based on likelihood
  const colorClass = likelihood >= 90
    ? 'text-green-600'
    : likelihood >= 70
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <span className={`text-xs font-medium ${colorClass}`}>
      {likelihood}%{isEstimate ? ' (est.)' : ''}
    </span>
  );
}

function DayCard({ day, isExpanded, onToggle }: { day: DayForecast; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
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
          <RiskBadge level={day.highest_risk_level} />
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
                  <LikelihoodDisplay prediction={prediction} />
                </div>
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

export function ForecastPanel({ corridorId }: ForecastPanelProps) {
  const [activeTab, setActiveTab] = useState<'7_day' | '14_day'>('7_day');
  const [forecast, setForecast] = useState<CorridorForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchForecast() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/corridor/${corridorId}/forecast?type=${activeTab}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          setError(result.error || 'Failed to load forecast');
          setForecast(null);
        } else {
          setForecast(result.forecast);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load forecast');
        setForecast(null);
      } finally {
        setLoading(false);
      }
    }

    fetchForecast();
  }, [corridorId, activeTab]);

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

  return (
    <section className="mt-8 bg-card border border-border/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <WindIcon className="w-6 h-6 text-accent" />
          <h2 className="text-xl font-semibold text-foreground">Weather Forecast</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('7_day')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === '7_day'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Next 7 Days
          </button>
          <button
            onClick={() => setActiveTab('14_day')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === '14_day'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Next 14 Days
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3 text-muted-foreground">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Loading forecast...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="py-8 text-center">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && forecast && forecast.days.length === 0 && (
          <div className="py-8 text-center">
            <WindIcon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">
              Forecast data is updating. Check back shortly.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Predictions are generated every 6 hours.
            </p>
          </div>
        )}

        {!loading && !error && forecast && forecast.days.length > 0 && (
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
        )}
      </div>
    </section>
  );
}
