import { useId } from 'react';
import type { CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatWeekdayTime } from '../../lib/format';
import { cn } from '../../lib/cn';

const MAX_HOUR = 48;
const TICKS = [0, 12, 24, 36, 48];
const THUMB_PX = 16;

interface ForecastSliderProps {
  hour: number;
  onChange: (hour: number) => void;
  startTime: string;
  playing: boolean;
  onTogglePlay: () => void;
  truckStatus: string | null;
}

export function ForecastSlider({ hour, onChange, startTime, playing, onTogglePlay, truckStatus }: ForecastSliderProps) {
  const id = useId();
  const noteId = useId();
  const timeLabel = formatWeekdayTime(new Date(new Date(startTime).getTime() + hour * 3_600_000));

  return (
    <div className="flex w-full items-center gap-3 rounded-panel border border-line bg-surface px-3 py-2.5 shadow-float">
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors duration-150 ease-out hover:bg-ink-secondary"
      >
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-px" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 text-label" aria-live="polite">
          <span className="font-semibold whitespace-nowrap text-ink tabular-nums">
            Forecast +{hour}h · {timeLabel}
          </span>
          {truckStatus && <span className="truncate text-ink-muted">{truckStatus}</span>}
        </div>
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
          aria-valuetext={`+${hour} hours, ${timeLabel}`}
          aria-describedby={noteId}
          className="forecast-range mt-1 block w-full"
          style={{ '--fill': `${(hour / MAX_HOUR) * 100}%` } as CSSProperties}
        />
        <div className="relative h-4 text-meta text-ink-muted tabular-nums" aria-hidden>
          {TICKS.map((tick) => (
            <span
              key={tick}
              className={cn('absolute top-0 -translate-x-1/2')}
              style={{ left: `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${tick / MAX_HOUR})` }}
            >
              {tick}h
            </span>
          ))}
        </div>
        <p id={noteId} className="sr-only">
          Changes the weather layer and the truck position. Route risk always uses each checkpoint’s own arrival time.
        </p>
      </div>
    </div>
  );
}
