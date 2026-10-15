import { AlertOctagon, FlaskConical, Info } from 'lucide-react';
import type { AnalyzeResponse } from '../../types/routing';
import { ErrorState } from '../common/ErrorState';
import { RouteCardSkeleton } from '../common/LoadingState';
import { RouteCard } from './RouteCard';

interface RouteComparisonProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: AnalyzeResponse | null;
  error: string | null;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  onRetry: () => void;
}

export function RouteComparison({ status, data, error, selectedRouteId, onSelectRoute, onRetry }: RouteComparisonProps) {
  const showResults = status === 'success' && data;
  const recommendedId = data?.recommendation.route_id ?? null;
  // Ranked routes first, then the ones that can't be recommended.
  const routes = showResults
    ? [...data.routes].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    : [];

  return (
    <section aria-labelledby="route-list-heading" aria-busy={status === 'loading'} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="route-list-heading" className="text-card text-ink">
          {showResults ? `${data.routes.length} route options` : 'Route options'}
        </h2>
        {showResults && <span className="text-meta text-ink-muted">ranked by safety, then time</span>}
      </div>

      {status === 'loading' && (
        <div className="flex flex-col gap-3">
          <RouteCardSkeleton />
          <RouteCardSkeleton />
        </div>
      )}

      {status === 'error' && <ErrorState title="Couldn’t analyze routes" message={error ?? 'Please try again.'} onRetry={onRetry} />}

      {status === 'idle' && (
        <p className="rounded-card border border-dashed border-line-strong bg-surface-muted p-4 text-center text-body text-ink-muted">
          Enter your trip and select Find Routes to compare route options.
        </p>
      )}

      {showResults && !recommendedId && (
        <div role="alert" className="flex items-start gap-2 rounded-control bg-risk-no-travel-bg px-3 py-2.5 text-label text-risk-no-travel-fg">
          <AlertOctagon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="block text-card">No safe route available</span>
            {data.recommendation.reason}
          </span>
        </div>
      )}

      {showResults && routes.length === 0 && (
        <ErrorState
          title="No routes found"
          message="The routing service couldn’t find a route between these places. Try nearby cities."
        />
      )}

      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          selected={route.id === selectedRouteId}
          recommended={route.id === recommendedId}
          reason={route.id === recommendedId ? data!.recommendation.reason : null}
          onSelect={onSelectRoute}
        />
      ))}

      {showResults &&
        data.warnings.map((warning) => (
          <p key={warning} className="flex items-start gap-2 text-label text-ink-secondary">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
            {warning}
          </p>
        ))}
      {showResults && data.data_source === 'sample' && (
        <p className="flex items-start gap-2 text-label text-ink-muted">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Sample data: simulated routes and weather, not a real forecast.
        </p>
      )}
    </section>
  );
}
