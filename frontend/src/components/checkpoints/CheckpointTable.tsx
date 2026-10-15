import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { RouteResult } from '../../types/routing';
import { formatMiles, formatTime } from '../../lib/format';
import { cn } from '../../lib/cn';
import { RiskBadge } from '../routes/RiskBadge';

interface CheckpointTableProps {
  route: RouteResult;
  selectedCheckpointId: string | null;
  onSelect: (checkpointId: string) => void;
}

const formatFixed = (value: number | null, digits: number) => (value === null ? '—' : value.toFixed(digits));

export function CheckpointTable({ route, selectedCheckpointId, onSelect }: CheckpointTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Only scroll the table itself, not the page.
  useEffect(() => {
    const container = scrollRef.current;
    const row = container?.querySelector<HTMLTableRowElement>('tr[aria-current="true"]');
    if (!container || !row) return;
    const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const rowTop = row.offsetTop - headerHeight;
    const rowBottom = row.offsetTop + row.offsetHeight;
    if (rowTop < container.scrollTop) container.scrollTop = rowTop;
    else if (rowBottom > container.scrollTop + container.clientHeight) container.scrollTop = rowBottom - container.clientHeight;
  }, [selectedCheckpointId, route.id]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(route.checkpoints[index].id);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = Math.min(route.checkpoints.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
      onSelect(route.checkpoints[nextIndex].id);
      scrollRef.current?.querySelectorAll<HTMLTableRowElement>('tbody tr')[nextIndex]?.focus();
    }
  };

  const headerCellClass = 'px-3 py-2 text-left font-semibold whitespace-nowrap';
  const cellClass = 'px-3 py-2 whitespace-nowrap';

  return (
      <div ref={scrollRef} className="relative h-full min-w-0 overflow-auto">
        <table className="w-full min-w-[560px] border-collapse text-body tabular-nums" aria-label={`Checkpoints on route ${route.label}`}>
          <thead className="sticky top-0 z-[1] bg-surface-muted text-label text-ink-secondary shadow-[0_1px_0_var(--color-line)]">
            <tr>
              <th scope="col" className={headerCellClass}>#</th>
              <th scope="col" className={headerCellClass}>Distance</th>
              <th scope="col" className={headerCellClass}>ETA</th>
              <th scope="col" className={headerCellClass}>Wind (mph)</th>
              <th scope="col" className={headerCellClass}>Rain (in/hr)</th>
              <th scope="col" className={headerCellClass}>Snow (in/hr)</th>
              <th scope="col" className={headerCellClass}>Risk Level</th>
            </tr>
          </thead>
          <tbody>
            {route.checkpoints.map((checkpoint, index) => {
              const selected = checkpoint.id === selectedCheckpointId;
              return (
                <tr
                  key={checkpoint.id}
                  tabIndex={0}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(checkpoint.id)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  className={cn(
                    'cursor-pointer border-b border-line transition-colors duration-150 ease-out last:border-b-0 focus-visible:outline-offset-[-2px]',
                    selected ? 'bg-primary-light' : 'hover:bg-surface-hover',
                  )}
                >
                  <td className={cn(cellClass, 'text-ink-muted', selected && 'font-semibold text-primary')}>{checkpoint.index + 1}</td>
                  <td className={cellClass}>{formatMiles(checkpoint.distance_mi)}</td>
                  <td className={cellClass}>{formatTime(checkpoint.eta)}</td>
                  <td className={cellClass}>{checkpoint.weather.wind_mph ?? '—'}</td>
                  <td className={cellClass}>{formatFixed(checkpoint.weather.rain_in_hr, 2)}</td>
                  <td className={cellClass}>{formatFixed(checkpoint.weather.snow_in_hr, 2)}</td>
                  <td className={cellClass}>
                    <RiskBadge level={checkpoint.risk} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
  );
}
