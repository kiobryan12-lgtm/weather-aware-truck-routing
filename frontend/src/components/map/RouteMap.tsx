import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, PointLike, StyleSpecification } from 'maplibre-gl';
import type { AnalyzeResponse, LngLat, RouteResult } from '../../types/routing';
import { boundsOf, cumulativeMiles, pointAtDistance } from '../../lib/geo';
import { formatDuration, formatMiles, formatTime, formatWeekdayTime } from '../../lib/format';
import { describePointWeather } from '../../lib/weatherText';
import { RISK_LABELS } from '../../lib/risk';
import { MAP_COLORS } from '../../styles/tokens';
import { Spinner } from '../common/LoadingState';
import { addRouteLayers, applyHeatGridSpacing, applyRouteSelection, LAYERS, SOURCES } from './mapLayers';
import { checkpointsToGeoJSON, nearestGridPointIndex, routesToGeoJSON, segmentsToGeoJSON, weatherGridToGeoJSON } from './mapData';
import type { CheckpointFeatureProps, RouteFeatureProps } from './mapData';
import { heatColorExpression, WEATHER_LAYERS } from './weatherLayers';
import type { WeatherLayer } from './weatherLayers';

const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Fallback if the basemap can't be loaded, so the routes still show.
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#EEF2F6' } }],
};

const INITIAL_CENTER: [number, number] = [-99.5, 39];
const INITIAL_ZOOM = 4.6;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function createMarkerPin(color: string, labelSide: 'left' | 'right'): { element: HTMLElement; label: HTMLElement } {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.style.cssText = 'position:relative;width:30px;height:30px';
  element.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" style="display:block;filter:drop-shadow(0 1px 2px rgba(15,23,42,.35))"><path d="M12 22.5s7.5-6.4 7.5-12.5a7.5 7.5 0 1 0-15 0c0 6.1 7.5 12.5 7.5 12.5z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="10" r="2.75" fill="#fff"/></svg>`;
  const label = document.createElement('span');
  label.setAttribute('aria-hidden', 'true');
  // Solid background so it hides the basemap's own label for the same city.
  label.style.cssText = `position:absolute;top:4px;${labelSide === 'left' ? 'right' : 'left'}:28px;white-space:nowrap;font:700 12px/18px Inter,system-ui,sans-serif;color:#0F172A;background:#fff;padding:1px 7px;border-radius:6px;border:1px solid #E2E8F0;box-shadow:0 1px 3px rgba(15,23,42,.12)`;
  element.appendChild(label);
  return { element, label };
}

// Spread the labels along the routes so they don't sit on top of each other.
const LABEL_POSITIONS = [0.38, 0.52, 0.66];

function labelAnchor(route: RouteResult, index: number): LngLat {
  const cumulative = cumulativeMiles(route.geometry);
  return pointAtDistance(route.geometry, cumulative, cumulative[cumulative.length - 1] * LABEL_POSITIONS[index % 3]);
}

function fillRouteLabel(element: HTMLElement, route: RouteResult, recommended: boolean, selected: boolean): void {
  const miles = route.risk_summary.miles_by_level;
  const title = `Route ${route.label}${recommended ? ' ★ Recommended' : ''}`;
  const lines = [
    `${formatMiles(route.distance_mi)} · ${formatDuration(route.duration_min)}`,
    miles.no_travel > 0
      ? `No Travel ${formatMiles(miles.no_travel)}`
      : `Severe ${formatMiles(miles.severe)} · High ${formatMiles(miles.high)}`,
  ];
  element.className = `route-label${selected ? ' route-label--selected' : ''}`;
  element.replaceChildren(
    Object.assign(document.createElement('strong'), { textContent: title }),
    ...lines.map((line) => Object.assign(document.createElement('span'), { textContent: line })),
  );
  element.setAttribute('aria-pressed', String(selected));
  element.setAttribute('aria-label', `${title}. ${lines.join('. ')}`);
}

function createTruckMarker(): maplibregl.Marker {
  const element = document.createElement('div');
  element.className = 'truck-marker';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', 'Truck position at the selected forecast time');
  element.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
  return new maplibregl.Marker({ element });
}

