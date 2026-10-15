import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { MAP_COLORS, RISK_COLORS } from '../../styles/tokens';
import { emptyCollection } from './mapData';

export const SOURCES = {
  heat: 'weather-heat',
  routes: 'routes',
  segments: 'risk-segments',
  checkpoints: 'checkpoints',
} as const;

export const LAYERS = {
  heat: 'weather-heat',
  alternativeCasing: 'routes-alternative-casing',
  alternative: 'routes-alternative',
  selectedCasing: 'route-selected-casing',
  segments: 'route-selected-risk',
  segmentsUnknown: 'route-selected-unknown',
  routesHit: 'routes-hit',
  checkpointsAlternative: 'checkpoints-alternative',
  checkpointsSelected: 'checkpoints-selected',
} as const;

const HEAT_MAX_ZOOM = 10;

const riskColor: ExpressionSpecification = [
  'match',
  ['get', 'risk'],
  'low', RISK_COLORS.low,
  'moderate', RISK_COLORS.moderate,
  'high', RISK_COLORS.high,
  'severe', RISK_COLORS.severe,
  'no_travel', RISK_COLORS.no_travel,
  RISK_COLORS.unknown,
];

const isHovered: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
const isSelected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];

const matchesRoute = (routeId: string): ExpressionSpecification => ['==', ['get', 'route_id'], routeId];
const excludesRoute = (routeId: string): ExpressionSpecification => ['!=', ['get', 'route_id'], routeId];

export function addRouteLayers(map: MapLibreMap): void {
  map.addSource(SOURCES.heat, { type: 'geojson', data: emptyCollection() });
  map.addSource(SOURCES.routes, { type: 'geojson', data: emptyCollection(), promoteId: 'route_id' });
  map.addSource(SOURCES.segments, { type: 'geojson', data: emptyCollection() });
  map.addSource(SOURCES.checkpoints, { type: 'geojson', data: emptyCollection(), promoteId: 'id' });

  // Added below the basemap labels so place names stay readable.
  const firstSymbolLayer = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
  // Blurred circles instead of a heatmap layer: the heatmap sums neighbours, which fades isolated cells.
  map.addLayer(
    {
      id: LAYERS.heat,
      type: 'circle',
      source: SOURCES.heat,
      maxzoom: HEAT_MAX_ZOOM,
      layout: { visibility: 'none' },
      paint: {
        'circle-blur': 1,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], HEAT_MAX_ZOOM - 1, 0.7, HEAT_MAX_ZOOM, 0],
        'circle-pitch-alignment': 'map',
      },
    },
    firstSymbolLayer,
  );

  const lineLayout = { 'line-cap': 'round', 'line-join': 'round' } as const;

  // Alternatives are gray so the selected route stands out.
  map.addLayer({
    id: LAYERS.alternativeCasing,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    paint: { 'line-color': MAP_COLORS.casing, 'line-width': ['case', isHovered, 9, 7] },
  });
  map.addLayer({
    id: LAYERS.alternative,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    paint: {
      'line-color': ['case', isHovered, MAP_COLORS.alternativeHover, MAP_COLORS.alternative],
      'line-width': ['case', isHovered, 5, 4],
    },
  });
  map.addLayer({
    id: LAYERS.selectedCasing,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    filter: matchesRoute(''),
    paint: { 'line-color': MAP_COLORS.casing, 'line-width': 11 },
  });
  // The selected route is drawn in pieces, each coloured by its checkpoint's risk.
  map.addLayer({
    id: LAYERS.segments,
    type: 'line',
    source: SOURCES.segments,
    layout: lineLayout,
    filter: matchesRoute(''),
    paint: { 'line-color': riskColor, 'line-width': 6 },
  });
  map.addLayer({
    id: LAYERS.segmentsUnknown,
    type: 'line',
    source: SOURCES.segments,
    layout: { 'line-join': 'round' },
    filter: matchesRoute(''),
    paint: { 'line-color': RISK_COLORS.unknown, 'line-width': 6, 'line-dasharray': [1, 1] },
  });
  // Wide invisible line to make routes easier to hover and click.
  map.addLayer({
    id: LAYERS.routesHit,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
  });
  map.addLayer({
    id: LAYERS.checkpointsAlternative,
    type: 'circle',
    source: SOURCES.checkpoints,
    filter: excludesRoute(''),
    paint: {
      'circle-color': MAP_COLORS.casing,
      'circle-radius': ['case', isHovered, 4.5, 3],
      'circle-stroke-color': MAP_COLORS.alternative,
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: LAYERS.checkpointsSelected,
    type: 'circle',
    source: SOURCES.checkpoints,
    filter: matchesRoute(''),
    paint: {
      'circle-color': riskColor,
      'circle-radius': ['case', isSelected, 8, isHovered, 6.5, 5],
      'circle-stroke-color': ['case', isSelected, MAP_COLORS.selectedStroke, MAP_COLORS.casing],
      'circle-stroke-width': ['case', isSelected, 3, 2],
    },
  });
}

export function applyRouteSelection(map: MapLibreMap, routeId: string): void {
  map.setFilter(LAYERS.alternativeCasing, excludesRoute(routeId));
  map.setFilter(LAYERS.alternative, excludesRoute(routeId));
  map.setFilter(LAYERS.selectedCasing, matchesRoute(routeId));
  map.setFilter(LAYERS.segments, ['all', matchesRoute(routeId), ['!=', ['get', 'risk'], 'unknown']]);
  map.setFilter(LAYERS.segmentsUnknown, ['all', matchesRoute(routeId), ['==', ['get', 'risk'], 'unknown']]);
  map.setFilter(LAYERS.checkpointsAlternative, excludesRoute(routeId));
  map.setFilter(LAYERS.checkpointsSelected, matchesRoute(routeId));
}

// Radius scales with zoom so neighbouring cells always overlap.
export function applyHeatGridSpacing(map: MapLibreMap, spacingDeg: number): void {
  const RADIUS_TO_SPACING = 1.3;
  // Pixels per degree of longitude at zoom 0 (512px tiles).
  const radiusAtZoom0 = RADIUS_TO_SPACING * spacingDeg * (512 / 360);
  map.setPaintProperty(LAYERS.heat, 'circle-radius', [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    0, radiusAtZoom0,
    HEAT_MAX_ZOOM, radiusAtZoom0 * 2 ** HEAT_MAX_ZOOM,
  ]);
}
