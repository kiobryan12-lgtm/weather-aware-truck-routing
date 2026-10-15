import type { FeatureCollection, LineString, Point } from 'geojson';
import type { RouteResult, WeatherGrid, WeatherVariable } from '../../types/routing';
import { routeColor } from '../../styles/tokens';
import { valueToWeight, WEATHER_LAYERS } from './weatherLayers';

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

const RISK_VARIABLES: WeatherVariable[] = ['precipitation', 'wind', 'snow'];

/** One point per cell holding every hourly value, so the slider only changes paint. */
export function weatherGridToGeoJSON(grid: WeatherGrid | null): FeatureCollection<Point, Record<string, number | null>> {
  if (!grid) return emptyCollection();
  const variables = Object.keys(grid.values) as WeatherVariable[];
  return {
    type: 'FeatureCollection',
    features: grid.points.map((point, pointIndex) => {
      const properties: Record<string, number | null> = {};
      for (let hour = 0; hour < grid.hour_count; hour++) {
        let combinedWeight = 0;
        for (const variable of variables) {
          const layerConfig = WEATHER_LAYERS[variable];
          const value = grid.values[variable][hour]?.[pointIndex] ?? null;
          properties[`${layerConfig.prefix}${hour}`] = value;
          if (RISK_VARIABLES.includes(variable)) combinedWeight = Math.max(combinedWeight, valueToWeight(layerConfig.stops, value));
        }
        properties[`${WEATHER_LAYERS.combined.prefix}${hour}`] = Math.round(combinedWeight * 1000) / 1000;
      }
      return { type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties };
    }),
  };
}
