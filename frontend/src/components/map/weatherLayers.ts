import type { ExpressionSpecification } from 'maplibre-gl';
import type { WeatherVariable } from '../../types/routing';
import { RISK_COLORS } from '../../styles/tokens';

/** "combined" shows the strongest of rain, snow, and (Moderate or stronger) wind. */
export type WeatherLayer = 'combined' | WeatherVariable;

type ThresholdStops = [number, number, number, number, number];

export interface LegendBand {
  label: string;
  range: string;
  color: string;
}

interface WeatherLayerConfig {
  title: string;
  description: string;
  /** Hour `h` is stored as the property `${prefix}${h}`. */
  prefix: string;
  /** Values at weights 0, 0.25, 0.5, 0.75, and 1 (the risk thresholds). */
  stops: ThresholdStops;
  /** [weight, color] pairs; the first stop is transparent. */
  ramp: [number, string][];
  bands: LegendBand[];
}

const LIGHT_COLOR = '#93C5FD';

/**
 * Weights 0.25 / 0.5 / 0.75 / 1 are the Moderate / High / Severe / No Travel thresholds,
 * so map colours mean the same as the risk badges.
 */
const RISK_RAMP: [number, string][] = [
  [0.02, 'rgba(147,197,253,0)'],
  [0.07, LIGHT_COLOR],
  [0.24, LIGHT_COLOR],
  [0.25, RISK_COLORS.moderate],
  [0.49, RISK_COLORS.moderate],
  [0.5, RISK_COLORS.high],
  [0.74, RISK_COLORS.high],
  [0.75, RISK_COLORS.severe],
  [0.99, RISK_COLORS.severe],
  [1, RISK_COLORS.no_travel],
];

function riskBands(ranges: [string, string, string, string]): LegendBand[] {
  return [
    { label: 'Light', range: ranges[0], color: LIGHT_COLOR },
    { label: 'Moderate', range: ranges[1], color: RISK_COLORS.moderate },
    { label: 'High', range: ranges[2], color: RISK_COLORS.high },
    { label: 'Severe', range: ranges[3], color: RISK_COLORS.severe },
  ];
}

export const WEATHER_LAYERS: Record<WeatherLayer, WeatherLayerConfig> = {
  combined: {
    title: 'Weather risk',
    description: 'Strongest of rain, snow, and wind. Colours match the route risk levels.',
    prefix: 'x',
    stops: [0, 0.25, 0.5, 0.75, 1],
    ramp: RISK_RAMP,
    bands: riskBands(['', '', '', '']),
  },
  precipitation: {
    title: 'Rain (in/hr)',
    description: 'Rainfall rate at the selected time.',
    prefix: 'p',
    stops: [0, 0.1, 0.25, 0.5, 1],
    ramp: RISK_RAMP,
    bands: riskBands(['< 0.10', '0.10–0.25', '0.25–0.50', '0.50+']),
  },
  wind: {
    title: 'Wind (mph)',
    description: 'Sustained wind speed at the selected time.',
    prefix: 'w',
    stops: [10, 25, 35, 45, 55],
    ramp: RISK_RAMP,
    bands: riskBands(['15–24', '25–34', '35–44', '45+']),
  },
  snow: {
    title: 'Snow (in/hr)',
    description: 'Snowfall rate at the selected time.',
    prefix: 's',
    stops: [0, 0.5, 1, 2, 3],
    ramp: RISK_RAMP,
    bands: riskBands(['< 0.5', '0.5–1.0', '1.0–2.0', '2.0+']),
  },
  clouds: {
    title: 'Cloud cover',
    description: 'Share of the sky covered by cloud. Not part of the risk rules.',
    prefix: 'k',
    stops: [0, 25, 50, 75, 100],
    ramp: [
      [0.24, 'rgba(203,213,225,0)'],
      [0.3, 'rgba(148,163,184,0.35)'],
      [0.55, 'rgba(100,116,139,0.55)'],
      [0.8, 'rgba(71,85,105,0.7)'],
      [1, 'rgba(51,65,85,0.8)'],
    ],
    bands: [
      { label: 'Partly', range: '25–50%', color: '#CBD5E1' },
      { label: 'Mostly', range: '50–75%', color: '#94A3B8' },
      { label: 'Overcast', range: '75%+', color: '#475569' },
    ],
  },
};

export const WEATHER_LAYER_OPTIONS: { value: WeatherLayer; label: string }[] = [
  { value: 'combined', label: 'Weather Heatmap' },
  { value: 'wind', label: 'Wind' },
  { value: 'precipitation', label: 'Precipitation' },
  { value: 'snow', label: 'Snow' },
  { value: 'clouds', label: 'Clouds' },
];

const STOP_WEIGHTS = [0, 0.25, 0.5, 0.75, 1];

/** JS equivalent of the weight part of `heatColorExpression`. */
export function valueToWeight(stops: ThresholdStops, value: number | null): number {
  if (value === null || value <= stops[0]) return 0;
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i]) {
      const t = (value - stops[i - 1]) / (stops[i] - stops[i - 1]);
      return STOP_WEIGHTS[i - 1] + t * (STOP_WEIGHTS[i] - STOP_WEIGHTS[i - 1]);
    }
  }
  return 1;
}

/** Weight at which a layer's colour starts to show. */
export function visibleFromWeight(config: WeatherLayerConfig): number {
  return (config.ramp[0][0] + config.ramp[1][0]) / 2;
}

/** Colour for each grid cell at `hour`, from its value mapped onto the layer's ramp. */
export function heatColorExpression(config: WeatherLayerConfig, hour: number): ExpressionSpecification {
  const [minimum, low, middle, high, maximum] = config.stops;
  const weight: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', `${config.prefix}${hour}`], minimum],
    minimum, 0,
    low, 0.25,
    middle, 0.5,
    high, 0.75,
    maximum, 1,
  ];
  return ['interpolate', ['linear'], weight, 0, 'rgba(255,255,255,0)', ...config.ramp.flat()] as ExpressionSpecification;
}
