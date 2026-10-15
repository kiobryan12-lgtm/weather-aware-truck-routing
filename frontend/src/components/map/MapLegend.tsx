import { WEATHER_LAYERS } from './weatherLayers';
import type { WeatherLayer } from './weatherLayers';

interface MapLegendProps {
  layer: WeatherLayer;
  hasWeatherNow: boolean;
  strongestHour: number | null;
  onShowHour: (hour: number) => void;
}

export function MapLegend({ layer, hasWeatherNow, strongestHour, onShowHour }: MapLegendProps) {
  const config = WEATHER_LAYERS[layer];
  return (
    <div>
      <p className="text-label font-semibold text-ink">{config.title}</p>
      <p className="text-meta text-ink-muted">{config.description}</p>
      <ul className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(56px,1fr))] gap-x-1.5 gap-y-2">
        {config.bands.map((band) => (
          <li key={band.label} className="min-w-0">
            <span className="block h-2 rounded-full" style={{ backgroundColor: band.color }} aria-hidden />
            <span className="mt-1 block text-meta font-semibold text-ink">{band.label}</span>
            {band.range && <span className="block text-meta whitespace-nowrap text-ink-muted tabular-nums">{band.range}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-meta text-ink-muted">Point at the map to read the weather.</p>
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
