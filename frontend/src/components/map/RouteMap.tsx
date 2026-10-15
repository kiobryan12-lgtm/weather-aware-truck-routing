import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, PointLike, StyleSpecification } from 'maplibre-gl';
import type { AnalyzeResponse } from '../../types/routing';
import { boundsOf } from '../../lib/geo';
import { formatTime } from '../../lib/format';
import { RISK_LABELS } from '../../lib/risk';
import { MAP_COLORS } from '../../styles/tokens';
import { Spinner } from '../common/LoadingState';
import { addRouteLayers, applyHeatGridSpacing, applyRouteSelection, LAYERS, SOURCES } from './mapLayers';
import { checkpointsToGeoJSON, routesToGeoJSON, weatherGridToGeoJSON } from './mapData';
import type { CheckpointFeatureProps, RouteFeatureProps } from './mapData';
import { heatColorExpression, heatWeightExpression, WEATHER_LAYERS } from './weatherLayers';
import type { WeatherLayer } from './weatherLayers';

const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/** Used if the basemap can't load, so routes still render. */
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
  // Opaque, so it covers the basemap's own label for the same city.
  label.style.cssText = `position:absolute;top:4px;${labelSide === 'left' ? 'right' : 'left'}:28px;white-space:nowrap;font:700 12px/18px Inter,system-ui,sans-serif;color:#0F172A;background:#fff;padding:1px 7px;border-radius:6px;border:1px solid #E2E8F0;box-shadow:0 1px 3px rgba(15,23,42,.12)`;
  element.appendChild(label);
  return { element, label };
}

type MapHit =
  | { kind: 'route'; props: RouteFeatureProps }
  | { kind: 'checkpoint'; props: CheckpointFeatureProps };

interface RouteMapProps {
  data: AnalyzeResponse | null;
  loading: boolean;
  selectedRouteId: string | null;
  selectedCheckpointId: string | null;
  weatherLayer: WeatherLayer;
  forecastHour: number;
  onSelectRoute: (routeId: string) => void;
  onSelectCheckpoint: (routeId: string, checkpointId: string) => void;
  children?: ReactNode;
}

export function RouteMap({
  data,
  loading,
  selectedRouteId,
  selectedCheckpointId,
  weatherLayer,
  forecastHour,
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

  useEffect(() => {
    handlersRef.current = { onSelectRoute, onSelectCheckpoint };
    dataRef.current = data;
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
      // Start the compact attribution collapsed.
      container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      addRouteLayers(map);
      setReady(true);
    });

    // Trips usually head east: origin label on the left, destination on the right.
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
        layers: [LAYERS.checkpointsSelected, LAYERS.checkpointsOther],
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
      const changed = nextRoute !== hoveredRoute || nextCheckpoint !== hoveredCheckpoint;
      setHover(SOURCES.routes, hoveredRoute, nextRoute);
      setHover(SOURCES.checkpoints, hoveredCheckpoint, nextCheckpoint);
      hoveredRoute = nextRoute;
      hoveredCheckpoint = nextCheckpoint;
      map.getCanvas().style.cursor = hit ? 'pointer' : '';

      if (!hit) {
        tooltip.remove();
        return;
      }
      if (changed) tooltipText.textContent = tooltipTextFor(hit);
      tooltip.setLngLat(event.lngLat);
      if (!tooltip.isOpen()) tooltip.addTo(map);
    };

    const onClick = (event: MapMouseEvent) => {
      const hit = featureAt(event.point);
      if (hit?.kind === 'checkpoint') handlersRef.current.onSelectCheckpoint(hit.props.route_id, hit.props.id);
      else if (hit?.kind === 'route') handlersRef.current.onSelectRoute(hit.props.route_id);
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
        padding: {
          top: compact ? 64 : 56,
          bottom: compact ? 96 : 104,
          left: compact ? 76 : 110,
          right: compact ? 76 : width > 900 ? 230 : 110,
        },
        maxZoom: 8,
        duration: prefersReducedMotion() ? 0 : 800,
      });
    }
  }, [ready, data]);

  // Only filters change, so the camera stays where the user left it.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyRouteSelection(map, selectedRouteId ?? '');
  }, [ready, selectedRouteId, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const previous = selectedCheckpointRef.current;
    if (previous) map.setFeatureState({ source: SOURCES.checkpoints, id: previous }, { selected: false });
    selectedCheckpointRef.current = selectedCheckpointId;
    if (!selectedCheckpointId) return;
    map.setFeatureState({ source: SOURCES.checkpoints, id: selectedCheckpointId }, { selected: true });

    const checkpoint = dataRef.current?.routes.flatMap((route) => route.checkpoints).find((checkpoint) => checkpoint.id === selectedCheckpointId);
    if (checkpoint && !map.getBounds().contains(checkpoint.location)) {
      map.easeTo({ center: checkpoint.location, duration: prefersReducedMotion() ? 0 : 500 });
    }
  }, [ready, selectedCheckpointId, data]);

  // At most one heatmap update per frame while scrubbing.
  const hasGrid = Boolean(data?.weather_grid);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    heatmapFrameRef.current = requestAnimationFrame(() => {
      if (!hasGrid) {
        map.setLayoutProperty(LAYERS.heat, 'visibility', 'none');
        return;
      }
      const config = WEATHER_LAYERS[weatherLayer];
      map.setPaintProperty(LAYERS.heat, 'heatmap-color', heatColorExpression(config));
      map.setPaintProperty(LAYERS.heat, 'heatmap-weight', heatWeightExpression(config, forecastHour));
      map.setLayoutProperty(LAYERS.heat, 'visibility', 'visible');
    });
    return () => cancelAnimationFrame(heatmapFrameRef.current);
  }, [ready, hasGrid, weatherLayer, forecastHour]);

  return (
    <div className="relative h-[400px] overflow-hidden rounded-card border border-line bg-surface-muted shadow-card md:h-[480px] lg:h-full lg:min-h-[500px]">
      {/* MapLibre CSS forces position: relative here, so size it with h-full/w-full. */}
      <div ref={containerRef} className="h-full w-full" role="region" aria-label="Route map" />

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-white/40 pt-4">
          <div className="rounded-full border border-line bg-surface px-3 py-1.5 shadow-float">
            <Spinner label="Analyzing routes and forecast…" />
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
