// Shapes of the Django API requests and responses.

export type LngLat = [lng: number, lat: number];

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel' | 'unknown';

export type CheckpointIntervalMiles = 10 | 25 | 50;

export type WeatherVariable = 'precipitation' | 'wind' | 'snow' | 'clouds';

// POST /api/routes/analyze
export interface TripRequest {
  origin: string;
  destination: string;
  // ISO 8601, UTC
  departure_time: string;
  load_weight_lb: number;
  checkpoint_interval_miles: CheckpointIntervalMiles;
}

export interface Place {
  name: string;
  location: LngLat;
}

// null when there's no forecast for the ETA
export interface CheckpointWeather {
  wind_mph: number | null;
  rain_in_hr: number | null;
  snow_in_hr: number | null;
}

export interface Checkpoint {
  id: string;
  index: number;
  distance_mi: number;
  eta: string;
  location: LngLat;
  place_name: string | null;
  weather: CheckpointWeather;
  // before load rules
  condition_risk: Record<'wind' | 'rain' | 'snow', RiskLevel>;
  load_adjusted: boolean;
  risk: RiskLevel;
  reasons: string[];
}

export interface RiskSegment {
  checkpoint_id: string;
  from_mi: number;
  to_mi: number;
  risk: RiskLevel;
  coordinates: LngLat[];
}

export interface RiskSummary {
  miles_by_level: Record<RiskLevel, number>;
  // weighted by distance, 0 = Low to 4 = No Travel
  average_risk: number | null;
}

export interface RouteResult {
  id: string;
  label: string;
  name: string;
  via: string;
  distance_mi: number;
  duration_min: number;
  geometry: LngLat[];
  checkpoints: Checkpoint[];
  segments: RiskSegment[];
  risk_summary: RiskSummary;
  eligible: boolean;
  rank: number | null;
  ineligible_reason: string | null;
  warnings: string[];
}

export interface Recommendation {
  route_id: string | null;
  reason: string;
}

// values[variable][hour][pointIndex]
export interface WeatherGrid {
  start_time: string;
  hour_count: number;
  spacing_deg: number;
  points: LngLat[];
  values: Record<WeatherVariable, (number | null)[][]>;
}

// Response of POST /api/routes/analyze
export interface AnalyzeResponse {
  origin: Place;
  destination: Place;
  departure_time: string;
  load_weight_lb: number;
  checkpoint_interval_miles: CheckpointIntervalMiles;
  routes: RouteResult[];
  recommendation: Recommendation;
  weather_grid: WeatherGrid | null;
  warnings: string[];
  data_source: 'live' | 'sample';
}

export interface LocationSuggestion {
  id: string;
  name: string;
  detail: string;
  location: LngLat;
}

// Response of POST /api/routes/plan: the forecasts the browser should fetch
export interface ForecastPlan {
  points: LngLat[];
  start_time: string | null;
  end_time: string | null;
}

// Hourly series per point, sent back with POST /api/routes/analyze
export interface SuppliedForecasts {
  start_time: string;
  points: LngLat[];
  wind_mph: (number | null)[][];
  rain_in: (number | null)[][];
  snow_in: (number | null)[][];
  cloud_pct: (number | null)[][];
}
