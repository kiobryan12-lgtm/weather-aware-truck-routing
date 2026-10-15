import { Loader2 } from 'lucide-react';

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-label text-ink-secondary" role="status">
      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
      {label}
    </span>
  );
}

/** Same footprint as RouteCard to avoid layout shift. */
export function RouteCardSkeleton() {
  return (
    <div className="flex min-h-40 flex-col rounded-card border border-line bg-surface p-4 shadow-card" aria-hidden>
      <div className="flex items-center gap-2.5">
        <div className="size-7 animate-pulse rounded-control bg-surface-hover" />
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 w-36 animate-pulse rounded bg-surface-hover" />
          <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-hover" />
              <div className="h-4 w-12 animate-pulse rounded bg-surface-hover" />
            </div>
          ))}
        </div>
        <div className="size-14 animate-pulse rounded-full bg-surface-hover" />
      </div>
      <div className="mt-auto border-t border-line pt-3">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
      </div>
    </div>
  );
}
