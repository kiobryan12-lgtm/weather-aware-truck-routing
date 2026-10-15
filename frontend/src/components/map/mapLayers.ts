import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { MAP_COLORS, RISK_COLORS } from '../../styles/tokens';
import { emptyCollection } from './mapData';

export const SOURCES = {
  heat: 'weather-heat',
  routes: 'routes',
  checkpoints: 'checkpoints',
} as const;

export const LAYERS = {
  heat: 'weather-heat',
  routesOtherCasing: 'routes-other-casing',
  routesOther: 'routes-other',
  selectedCasing: 'route-selected-casing',
  selected: 'route-selected',
  routesHit: 'routes-hit',
  checkpointsOther: 'checkpoints-other',
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

/** Added once; later updates only change data, filters, and paint. */
export function addRouteLayers(map: MapLibreMap): void {
  map.addSource(SOURCES.heat, { type: 'geojson', data: emptyCollection() });
  map.addSource(SOURCES.routes, { type: 'geojson', data: emptyCollection(), promoteId: 'route_id' });
  map.addSource(SOURCES.checkpoints, { type: 'geojson', data: emptyCollection(), promoteId: 'id' });

  // Below basemap labels so place names stay readable.
  const firstSymbolLayer = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
  // Soft circles coloured by each cell's own value, so isolated weather keeps its true intensity.
  map.addLayer(
    {
      id: LAYERS.heat,
      type: 'circle',
      source: SOURCES.heat,
      maxzoom: HEAT_MAX_ZOOM,
      layout: { visibility: 'none' },
      paint: {
        'circle-blur': 1,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], HEAT_MAX_ZOOM - 1, 0.8, HEAT_MAX_ZOOM, 0],
        'circle-pitch-alignment': 'map',
      },
    },
    firstSymbolLayer,
  );

  const lineLayout = { 'line-cap': 'round', 'line-join': 'round' } as const;

  map.addLayer({
    id: LAYERS.routesOtherCasing,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    paint: { 'line-color': MAP_COLORS.casing, 'line-width': ['case', isHovered, 9, 7] },
  });
  map.addLayer({
    id: LAYERS.routesOther,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    paint: { 'line-color': ['get', 'color'], 'line-width': ['case', isHovered, 5, 4], 'line-opacity': 0.85 },
  });
  map.addLayer({
    id: LAYERS.selectedCasing,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    filter: matchesRoute(''),
    paint: { 'line-color': MAP_COLORS.casing, 'line-width': 10 },
  });
  map.addLayer({
    id: LAYERS.selected,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    filter: matchesRoute(''),
    paint: { 'line-color': ['get', 'color'], 'line-width': 6 },
  });
  // Invisible wide line for an easier hover and click target.
  map.addLayer({
    id: LAYERS.routesHit,
    type: 'line',
    source: SOURCES.routes,
    layout: lineLayout,
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
  });
  map.addLayer({
    id: LAYERS.checkpointsOther,
    type: 'circle',
    source: SOURCES.checkpoints,
    filter: excludesRoute(''),
    paint: {
      'circle-color': MAP_COLORS.casing,
      'circle-radius': ['case', isHovered, 5, 3.5],
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 2,
    },
  });
  // Selected route: dots filled by risk level.
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
  map.setFilter(LAYERS.routesOtherCasing, excludesRoute(routeId));
  map.setFilter(LAYERS.routesOther, excludesRoute(routeId));
  map.setFilter(LAYERS.selectedCasing, matchesRoute(routeId));
  map.setFilter(LAYERS.selected, matchesRoute(routeId));
  map.setFilter(LAYERS.checkpointsOther, excludesRoute(routeId));
  map.setFilter(LAYERS.checkpointsSelected, matchesRoute(routeId));
}

/** Circle radius follows the grid spacing at every zoom so neighbouring cells blend into a continuous field. */
export function applyHeatGridSpacing(map: MapLibreMap, spacingDeg: number): void {
  const RADIUS_TO_SPACING = 1.3;
  // 512px tiles: pixels per degree of longitude at zoom 0.
  const radiusAtZoom0 = RADIUS_TO_SPACING * spacingDeg * (512 / 360);
  map.setPaintProperty(LAYERS.heat, 'circle-radius', [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    0, radiusAtZoom0,
    HEAT_MAX_ZOOM, radiusAtZoom0 * 2 ** HEAT_MAX_ZOOM,
  ]);
}
