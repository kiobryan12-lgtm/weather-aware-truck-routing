import { useEffect, useMemo, useState } from 'react';
import type { AnalyzeResponse, Checkpoint, RouteResult } from './types/routing';
import { RISK_SEVERITY } from './lib/risk';
import { formatMiles } from './lib/format';
import { truckPositionAt } from './lib/truckPosition';
import { useRouteAnalysis } from './hooks/useRouteAnalysis';
import { isSampleMode } from './services/routingApi';
import { AppHeader } from './components/layout/AppHeader';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { TripForm } from './components/trip/TripForm';
import { RouteMap } from './components/map/RouteMap';
import { MapLayerControls } from './components/map/MapLayerControls';
import { MapLegend } from './components/map/MapLegend';
import { ForecastSlider } from './components/map/ForecastSlider';
import type { WeatherLayer } from './components/map/weatherLayers';
import { visibleFromWeight, WEATHER_LAYERS } from './components/map/weatherLayers';
import { peakWeightByHour } from './components/map/mapData';
import { RouteComparison } from './components/routes/RouteComparison';
import { CheckpointPanel } from './components/checkpoints/CheckpointPanel';

const MAX_FORECAST_HOUR = 48;
const PLAYBACK_STEP_MS = 400;

// First checkpoint with the highest risk on the route.
function riskiestCheckpoint(route: RouteResult | undefined): Checkpoint | null {
  if (!route || route.checkpoints.length === 0) return null;
  return route.checkpoints.reduce((riskiest, checkpoint) =>
    RISK_SEVERITY[checkpoint.risk] > RISK_SEVERITY[riskiest.risk] ? checkpoint : riskiest,
  );
}

export default function App() {
  const { status, data, error, isSlow, analyze, retry } = useRouteAnalysis();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [weatherLayer, setWeatherLayer] = useState<WeatherLayer>('combined');
  const [forecastHour, setForecastHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(false);

  // Reset selection when a new result arrives.
  const [shownData, setShownData] = useState<AnalyzeResponse | null>(null);
  if (data !== shownData) {
    setShownData(data);
    const route = data?.routes.find((candidate) => candidate.id === data.recommendation.route_id) ?? data?.routes[0];
    setSelectedRouteId(route?.id ?? null);
    setSelectedCheckpointId(riskiestCheckpoint(route)?.id ?? null);
    setForecastHour(0);
    setPlaying(false);
    if (data) setFormCollapsed(true);
  }

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setForecastHour((hour) => {
        if (hour >= MAX_FORECAST_HOUR) {
          setPlaying(false);
          return hour;
        }
        return hour + 1;
      });
    }, PLAYBACK_STEP_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const togglePlay = () => {
    if (!playing && forecastHour >= MAX_FORECAST_HOUR) setForecastHour(0);
    setPlaying((isPlaying) => !isPlaying);
  };

  const changeForecastHour = (hour: number) => {
    setPlaying(false);
    setForecastHour(hour);
  };

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

  const weatherGrid = data?.weather_grid ?? null;
  const forecastTime = weatherGrid ? new Date(new Date(weatherGrid.start_time).getTime() + forecastHour * 3_600_000) : null;
  const truck = selectedRoute && forecastTime ? truckPositionAt(selectedRoute, forecastTime) : null;
  const truckStatus =
    truck && selectedRoute && data
      ? truck.status === 'before-departure'
        ? `Before departure · Route ${selectedRoute.label}`
        : truck.status === 'arrived'
          ? `Arrived in ${data.destination.name.split(',')[0]}`
          : `Truck at mile ${formatMiles(truck.miles).replace(' mi', '')} · Route ${selectedRoute.label}`
      : null;

  const peakWeights = useMemo(
    () => (weatherGrid ? peakWeightByHour(weatherGrid, weatherLayer) : []),
    [weatherGrid, weatherLayer],
  );
  const visibleFrom = visibleFromWeight(WEATHER_LAYERS[weatherLayer]);
  const strongestWeight = Math.max(0, ...peakWeights);
  const legendContent = weatherGrid ? (
    <MapLegend
      layer={weatherLayer}
      hasWeatherNow={(peakWeights[forecastHour] ?? 0) >= visibleFrom}
      strongestHour={strongestWeight >= visibleFrom ? peakWeights.indexOf(strongestWeight) : null}
      onShowHour={changeForecastHour}
    />
  ) : null;

  return (
    <DashboardLayout
      header={<AppHeader sampleMode={isSampleMode} />}
      form={
        <TripForm
          loading={status === 'loading'}
          onSubmit={analyze}
          submitOnMount
          collapsed={formCollapsed}
          onExpand={() => setFormCollapsed(false)}
        />
      }
      routes={
        <RouteComparison
          status={status}
          data={data}
          error={error}
          selectedRouteId={selectedRouteId}
          onSelectRoute={selectRoute}
          onRetry={retry}
        />
      }
      map={
        <RouteMap
          data={data}
          loading={status === 'loading'}
          loadingMessage={
            isSlow ? 'Waking up the server. On the free hosting plan the first search can take a minute or two.' : 'Analyzing routes and forecast…'
          }
          selectedRouteId={selectedRouteId}
          selectedCheckpointId={selectedCheckpointId}
          weatherLayer={weatherLayer}
          forecastHour={forecastHour}
          truckLocation={truck && truck.status === 'driving' ? truck.location : null}
          onSelectRoute={selectRoute}
          onSelectCheckpoint={selectCheckpoint}
        >
          <MapLayerControls value={weatherLayer} onChange={setWeatherLayer} compactLegend={legendContent} />
          {weatherGrid && (
            <div className="pointer-events-none absolute right-12 bottom-3 left-3 z-10 flex items-end gap-3 md:bottom-4 md:left-4">
              {legendContent && (
                <div className="pointer-events-auto hidden w-[260px] shrink-0 rounded-panel border border-line bg-surface px-3 py-2.5 shadow-float 2xl:block">
                  {legendContent}
                </div>
              )}
              <div className="pointer-events-auto mx-auto w-full min-w-0 max-w-[560px]">
                <ForecastSlider
                  hour={forecastHour}
                  onChange={changeForecastHour}
                  startTime={weatherGrid.start_time}
                  playing={playing}
                  onTogglePlay={togglePlay}
                  truckStatus={truckStatus}
                />
              </div>
            </div>
          )}
        </RouteMap>
      }
      checkpoints={
        status === 'success' &&
        data &&
        selectedRoute && (
          <CheckpointPanel
            route={selectedRoute}
            intervalMiles={data.checkpoint_interval_miles}
            departureTime={data.departure_time}
            selectedCheckpoint={selectedCheckpoint}
            onSelectCheckpoint={setSelectedCheckpointId}
          />
        )
      }
    />
  );
}
