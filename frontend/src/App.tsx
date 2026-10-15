import { useMemo, useState } from 'react';
import type { AnalyzeResponse, Checkpoint, RouteResult } from './types/routing';
import { RISK_SEVERITY } from './lib/risk';
import { useRouteAnalysis } from './hooks/useRouteAnalysis';
import { isSampleMode } from './services/routingApi';
import { AppHeader } from './components/layout/AppHeader';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { TripForm } from './components/trip/TripForm';
import { RouteMap } from './components/map/RouteMap';
import { MapLayerControls } from './components/map/MapLayerControls';
import { MapLegend } from './components/map/MapLegend';
import { ForecastBadge, ForecastSlider } from './components/map/ForecastSlider';
import type { WeatherLayer } from './components/map/weatherLayers';
import { RouteComparison } from './components/routes/RouteComparison';
import { CheckpointTable } from './components/checkpoints/CheckpointTable';
import { CheckpointDetails } from './components/checkpoints/CheckpointDetails';

/** The route's riskiest checkpoint (the first one if tied). */
function riskiestCheckpoint(route: RouteResult | undefined): Checkpoint | null {
  if (!route || route.checkpoints.length === 0) return null;
  return route.checkpoints.reduce((riskiest, checkpoint) =>
    RISK_SEVERITY[checkpoint.risk] > RISK_SEVERITY[riskiest.risk] ? checkpoint : riskiest,
  );
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function App() {
  const { status, data, error, analyze, retry } = useRouteAnalysis();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [weatherLayer, setWeatherLayer] = useState<WeatherLayer>('combined');
  const [forecastHour, setForecastHour] = useState(0);

  // Reset selection when a new result arrives.
  const [shownData, setShownData] = useState<AnalyzeResponse | null>(null);
  if (data !== shownData) {
    setShownData(data);
    const route = data?.routes.find((candidate) => candidate.id === data.recommendation.route_id) ?? data?.routes[0];
    setSelectedRouteId(route?.id ?? null);
    setSelectedCheckpointId(riskiestCheckpoint(route)?.id ?? null);
    setForecastHour(0);
  }

  const selectedRoute = useMemo(() => data?.routes.find((route) => route.id === selectedRouteId), [data, selectedRouteId]);
  const selectedCheckpoint = selectedRoute?.checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null;

  const selectRoute = (routeId: string) => {
    if (routeId === selectedRouteId) return;
    setSelectedRouteId(routeId);
    setSelectedCheckpointId(riskiestCheckpoint(data?.routes.find((route) => route.id === routeId))?.id ?? null);
  };

  const selectCheckpoint = (routeId: string, checkpointId: string) => {
    setSelectedRouteId(routeId);
    setSelectedCheckpointId(checkpointId);
  };

  const viewDetails = (routeId: string) => {
    selectRoute(routeId);
    document.getElementById('checkpoints')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  const weatherGrid = data?.weather_grid ?? null;
  const legendContent = weatherGrid ? <MapLegend layer={weatherLayer} /> : null;

  return (
    <DashboardLayout
      header={<AppHeader sampleMode={isSampleMode} />}
      sidebar={<TripForm loading={status === 'loading'} onSubmit={analyze} submitOnMount />}
      map={
        <RouteMap
          data={data}
          loading={status === 'loading'}
          selectedRouteId={selectedRouteId}
          selectedCheckpointId={selectedCheckpointId}
          weatherLayer={weatherLayer}
          forecastHour={forecastHour}
          onSelectRoute={selectRoute}
          onSelectCheckpoint={selectCheckpoint}
        >
          <MapLayerControls value={weatherLayer} onChange={setWeatherLayer} mobileLegend={legendContent} />
          {weatherGrid && (
            <div className="pointer-events-none absolute right-12 bottom-3 left-3 z-10 flex items-end gap-3 md:bottom-4 md:left-4">
              {legendContent && (
                <div className="pointer-events-auto hidden w-[230px] shrink-0 rounded-panel border border-line bg-surface px-3 py-2.5 shadow-float md:block">
                  {legendContent}
                </div>
              )}
              <div className="pointer-events-auto mx-auto w-full min-w-0 max-w-[420px]">
                <ForecastSlider hour={forecastHour} onChange={setForecastHour} startTime={weatherGrid.start_time} />
              </div>
              <div className="pointer-events-auto hidden shrink-0 sm:block">
                <ForecastBadge hour={forecastHour} startTime={weatherGrid.start_time} />
              </div>
            </div>
          )}
        </RouteMap>
      }
      routes={
        <RouteComparison
          status={status}
          data={data}
          error={error}
          selectedRouteId={selectedRouteId}
          onSelectRoute={selectRoute}
          onViewDetails={viewDetails}
          onRetry={retry}
        />
      }
      checkpoints={
        status === 'success' &&
        data &&
        selectedRoute && (
          <div id="checkpoints" className="grid scroll-mt-4 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
            <CheckpointTable
              route={selectedRoute}
              intervalMiles={data.checkpoint_interval_miles}
              selectedCheckpointId={selectedCheckpointId}
              onSelect={setSelectedCheckpointId}
            />
            <CheckpointDetails checkpoint={selectedCheckpoint} departureTime={data.departure_time} />
          </div>
        )
      }
    />
  );
}
