import type { LngLat, RouteResult } from '../types/routing';
import { cumulativeMiles, pointAtDistance } from './geo';

export interface TruckPosition {
  location: LngLat;
  miles: number;
  status: 'before-departure' | 'driving' | 'arrived';
}

/** Where the truck is at `time`, interpolated between checkpoint ETAs along the route. */
export function truckPositionAt(route: RouteResult, time: Date): TruckPosition | null {
  const checkpoints = route.checkpoints;
  if (checkpoints.length === 0 || route.geometry.length < 2) return null;
  const now = time.getTime();
  const etas = checkpoints.map((checkpoint) => new Date(checkpoint.eta).getTime());

  let miles: number;
  let status: TruckPosition['status'] = 'driving';
  if (now <= etas[0]) {
    miles = 0;
    status = 'before-departure';
  } else if (now >= etas[etas.length - 1]) {
    miles = route.distance_mi;
    status = 'arrived';
  } else {
    const next = etas.findIndex((eta) => eta > now);
    const fraction = (now - etas[next - 1]) / (etas[next] - etas[next - 1]);
    const from = checkpoints[next - 1].distance_mi;
    miles = from + (checkpoints[next].distance_mi - from) * fraction;
  }

  // The drawn line is simplified, so scale route miles onto its own length.
  const cumulative = cumulativeMiles(route.geometry);
  const lineMiles = (miles / route.distance_mi) * cumulative[cumulative.length - 1];
  return { location: pointAtDistance(route.geometry, cumulative, lineMiles), miles, status };
}
