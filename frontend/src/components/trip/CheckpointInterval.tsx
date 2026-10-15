import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { CheckpointIntervalMiles } from '../../types/routing';
import { cn } from '../../lib/cn';

const INTERVAL_OPTIONS: CheckpointIntervalMiles[] = [10, 25, 50];

interface CheckpointIntervalProps {
  labelId: string;
  value: CheckpointIntervalMiles;
  onChange: (value: CheckpointIntervalMiles) => void;
}

export function CheckpointInterval({ labelId, value, onChange }: CheckpointIntervalProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const nextIndex = (index + step + INTERVAL_OPTIONS.length) % INTERVAL_OPTIONS.length;
    onChange(INTERVAL_OPTIONS[nextIndex]);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-3 gap-2">
      {INTERVAL_OPTIONS.map((option, index) => {
        const selected = option === value;
        return (
          <button
            key={option}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'h-11 rounded-control border text-button whitespace-nowrap tabular-nums transition-colors duration-150 ease-out md:h-10',
              selected
                ? 'border-primary bg-primary text-white'
                : 'border-line-strong bg-surface text-ink hover:border-ink-disabled hover:bg-surface-hover',
            )}
          >
            {option} miles
          </button>
        );
      })}
    </div>
  );
}
