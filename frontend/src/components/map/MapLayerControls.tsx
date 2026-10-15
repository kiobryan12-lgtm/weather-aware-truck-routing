import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import { cn } from '../../lib/cn';
import { WEATHER_LAYER_OPTIONS } from './weatherLayers';
import type { WeatherLayer } from './weatherLayers';

interface MapLayerControlsProps {
  value: WeatherLayer;
  onChange: (value: WeatherLayer) => void;
  /** Legend shown inside the panel on small screens. */
  mobileLegend?: ReactNode;
}

export function MapLayerControls({ value, onChange, mobileLegend }: MapLayerControlsProps) {
  const groupLabelId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col items-end md:top-4 md:right-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="inline-flex h-11 items-center gap-1.5 rounded-panel border border-line bg-surface px-3 text-label font-semibold text-ink shadow-float transition-colors duration-150 ease-out hover:bg-surface-hover md:hidden"
      >
        <Layers className="size-4 text-primary" aria-hidden />
        Layers
        <ChevronDown className={cn('size-4 text-ink-muted transition-transform duration-150', open && 'rotate-180')} aria-hidden />
      </button>

      <div
        id={panelId}
        className={cn(
          'mt-2 w-[185px] rounded-panel border border-line bg-surface p-2 shadow-float md:mt-0 md:block',
          !open && 'hidden',
        )}
      >
        <p id={groupLabelId} className="sr-only">
          Weather layer
        </p>
        <div role="radiogroup" aria-labelledby={groupLabelId} className="flex flex-col">
          {WEATHER_LAYER_OPTIONS.map((option) => {
            const checked = option.value === value;
            return (
              <label
                key={option.value}
                className={cn(
                  'flex h-11 cursor-pointer items-center gap-2 rounded-badge px-2 text-label transition-colors duration-150 ease-out md:h-8',
                  'hover:bg-surface-hover has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-primary/40',
                  checked ? 'text-ink' : 'text-ink-secondary',
                )}
              >
                <input
                  type="radio"
                  name="weather-layer"
                  value={option.value}
                  checked={checked}
                  onChange={() => onChange(option.value)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150',
                    checked ? 'border-primary' : 'border-line-strong bg-surface',
                  )}
                >
                  <span className={cn('size-2 rounded-full bg-primary transition-transform duration-150', checked ? 'scale-100' : 'scale-0')} />
                </span>
                {option.label}
              </label>
            );
          })}
        </div>
        {mobileLegend && <div className="mt-2 border-t border-line px-1 pt-2 md:hidden">{mobileLegend}</div>}
      </div>
    </div>
  );
}
