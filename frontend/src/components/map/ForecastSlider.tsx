import { useId } from 'react';
import type { CSSProperties } from 'react';
import { formatWeekdayTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const MAX_HOUR = 48;
const TICKS = [0, 6, 12, 18, 24, 36, 48];
const THUMB_PX = 16;

const formatForecastTime = (startTime: string, hour: number) => formatWeekdayTime(new Date(new Date(startTime).getTime() + hour * 3_600_000));

interface ForecastSliderProps {
  hour: number;
  onChange: (hour: number) => void;
  startTime: string;
}

export function ForecastSlider({ hour, onChange, startTime }: ForecastSliderProps) {
  const id = useId();
  const noteId = useId();

  return (
    <div className="w-full rounded-panel border border-line bg-surface px-4 pt-3 pb-2 shadow-float">
      <label htmlFor={id} className="sr-only">
        Forecast hour after departure
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={MAX_HOUR}
        step={1}
        value={hour}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={`+${hour} hours, ${formatForecastTime(startTime, hour)}`}
        aria-describedby={noteId}
        className="forecast-range block w-full"
        style={{ '--fill': `${(hour / MAX_HOUR) * 100}%` } as CSSProperties}
      />
      <div className="relative mt-1 h-4 text-meta text-ink-muted tabular-nums" aria-hidden>
        {TICKS.map((tick) => (
          <span
            key={tick}
            className={cn('absolute top-0 -translate-x-1/2', (tick === 6 || tick === 18) && 'hidden sm:inline')}
            style={{ left: `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${tick / MAX_HOUR})` }}
          >
            {tick}h
          </span>
        ))}
      </div>
      <p id={noteId} className="sr-only">
        Changes the weather heatmap only. Route risk always uses each checkpoint’s own arrival time.
      </p>
    </div>
  );
}

export function ForecastBadge({ hour, startTime }: { hour: number; startTime: string }) {
  return (
    <div className="rounded-panel border border-line bg-surface px-3 py-2 shadow-float" aria-live="polite">
      <p className="text-label whitespace-nowrap text-ink">
        Forecast: <span className="font-semibold tabular-nums">+{hour} hours</span>
      </p>
      <p className="text-meta whitespace-nowrap text-ink-muted tabular-nums">{formatForecastTime(startTime, hour)}</p>
    </div>
  );
}
