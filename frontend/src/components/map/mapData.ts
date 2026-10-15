import type { FeatureCollection, LineString, Point } from 'geojson';
import type { RouteResult, WeatherGrid, WeatherVariable } from '../../types/routing';
import { routeColor } from '../../styles/tokens';
import { valueToWeight, WEATHER_LAYERS } from './weatherLayers';
import type { WeatherLayer } from './weatherLayers';

export interface RouteFeatureProps {
  route_id: string;
  label: string;
  name: string;
  color: string;
}

export interface CheckpointFeatureProps {
  id: string;
  route_id: string;
  color: string;
  risk: string;
  index: number;
  eta: string;
}

export const emptyCollection = <G extends LineString | Point, P>(): FeatureCollection<G, P> => ({
  type: 'FeatureCollection',
  features: [],
});

export function routesToGeoJSON(routes: RouteResult[]): FeatureCollection<LineString, RouteFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: routes.map((route, routeIndex) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: route.geometry },
      properties: { route_id: route.id, label: route.label, name: route.name, color: routeColor(routeIndex) },
    })),
  };
}

export function checkpointsToGeoJSON(routes: RouteResult[]): FeatureCollection<Point, CheckpointFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((route, routeIndex) =>
      route.checkpoints.map((checkpoint) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: checkpoint.location },
        properties: {
          id: checkpoint.id,
          route_id: route.id,
          color: routeColor(routeIndex),
          risk: checkpoint.risk,
          index: checkpoint.index,
          eta: checkpoint.eta,
        },
      })),
    ),
  };
}

// Wind below the Moderate threshold is left out of the combined layer so normal breezes don't tint the map.
const MODERATE_WIND_MPH = 25;

function valueAt(grid: WeatherGrid, variable: WeatherVariable, hour: number, pointIndex: number): number | null {
  return grid.values[variable][hour]?.[pointIndex] ?? null;
}

function combinedWeight(grid: WeatherGrid, hour: number, pointIndex: number): number {
  const wind = valueAt(grid, 'wind', hour, pointIndex);
  return Math.max(
    valueToWeight(WEATHER_LAYERS.precipitation.stops, valueAt(grid, 'precipitation', hour, pointIndex)),
    valueToWeight(WEATHER_LAYERS.snow.stops, valueAt(grid, 'snow', hour, pointIndex)),
    wind !== null && wind >= MODERATE_WIND_MPH ? valueToWeight(WEATHER_LAYERS.wind.stops, wind) : 0,
  );
}

function layerWeight(grid: WeatherGrid, layer: WeatherLayer, hour: number, pointIndex: number): number {
  if (layer === 'combined') return combinedWeight(grid, hour, pointIndex);
  return valueToWeight(WEATHER_LAYERS[layer].stops, valueAt(grid, layer, hour, pointIndex));
}

export function nearestGridPointIndex(grid: WeatherGrid, [lng, lat]: [number, number]): number | null {
  const lngScale = Math.cos((lat * Math.PI) / 180);
  let nearestIndex: number | null = null;
  let nearestDistance = Infinity;
  grid.points.forEach(([pointLng, pointLat], index) => {
    const distance = Math.hypot((pointLng - lng) * lngScale, pointLat - lat);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });
  return nearestDistance <= grid.spacing_deg * lngScale * 0.75 ? nearestIndex : null;
}

export function peakWeightByHour(grid: WeatherGrid, layer: WeatherLayer): number[] {
  return Array.from({ length: grid.hour_count }, (_, hour) =>
    grid.points.reduce((peak, _point, pointIndex) => Math.max(peak, layerWeight(grid, layer, hour, pointIndex)), 0),
  );
}

export function weatherGridToGeoJSON(grid: WeatherGrid | null): FeatureCollection<Point, Record<string, number | null>> {
  if (!grid) return emptyCollection();
  const variables = Object.keys(grid.values) as WeatherVariable[];
  return {
    type: 'FeatureCollection',
    features: grid.points.map((point, pointIndex) => {
      const properties: Record<string, number | null> = {};
      for (let hour = 0; hour < grid.hour_count; hour++) {
        for (const variable of variables) {
          properties[`${WEATHER_LAYERS[variable].prefix}${hour}`] = valueAt(grid, variable, hour, pointIndex);
        }
        properties[`${WEATHER_LAYERS.combined.prefix}${hour}`] = Math.round(combinedWeight(grid, hour, pointIndex) * 1000) / 1000;
      }
      return { type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties };
    }),
  };
}
