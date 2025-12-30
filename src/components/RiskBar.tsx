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
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">
            Loading risk assessment...
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-red-600">
            Unable to calculate risk
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div className="text-xs text-gray-500 text-center py-0.5">
            Data unavailable
          </div>
        </div>
        <p className="text-xs text-red-500 mt-1">{error}</p>
      </div>
    );
  }

  if (score === null) {
    return (
      <div className="w-full">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">
            Disruption Risk
          </span>
          <span className="text-sm text-gray-500">No data</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div className="text-xs text-gray-500 text-center py-0.5">
            Awaiting forecast data
          </div>
        </div>
      </div>
    );
  }

  const risk = getRiskLevel(score);

  const colorClasses: Record<string, string> = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  const bgColorClasses: Record<string, string> = {
    green: 'bg-green-100',
    yellow: 'bg-yellow-100',
    red: 'bg-red-100',
  };

  const textColorClasses: Record<string, string> = {
    green: 'text-green-700',
    yellow: 'text-yellow-700',
    red: 'text-red-700',
  };

  return (
    <div className="w-full">
      <div className="flex justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">
          Disruption Risk
        </span>
        <span className={`text-sm font-semibold ${textColorClasses[risk.color]}`}>
          {score}/100 - {risk.label}
        </span>
      </div>
      <div className={`w-full ${bgColorClasses[risk.color]} rounded-full h-4`}>
        <div
          className={`${colorClasses[risk.color]} h-4 rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">Low</span>
        <span className="text-xs text-gray-400">Moderate</span>
        <span className="text-xs text-gray-400">High</span>
      </div>
    </div>
  );
}
