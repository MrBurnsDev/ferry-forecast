'use client';

import { getRiskLevel } from '@/lib/scoring/score';

interface RiskBarProps {
  score: number | null;
  loading?: boolean;
  error?: string;
}

export function RiskBar({ score, loading, error }: RiskBarProps) {
  if (loading) {
    return (
      <div className="w-full">
        <div className="flex justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">
            Loading risk assessment...
          </span>
        </div>
        <div className="w-full bg-secondary rounded-full h-3 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="flex justify-between mb-3">
          <span className="text-sm font-medium text-destructive">
            Unable to calculate risk
          </span>
        </div>
        <div className="w-full bg-destructive-muted rounded-full h-3">
          <div className="text-xs text-muted-foreground text-center py-0.5">
            Data unavailable
          </div>
        </div>
        <p className="text-xs text-destructive mt-2">{error}</p>
      </div>
    );
  }

  if (score === null) {
    return (
      <div className="w-full">
        <div className="flex justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">
            Disruption Risk
          </span>
          <span className="text-sm text-muted-foreground">No data</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-3">
          <div className="text-xs text-muted-foreground text-center py-0.5">
            Awaiting forecast data
          </div>
        </div>
      </div>
    );
  }

  const risk = getRiskLevel(score);

  const colorClasses: Record<string, string> = {
    green: 'bg-success',
    yellow: 'bg-warning',
    red: 'bg-destructive',
  };

  const bgColorClasses: Record<string, string> = {
    green: 'bg-success-muted',
    yellow: 'bg-warning-muted',
    red: 'bg-destructive-muted',
  };

  const textColorClasses: Record<string, string> = {
    green: 'text-success',
    yellow: 'text-warning',
    red: 'text-destructive',
  };

  const badgeClasses: Record<string, string> = {
    green: 'status-badge-success',
    yellow: 'status-badge-warning',
    red: 'status-badge-danger',
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <span className="text-lg font-semibold text-foreground">
          Disruption Risk
        </span>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${textColorClasses[risk.color]}`}>
            {score}
          </span>
          <span className={`status-badge ${badgeClasses[risk.color]}`}>
            {risk.label}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className={`w-full ${bgColorClasses[risk.color]} rounded-full h-3 overflow-hidden`}>
        <div
          className={`${colorClasses[risk.color]} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-2">
        <span className="text-xs text-muted-foreground">Low Risk</span>
        <span className="text-xs text-muted-foreground">Moderate</span>
        <span className="text-xs text-muted-foreground">High Risk</span>
      </div>
    </div>
  );
}
