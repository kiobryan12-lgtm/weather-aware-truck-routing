import type { LngLat } from '../types/routing';

const EARTH_RADIUS_MILES = 3958.8;

export type Bounds = [southWest: [number, number], northEast: [number, number]];

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const interpolate = (start: number, end: number, fraction: number) => start + (end - start) * fraction;

export function haversineMiles([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function cumulativeMiles(line: LngLat[]): number[] {
  const distances = [0];
  for (let i = 1; i < line.length; i++) {
    distances.push(distances[i - 1] + haversineMiles(line[i - 1], line[i]));
  }
  return distances;
}

// Index of the segment that contains `miles` (binary search).
function segmentIndexAt(cumulative: number[], miles: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high - 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] <= miles) low = middle;
    else high = middle;
  }
  return low;
}

export function pointAtDistance(line: LngLat[], cumulative: number[], miles: number): LngLat {
  if (miles <= 0) return line[0];
  if (miles >= cumulative[cumulative.length - 1]) return line[line.length - 1];
  const index = segmentIndexAt(cumulative, miles);
  const segmentLength = cumulative[index + 1] - cumulative[index];
  const fraction = segmentLength === 0 ? 0 : (miles - cumulative[index]) / segmentLength;
  return [
    interpolate(line[index][0], line[index + 1][0], fraction),
    interpolate(line[index][1], line[index + 1][1], fraction),
  ];
}

export function sliceLine(line: LngLat[], cumulative: number[], fromMiles: number, toMiles: number): LngLat[] {
  const points: LngLat[] = [pointAtDistance(line, cumulative, fromMiles)];
  for (let i = segmentIndexAt(cumulative, fromMiles) + 1; i < line.length && cumulative[i] < toMiles; i++) {
    if (cumulative[i] > fromMiles) points.push(line[i]);
  }
  points.push(pointAtDistance(line, cumulative, toMiles));
  return points;
}

export function boundsOf(lines: LngLat[][]): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const line of lines) {
    for (const [lng, lat] of line) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}
