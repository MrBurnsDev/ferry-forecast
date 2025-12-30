// Scoring Weights Configuration
// These are tunable parameters for the deterministic scoring engine

import type { ScoringWeights } from '@/types/forecast';

// Default scoring weights - can be tuned based on historical data
export const DEFAULT_WEIGHTS: ScoringWeights = {
  // Wind conditions
  sustained_wind_30: 25, // +25 for sustained wind >= 30 mph
  unfavorable_wind_20: 15, // +15 for wind >= 20 mph in unfavorable direction

  // Advisory levels (mutually exclusive - use highest applicable)
  small_craft_advisory: 30,
  gale_warning: 40,
  storm_warning: 60,
  hurricane_warning: 80,

  // Tide conditions
  extreme_tide_swing: 15, // +10-20 based on severity

  // Historical patterns
  historical_match: 25, // +10-40 based on pattern match strength
};

// Wind speed thresholds
export const WIND_THRESHOLDS = {
  MODERATE: 15, // Start considering impact
  SIGNIFICANT: 20, // Notable impact, especially with direction
  SEVERE: 30, // Major impact
  CRITICAL: 40, // Very high likelihood of disruption
} as const;

// Gust thresholds (typically higher than sustained)
export const GUST_THRESHOLDS = {
  MODERATE: 25,
  SIGNIFICANT: 35,
  SEVERE: 45,
  CRITICAL: 55,
} as const;

// Tide swing thresholds (feet)
export const TIDE_THRESHOLDS = {
  NORMAL: 4, // Normal range
  ELEVATED: 8, // Elevated but manageable
  EXTREME: 10, // May affect operations
} as const;

// Confidence thresholds
export const CONFIDENCE_THRESHOLDS = {
  // Minimum data points for each confidence level
  LOW_MIN_DATA_POINTS: 0,
  MEDIUM_MIN_DATA_POINTS: 10,
  HIGH_MIN_DATA_POINTS: 50,

  // Historical match requirements
  LOW_HISTORICAL_MATCHES: 0,
  MEDIUM_HISTORICAL_MATCHES: 5,
  HIGH_HISTORICAL_MATCHES: 20,
} as const;

// Risk score interpretation
export const RISK_LEVELS = {
  LOW: { min: 0, max: 30, label: 'Low Risk', color: 'green' },
  MODERATE: { min: 31, max: 60, label: 'Moderate Risk', color: 'yellow' },
  HIGH: { min: 61, max: 100, label: 'High Risk', color: 'red' },
} as const;

// Model version for tracking
export const MODEL_VERSION = '1.0.0-deterministic';

// Direction sensitivity - how much an unfavorable wind direction
// amplifies the impact (bearing difference in degrees)
export const DIRECTION_SENSITIVITY = {
  HEADWIND_RANGE: 45, // +/- degrees from direct headwind
  CROSSWIND_RANGE: 90, // +/- degrees from beam
  HEADWIND_MULTIPLIER: 1.5,
  CROSSWIND_MULTIPLIER: 1.25,
  TAILWIND_MULTIPLIER: 0.75,
} as const;

// Vessel class defaults (used when specific vessel thresholds unavailable)
export const VESSEL_CLASS_DEFAULTS = {
  large_ferry: {
    wind_limit: 40,
    gust_limit: 55,
    directional_sensitivity: 0.8,
    advisory_sensitivity: 0.9,
  },
  traditional_ferry: {
    wind_limit: 35,
    gust_limit: 50,
    directional_sensitivity: 0.9,
    advisory_sensitivity: 1.0,
  },
  fast_ferry: {
    wind_limit: 30,
    gust_limit: 45,
    directional_sensitivity: 1.0,
    advisory_sensitivity: 1.0,
  },
  high_speed_catamaran: {
    wind_limit: 25,
    gust_limit: 40,
    directional_sensitivity: 1.2,
    advisory_sensitivity: 1.1,
  },
} as const;

// Operator behavior defaults (historical tendencies)
export const OPERATOR_DEFAULTS = {
  'steamship-authority': {
    cancellation_threshold: 35, // Tends to cancel at 35+ mph sustained
    conservative_factor: 1.0, // Baseline
    announcement_lead_time: 60, // Usually announces ~60 min before
  },
  'hy-line-cruises': {
    cancellation_threshold: 30, // Fast ferries more sensitive
    conservative_factor: 1.1, // Slightly more conservative
    announcement_lead_time: 45,
  },
} as const;
