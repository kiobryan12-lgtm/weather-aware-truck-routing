import { legendGradient, WEATHER_LAYERS } from './weatherLayers';
import type { WeatherLayer } from './weatherLayers';

interface MapLegendProps {
  layer: WeatherLayer;
  /** Whether the layer shows anything at the selected hour. */
  hasWeatherNow: boolean;
  /** Hour with the strongest weather in the window, or null when nothing shows at any hour. */
  strongestHour: number | null;
  onShowHour: (hour: number) => void;
}

export function MapLegend({ layer, hasWeatherNow, strongestHour, onShowHour }: MapLegendProps) {
  const config = WEATHER_LAYERS[layer];
  return (
    <div>
      <p className="text-label font-semibold text-ink">{config.title}</p>
      <div className="mt-1.5 h-2.5 rounded-full" style={{ background: legendGradient(config) }} aria-hidden />
      <div className="mt-1 flex justify-between text-label text-ink-muted">
        <span>{config.lowLabel}</span>
        <span>{config.highLabel}</span>
      </div>
      {!hasWeatherNow && (
        <p className="mt-1.5 border-t border-line pt-1.5 text-label text-ink-secondary" role="status">
          {strongestHour === null ? (
            'No significant weather in the next 48 hours.'
          ) : (
            <>
              No significant weather at this hour.{' '}
              <button
                type="button"
                onClick={() => onShowHour(strongestHour)}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Show +{strongestHour}h
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
