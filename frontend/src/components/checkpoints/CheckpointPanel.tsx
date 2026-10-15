import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Checkpoint, RouteResult } from '../../types/routing';
import { cn } from '../../lib/cn';
import { CheckpointDetails } from './CheckpointDetails';
import { CheckpointTable } from './CheckpointTable';

interface CheckpointPanelProps {
  route: RouteResult;
  intervalMiles: number;
  departureTime: string;
  selectedCheckpoint: Checkpoint | null;
  onSelectCheckpoint: (checkpointId: string) => void;
}

export function CheckpointPanel({ route, intervalMiles, departureTime, selectedCheckpoint, onSelectCheckpoint }: CheckpointPanelProps) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  return (
    <section aria-labelledby={`${bodyId}-title`} className="flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex h-11 shrink-0 items-center justify-between gap-3 px-4 text-left transition-colors duration-150 ease-out hover:bg-surface-hover"
      >
        <span className="min-w-0 truncate">
          <span id={`${bodyId}-title`} className="text-card text-ink">
            Checkpoints · Route {route.label} ({route.name})
          </span>
          <span className="ml-2 text-label text-ink-muted">
            {route.checkpoints.length} checkpoints, every {intervalMiles} mi
          </span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-muted transition-transform duration-150', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div
          id={bodyId}
          className="grid border-t border-line lg:h-[240px] lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] max-lg:[&>*:first-child]:max-h-[320px]"
        >
          <CheckpointTable route={route} selectedCheckpointId={selectedCheckpoint?.id ?? null} onSelect={onSelectCheckpoint} />
          <div className="min-h-0 overflow-y-auto border-line max-lg:border-t lg:border-l">
            <CheckpointDetails checkpoint={selectedCheckpoint} departureTime={departureTime} />
          </div>
        </div>
      )}
    </section>
  );
}
