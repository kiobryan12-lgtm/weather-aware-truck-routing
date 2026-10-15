import type { LngLat } from '../../types/routing';
import { haversineMiles } from '../../lib/geo';

/** Deterministic PRNG (mulberry32) so the same trip always yields the same geometry. */
function seededRandom(seed: string): () => number {
  let hash = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

export function densify(waypoints: LngLat[], seed: string, stepMiles = 2): LngLat[] {
  const random = seededRandom(seed);
  const line: LngLat[] = [waypoints[0]];

  for (let waypointIndex = 1; waypointIndex < waypoints.length; waypointIndex++) {
    const [startLng, startLat] = waypoints[waypointIndex - 1];
    const [endLng, endLat] = waypoints[waypointIndex];
    const steps = Math.max(1, Math.ceil(haversineMiles(waypoints[waypointIndex - 1], waypoints[waypointIndex]) / stepMiles));
    const deltaLng = endLng - startLng;
    const deltaLat = endLat - startLat;
    const length = Math.hypot(deltaLng, deltaLat) || 1;
    const normalLng = -deltaLat / length;
    const normalLat = deltaLng / length;
    const bendAmplitude = Math.min(0.05, length * 0.04) * (random() * 2 - 1);
    const rippleAmplitude = Math.min(0.015, length * 0.012) * (random() * 2 - 1);
    const rippleFrequency = 2 + Math.floor(random() * 3);

    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      // Both terms are zero at the endpoints, so every waypoint is hit exactly.
      const offset =
        bendAmplitude * Math.sin(Math.PI * progress) + rippleAmplitude * Math.sin(Math.PI * rippleFrequency * progress);
      line.push([
        roundCoordinate(startLng + deltaLng * progress + normalLng * offset),
        roundCoordinate(startLat + deltaLat * progress + normalLat * offset),
      ]);
    }
  }
  return line;
}
