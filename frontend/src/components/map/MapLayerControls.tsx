import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { RiskLevel } from '../../types/routing';
import { RISK_LABELS } from '../../lib/risk';
import { RISK_COLORS } from '../../styles/tokens';
import { WEATHER_LAYER_OPTIONS } from './weatherLayers';
import type { WeatherLayer } from './weatherLayers';

const ROUTE_RISK_LEVELS: RiskLevel[] = ['low', 'moderate', 'high', 'severe', 'no_travel'];

interface MapLayerControlsProps {
  value: WeatherLayer;
  onChange: (value: WeatherLayer) => void;
  // Shown in the panel when the floating legend is hidden (below 2xl).
  compactLegend?: ReactNode;
}

export function MapLayerControls({ value, onChange, compactLegend }: MapLayerControlsProps) {
  const groupLabelId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-col items-end md:top-4 md:right-4">
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
          'mt-2 max-h-[324px] w-[185px] overflow-y-auto rounded-panel border border-line bg-surface p-2 shadow-float md:mt-0 md:block md:max-h-[360px] 2xl:max-h-none 2xl:overflow-visible',
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
        <div className="mt-2 border-t border-line px-1 pt-2">
          <p className="text-meta font-semibold text-ink">Route risk</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
            {ROUTE_RISK_LEVELS.map((level) => (
              <li key={level} className="flex items-center gap-1.5 text-meta text-ink-secondary">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: RISK_COLORS[level] }} aria-hidden />
                {RISK_LABELS[level]}
              </li>
            ))}
            <li className="flex items-center gap-1.5 text-meta text-ink-secondary">
              <span className="h-1 w-2.5 shrink-0 rounded-full bg-[#94A3B8]" aria-hidden />
              Other routes
            </li>
          </ul>
        </div>
        {compactLegend && <div className="mt-2 border-t border-line px-1 pt-2 2xl:hidden">{compactLegend}</div>}
      </div>
    </div>
  );
}
