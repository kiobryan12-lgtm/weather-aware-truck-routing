import { AlertOctagon, FlaskConical, ShieldCheck, Info } from 'lucide-react';
import type { AnalyzeResponse } from '../../types/routing';
import { routeColor } from '../../styles/tokens';
import { ErrorState } from '../common/ErrorState';
import { RouteCardSkeleton } from '../common/LoadingState';
import { RouteCard } from './RouteCard';

interface RouteComparisonProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: AnalyzeResponse | null;
  error: string | null;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  onViewDetails: (routeId: string) => void;
  onRetry: () => void;
}

export function RouteComparison({ status, data, error, selectedRouteId, onSelectRoute, onViewDetails, onRetry }: RouteComparisonProps) {
  const showResults = status === 'success' && data;
  const recommendedId = data?.recommendation.route_id ?? null;

  return (
    <section aria-labelledby="route-comparison-heading" aria-busy={status === 'loading'} className="flex flex-col gap-3">
      <h2 id="route-comparison-heading" className="sr-only">
        Route options
      </h2>

      {status === 'loading' && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          <RouteCardSkeleton />
          <RouteCardSkeleton />
          <RouteCardSkeleton />
        </div>
      )}

      {status === 'error' && <ErrorState title="Couldn’t analyze routes" message={error ?? 'Please try again.'} onRetry={onRetry} />}

      {status === 'idle' && (
        <div className="flex min-h-40 items-center justify-center rounded-card border border-dashed border-line-strong bg-surface-muted p-4 text-center text-body text-ink-muted">
          Enter your trip details and select Find Routes to compare route options.
        </div>
      )}

      {showResults && data.routes.length === 0 && (
        <ErrorState
          title="No routes found"
          message="The routing service couldn’t find alternatives between these places. Try nearby cities or adjust your trip."
        />
      )}

      {showResults && data.routes.length > 0 && (
        <div className="grid items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {data.routes.map((route, index) => (
            <RouteCard
              key={route.id}
              route={route}
              color={routeColor(index)}
              selected={route.id === selectedRouteId}
              recommended={route.id === recommendedId}
              onSelect={onSelectRoute}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      )}

      {showResults && (
        <div className="flex flex-col gap-2">
          {recommendedId ? (
            <p className="flex items-start gap-2 text-label text-risk-low-fg">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">Why recommended: </span>
                {data.recommendation.reason}
              </span>
            </p>
          ) : (
            <div role="alert" className="flex items-start gap-2 rounded-control bg-risk-no-travel-bg px-3 py-2.5 text-label text-risk-no-travel-fg">
              <AlertOctagon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="block text-card">No safe route available</span>
                {data.recommendation.reason}
              </span>
            </div>
          )}
          {data.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2 text-label text-ink-secondary">
              <Info className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
              {warning}
            </p>
          ))}
          {data.data_source === 'sample' && (
            <p className="flex items-start gap-2 text-label text-ink-muted">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Sample data: routes and weather are simulated for interface development and are not a real forecast.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
