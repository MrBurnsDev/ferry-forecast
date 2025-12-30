// Ferry Forecast Type Definitions

// ============ Enums & Constants ============

export type ConfidenceRating = 'low' | 'medium' | 'high';

export type AdvisoryLevel =
  | 'none'
  | 'small_craft_advisory'
  | 'gale_warning'
  | 'storm_warning'
  | 'hurricane_warning';

export type OfficialStatus =
  | 'on_time'
  | 'delayed'
  | 'canceled'
  | 'unknown';

export type CrossingType =
  | 'open_water'
  | 'protected'
  | 'mixed';

export type VesselClass =
  | 'large_ferry'
  | 'fast_ferry'
  | 'traditional_ferry'
  | 'high_speed_catamaran';

// ============ Database Models ============

export interface FerryRoute {
  route_id: string;
  region: string;
  origin_port: string;
  destination_port: string;
  operator: string;
  crossing_type: CrossingType;
  bearing_degrees: number;
  display_name?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Vessel {
  vessel_id: string;
  name: string;
  operator: string;
  vessel_class: VesselClass;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface VesselThreshold {
  id: string;
  vessel_id: string;
  wind_limit: number;
  gust_limit: number;
  directional_sensitivity: number; // 0-1 multiplier for unfavorable wind direction
  advisory_sensitivity: number; // 0-1 multiplier for advisory impact
  created_at?: string;
  updated_at?: string;
}

export interface RiskProfile {
  id: string;
  timestamp: string;
  route_id: string;
  vessel_id: string | null;
  wind_speed: number;
  gusts: number;
  wind_direction: number;
  advisory_level: AdvisoryLevel;
  tide_factor: number;
  predicted_score: number;
  confidence_rating: ConfidenceRating;
  model_version: string;
  official_status: OfficialStatus | null;
  official_status_source: string | null;
  created_at?: string;
}

export interface DisruptionHistory {
  id: string;
  date: string;
  route_id: string;
  vessel_id: string | null;
  scheduled_sailings: number;
  delayed_sailings: number;
  canceled_sailings: number;
  reason_text: string | null;
  source_url: string | null;
  weather_conditions?: WeatherSnapshot;
  created_at?: string;
}

// ============ Weather & Conditions ============

export interface WeatherSnapshot {
  wind_speed: number; // mph
  wind_gusts: number; // mph
  wind_direction: number; // degrees
  advisory_level: AdvisoryLevel;
  wave_height?: number; // feet
  visibility?: number; // nautical miles
  timestamp: string;
}

export interface TideData {
  timestamp: string;
  height: number; // feet
  type: 'high' | 'low' | 'intermediate';
}

export interface TideSwing {
  swing_feet: number;
  hours_to_next: number;
  current_phase: 'rising' | 'falling' | 'slack';
}

// ============ Scoring & Prediction ============

export interface ContributingFactor {
  factor: string;
  description: string;
  weight: number;
  value: string | number;
}

export interface ScoringResult {
  score: number; // 0-100
  confidence: ConfidenceRating;
  factors: ContributingFactor[];
  model_version: string;
  calculated_at: string;
}

export interface HourlyForecast {
  hour: string; // ISO timestamp
  score: number;
  confidence: ConfidenceRating;
  weather: WeatherSnapshot;
  tide?: TideData;
  factors: ContributingFactor[];
}

// ============ API Response Types ============

export interface ForecastResponse {
  route: FerryRoute;
  vessel?: Vessel;
  current_conditions: {
    weather: WeatherSnapshot;
    tide?: TideSwing;
  };
  current_risk: ScoringResult;
  hourly_forecast: HourlyForecast[];
  official_status: {
    status: OfficialStatus;
    source: string | null;
    updated_at: string | null;
    message?: string;
  };
  metadata: {
    generated_at: string;
    cache_expires_at: string;
    data_sources: string[];
    warnings?: string[];
  };
}

// ============ UI Selection Types ============

export interface Region {
  id: string;
  name: string;
  display_name: string;
}

export interface Port {
  id: string;
  name: string;
  display_name: string;
  region_id: string;
}

export interface RouteOption {
  route_id: string;
  origin: string;
  destination: string;
  operator: string;
  display_name: string;
}

export interface SelectionState {
  region: string | null;
  origin: string | null;
  destination: string | null;
  operator: string | null;
  vessel_id: string | null;
}

// ============ Operator Status Types ============

export interface OperatorStatusUpdate {
  route_id: string;
  status: OfficialStatus;
  message?: string;
  effective_time?: string;
  source: string;
  fetched_at: string;
}

// ============ Configuration Types ============

export interface ScoringWeights {
  sustained_wind_30: number;
  unfavorable_wind_20: number;
  small_craft_advisory: number;
  gale_warning: number;
  storm_warning: number;
  hurricane_warning: number;
  extreme_tide_swing: number;
  historical_match: number;
}

export interface RouteConfig {
  routes: FerryRoute[];
  regions: Region[];
  ports: Port[];
}
