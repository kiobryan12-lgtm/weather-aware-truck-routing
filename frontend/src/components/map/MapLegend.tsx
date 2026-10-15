import { legendGradient, WEATHER_LAYERS } from './weatherLayers';
import type { WeatherLayer } from './weatherLayers';

interface MapLegendProps {
  layer: WeatherLayer;
}

export function MapLegend({ layer }: MapLegendProps) {
  const config = WEATHER_LAYERS[layer];
  return (
    <div>
      <p className="text-label font-semibold text-ink">{config.title}</p>
      <div className="mt-1.5 h-2.5 rounded-full" style={{ background: legendGradient(config) }} aria-hidden />
      <div className="mt-1 flex justify-between text-label text-ink-muted">
        <span>{config.lowLabel}</span>
        <span>{config.highLabel}</span>
      </div>
    </div>
  );
}
