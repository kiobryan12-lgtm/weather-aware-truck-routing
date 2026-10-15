import type { ExpressionSpecification } from 'maplibre-gl';
import type { WeatherVariable } from '../../types/routing';

/** "combined" shows the strongest of rain, wind, and snow. */
export type WeatherLayer = 'combined' | WeatherVariable;

type ThresholdStops = [number, number, number, number, number];

interface WeatherLayerConfig {
  title: string;
  /** Hour `h` is stored as the property `${prefix}${h}`. */
  prefix: string;
  /** Values at heatmap weights 0, 0.25, 0.5, 0.75, and 1. */
  stops: ThresholdStops;
  /** [heatmap density, color] pairs. */
  ramp: [number, string][];
  lowLabel: string;
  highLabel: string;
}

const RADAR_RAMP: [number, string][] = [
  [0.04, 'rgba(147,197,253,0)'],
  [0.1, '#93C5FD'],
  [0.25, '#3B82F6'],
  [0.45, '#22C55E'],
  [0.65, '#FACC15'],
  [0.82, '#F97316'],
  [1, '#DC2626'],
];

/** Weight 0.25 is the Moderate threshold, so Low conditions stay clear. */
const COMBINED_RAMP: [number, string][] = [
  [0.2, 'rgba(96,165,250,0)'],
  [0.27, '#60A5FA'],
  [0.45, '#22C55E'],
  [0.6, '#FACC15'],
  [0.78, '#F97316'],
  [1, '#DC2626'],
];

export const WEATHER_LAYERS: Record<WeatherLayer, WeatherLayerConfig> = {
  combined: {
    title: 'Weather (Combined Intensity)',
    prefix: 'x',
    stops: [0, 0.25, 0.5, 0.75, 1],
    ramp: COMBINED_RAMP,
    lowLabel: 'Moderate',
    highLabel: 'Severe',
  },
  precipitation: {
    title: 'Weather (Precipitation Intensity)',
    prefix: 'p',
    stops: [0, 0.1, 0.25, 0.5, 1],
    ramp: RADAR_RAMP,
    lowLabel: 'Light',
    highLabel: 'Heavy',
  },
  wind: {
    title: 'Wind Speed (mph)',
    prefix: 'w',
    stops: [10, 25, 35, 45, 55],
    ramp: [
      [0.04, 'rgba(251,207,232,0)'],
      [0.15, '#FBCFE8'],
      [0.35, '#F472B6'],
      [0.6, '#DB2777'],
      [0.8, '#9D174D'],
      [1, '#581C87'],
    ],
    lowLabel: 'Calm',
    highLabel: 'Strong',
  },
  snow: {
    title: 'Snowfall (in/hr)',
    prefix: 's',
    stops: [0, 0.5, 1, 2, 3],
    ramp: [
      [0.04, 'rgba(199,210,254,0)'],
      [0.12, '#E0E7FF'],
      [0.3, '#A5B4FC'],
      [0.55, '#6366F1'],
      [0.8, '#4338CA'],
      [1, '#312E81'],
    ],
    lowLabel: 'Light',
    highLabel: 'Heavy',
  },
  clouds: {
    title: 'Cloud Cover (%)',
    prefix: 'k',
    stops: [0, 25, 50, 75, 100],
    ramp: [
      [0.15, 'rgba(203,213,225,0)'],
      [0.35, 'rgba(148,163,184,0.35)'],
      [0.6, 'rgba(100,116,139,0.55)'],
      [0.85, 'rgba(71,85,105,0.7)'],
      [1, 'rgba(51,65,85,0.8)'],
    ],
    lowLabel: 'Clear',
    highLabel: 'Overcast',
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

/** JS equivalent of `heatWeightExpression`. */
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

export function heatWeightExpression(config: WeatherLayerConfig, hour: number): ExpressionSpecification {
  const [minimum, low, middle, high, maximum] = config.stops;
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', `${config.prefix}${hour}`], minimum],
    minimum, 0,
    low, 0.25,
    middle, 0.5,
    high, 0.75,
    maximum, 1,
  ];
}

export function heatColorExpression(config: WeatherLayerConfig): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(255,255,255,0)',
    ...config.ramp.flat(),
  ] as ExpressionSpecification;
}

/** CSS gradient matching the ramp, without its transparent first stop. */
export function legendGradient(config: WeatherLayerConfig): string {
  const visibleStops = config.ramp.slice(1);
  const firstDensity = visibleStops[0][0];
  const cssStops = visibleStops.map(
    ([density, color]) => `${color} ${(((density - firstDensity) / (1 - firstDensity)) * 100).toFixed(0)}%`,
  );
  return `linear-gradient(to right, ${cssStops.join(', ')})`;
}