type MapHit =
  | { kind: 'route'; props: RouteFeatureProps }
  | { kind: 'checkpoint'; props: CheckpointFeatureProps };

interface RouteMapProps {
  data: AnalyzeResponse | null;
  loading: boolean;
  loadingMessage: string;
  selectedRouteId: string | null;
  selectedCheckpointId: string | null;
  weatherLayer: WeatherLayer;
  forecastHour: number;
  truckLocation: LngLat | null;
  onSelectRoute: (routeId: string) => void;
  onSelectCheckpoint: (routeId: string, checkpointId: string) => void;
  children?: ReactNode;
}

export function RouteMap({
  data,
  loading,
  loadingMessage,
  selectedRouteId,
  selectedCheckpointId,
  weatherLayer,
  forecastHour,
  truckLocation,
  onSelectRoute,
  onSelectCheckpoint,
  children,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const handlersRef = useRef({ onSelectRoute, onSelectCheckpoint });
  const dataRef = useRef(data);
  const markersRef = useRef<{
    origin: { marker: maplibregl.Marker; label: HTMLElement };
    destination: { marker: maplibregl.Marker; label: HTMLElement };
  } | null>(null);
  const selectedCheckpointRef = useRef<string | null>(null);
  const heatmapFrameRef = useRef(0);
  const routeLabelsRef = useRef<{ routeId: string; element: HTMLElement; marker: maplibregl.Marker }[]>([]);
  const truckMarkerRef = useRef<maplibregl.Marker | null>(null);

  const forecastHourRef = useRef(forecastHour);

  useEffect(() => {
    handlersRef.current = { onSelectRoute, onSelectCheckpoint };
    dataRef.current = data;
    forecastHourRef.current = forecastHour;
  });

  useEffect(() => {
    const container = containerRef.current!;
    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    let styleArrived = false;
    map.once('styledata', () => {
      styleArrived = true;
    });
    map.on('error', () => {
      if (styleArrived) return;
      styleArrived = true;
      map.setStyle(FALLBACK_STYLE);
    });
    map.on('load', () => {
      // Compact attribution starts expanded by default.
      container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      addRouteLayers(map);
      setReady(true);
    });

    // Most trips head east, so origin label goes left and destination label right.
    const origin = createMarkerPin(MAP_COLORS.origin, 'left');
    const destination = createMarkerPin(MAP_COLORS.destination, 'right');
    markersRef.current = {
      origin: { marker: new maplibregl.Marker({ element: origin.element, anchor: 'bottom' }), label: origin.label },
      destination: { marker: new maplibregl.Marker({ element: destination.element, anchor: 'bottom' }), label: destination.label },
    };

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const tooltip = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'map-tooltip',
      offset: 12,
      maxWidth: 'none',
    });
    const tooltipText = document.createElement('div');
    tooltip.setDOMContent(tooltipText);

    let hoveredRoute: string | null = null;
    let hoveredCheckpoint: string | null = null;

    const setHover = (source: string, previous: string | null, next: string | null) => {
      if (previous === next) return;
      if (previous) map.setFeatureState({ source, id: previous }, { hover: false });
      if (next) map.setFeatureState({ source, id: next }, { hover: true });
    };

    const featureAt = (point: { x: number; y: number }): MapHit | null => {
      const hitBox: [PointLike, PointLike] = [
        [point.x - 6, point.y - 6],
        [point.x + 6, point.y + 6],
      ];
      const checkpoint = map.queryRenderedFeatures(hitBox, {
        layers: [LAYERS.checkpointsSelected, LAYERS.checkpointsAlternative],
      })[0];
      if (checkpoint) return { kind: 'checkpoint', props: checkpoint.properties as CheckpointFeatureProps };
      const route = map.queryRenderedFeatures([point.x, point.y], { layers: [LAYERS.routesHit] })[0];
      if (route) return { kind: 'route', props: route.properties as RouteFeatureProps };
      return null;
    };

    const tooltipTextFor = (hit: MapHit): string => {
      if (hit.kind === 'route') return `Route ${hit.props.label} - ${hit.props.name}`;
      const route = dataRef.current?.routes.find((route) => route.id === hit.props.route_id);
      const risk = RISK_LABELS[hit.props.risk as keyof typeof RISK_LABELS] ?? hit.props.risk;
      return `Route ${route?.label ?? ''} · Checkpoint ${hit.props.index + 1} · ${risk} · ETA ${formatTime(hit.props.eta)}`;
    };

    const weatherTextAt = ({ lng, lat }: { lng: number; lat: number }): string | null => {
      const grid = dataRef.current?.weather_grid;
      const pointIndex = grid ? nearestGridPointIndex(grid, [lng, lat]) : null;
      if (!grid || pointIndex === null) return null;
      const hour = forecastHourRef.current;
      const valueOf = (variable: keyof typeof grid.values) => grid.values[variable][hour]?.[pointIndex] ?? null;
      const time = new Date(new Date(grid.start_time).getTime() + hour * 3_600_000);
      const weather = describePointWeather({
        rain: valueOf('precipitation'),
        snow: valueOf('snow'),
        wind: valueOf('wind'),
        clouds: valueOf('clouds'),
      });
      return `${formatWeekdayTime(time)} · ${weather}`;
    };

    const showTooltip = (text: string, lngLat: maplibregl.LngLat) => {
      tooltipText.textContent = text;
      tooltip.setLngLat(lngLat);
      if (!tooltip.isOpen()) tooltip.addTo(map);
    };

    const clearHover = () => {
      setHover(SOURCES.routes, hoveredRoute, null);
      setHover(SOURCES.checkpoints, hoveredCheckpoint, null);
      hoveredRoute = null;
      hoveredCheckpoint = null;
      map.getCanvas().style.cursor = '';
      tooltip.remove();
    };

    const onMove = (event: MapMouseEvent) => {
      const hit = featureAt(event.point);
      const nextRoute = hit?.kind === 'route' ? hit.props.route_id : null;
      const nextCheckpoint = hit?.kind === 'checkpoint' ? hit.props.id : null;
      setHover(SOURCES.routes, hoveredRoute, nextRoute);
      setHover(SOURCES.checkpoints, hoveredCheckpoint, nextCheckpoint);
      hoveredRoute = nextRoute;
      hoveredCheckpoint = nextCheckpoint;
      map.getCanvas().style.cursor = hit ? 'pointer' : '';

      if (hit) {
        showTooltip(tooltipTextFor(hit), event.lngLat);
        return;
      }
      const weatherText = weatherTextAt(event.lngLat);
      if (weatherText) showTooltip(weatherText, event.lngLat);
      else tooltip.remove();
    };

    const onClick = (event: MapMouseEvent) => {
      const hit = featureAt(event.point);
      if (hit?.kind === 'checkpoint') handlersRef.current.onSelectCheckpoint(hit.props.route_id, hit.props.id);
      else if (hit?.kind === 'route') handlersRef.current.onSelectRoute(hit.props.route_id);
      else {
        // No hover on touch screens, so show the weather on tap.
        const weatherText = weatherTextAt(event.lngLat);
        if (weatherText) showTooltip(weatherText, event.lngLat);
      }
    };

    const canvas = map.getCanvas();
    map.on('mousemove', onMove);
    map.on('click', onClick);
    canvas.addEventListener('mouseleave', clearHover);
    return () => {
      map.off('mousemove', onMove);
      map.off('click', onClick);
      canvas.removeEventListener('mouseleave', clearHover);
      tooltip.remove();
    };
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const routes = data?.routes ?? [];
    (map.getSource(SOURCES.routes) as GeoJSONSource).setData(routesToGeoJSON(routes));
    (map.getSource(SOURCES.segments) as GeoJSONSource).setData(segmentsToGeoJSON(routes));
    (map.getSource(SOURCES.checkpoints) as GeoJSONSource).setData(checkpointsToGeoJSON(routes));
    (map.getSource(SOURCES.heat) as GeoJSONSource).setData(weatherGridToGeoJSON(data?.weather_grid ?? null));
    if (data?.weather_grid) applyHeatGridSpacing(map, data.weather_grid.spacing_deg);

    const { origin, destination } = markersRef.current!;
    if (data) {
      for (const [entry, place, role] of [
        [origin, data.origin, 'Origin'],
        [destination, data.destination, 'Destination'],
      ] as const) {
        entry.marker.setLngLat(place.location).addTo(map);
        entry.marker.getElement().setAttribute('aria-label', `${role}: ${place.name}`);
        entry.label.textContent = place.name.split(',')[0];
      }
    } else {
      origin.marker.remove();
      destination.marker.remove();
    }

    const bounds = boundsOf(routes.map((route) => route.geometry));
    if (bounds) {
      const { clientWidth: width } = map.getContainer();
      const compact = width < 640;
      map.fitBounds(bounds, {
        // Room for the route labels, the forecast slider (bottom) and the layer panel (right).
        padding: {
          top: 80,
          bottom: compact ? 110 : 140,
          left: compact ? 56 : 110,
          right: compact ? 56 : width > 900 ? 300 : 110,
        },
        maxZoom: 8,
        duration: prefersReducedMotion() ? 0 : 800,
      });
    }
  }, [ready, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyRouteSelection(map, selectedRouteId ?? '');
  }, [ready, selectedRouteId, data]);

  // Route labels: recreated for new results, restyled when the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    routeLabelsRef.current.forEach(({ marker }) => marker.remove());
    routeLabelsRef.current = (data?.routes ?? []).map((route, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        handlersRef.current.onSelectRoute(route.id);
      });
      const marker = new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -10] })
        .setLngLat(labelAnchor(route, index))
        .addTo(map);
      return { routeId: route.id, element, marker };
    });
    return () => routeLabelsRef.current.forEach(({ marker }) => marker.remove());
  }, [ready, data]);

  useEffect(() => {
    for (const { routeId, element } of routeLabelsRef.current) {
      const route = data?.routes.find((candidate) => candidate.id === routeId);
      if (route) fillRouteLabel(element, route, data?.recommendation.route_id === routeId, routeId === selectedRouteId);
    }
  }, [ready, data, selectedRouteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!truckLocation) {
      truckMarkerRef.current?.remove();
      return;
    }
    truckMarkerRef.current ??= createTruckMarker();
    truckMarkerRef.current.setLngLat(truckLocation).addTo(map);
  }, [ready, truckLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const previous = selectedCheckpointRef.current;
    if (previous) map.setFeatureState({ source: SOURCES.checkpoints, id: previous }, { selected: false });
    selectedCheckpointRef.current = selectedCheckpointId;
    if (!selectedCheckpointId) return;
    map.setFeatureState({ source: SOURCES.checkpoints, id: selectedCheckpointId }, { selected: true });

    const checkpoint = dataRef.current?.routes.flatMap((route) => route.checkpoints).find((checkpoint) => checkpoint.id === selectedCheckpointId);
    // Don't interrupt the fit to new routes.
    if (checkpoint && !map.isMoving() && !map.getBounds().contains(checkpoint.location)) {
      map.easeTo({ center: checkpoint.location, duration: prefersReducedMotion() ? 0 : 500 });
    }
  }, [ready, selectedCheckpointId, data]);

  // One update per frame while the slider is dragged.
  const hasGrid = Boolean(data?.weather_grid);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    heatmapFrameRef.current = requestAnimationFrame(() => {
      if (!hasGrid) {
        map.setLayoutProperty(LAYERS.heat, 'visibility', 'none');
        return;
      }
      map.setPaintProperty(LAYERS.heat, 'circle-color', heatColorExpression(WEATHER_LAYERS[weatherLayer], forecastHour));
      map.setLayoutProperty(LAYERS.heat, 'visibility', 'visible');
    });
    return () => cancelAnimationFrame(heatmapFrameRef.current);
  }, [ready, hasGrid, weatherLayer, forecastHour]);

  return (
    <div className="relative h-[520px] overflow-hidden rounded-card border border-line bg-surface-muted shadow-card md:h-[560px] lg:h-full lg:min-h-[320px]">
      {/* maplibre-gl.css sets position: relative on this element, so absolute inset-0 doesn't work. */}
      <div ref={containerRef} className="h-full w-full" role="region" aria-label="Route map" />

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-white/40 pt-4">
          <div className="rounded-full border border-line bg-surface px-3 py-1.5 shadow-float">
            <Spinner label={loadingMessage} />
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
