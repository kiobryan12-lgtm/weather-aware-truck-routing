import type { LngLat } from '../../types/routing';
import type { SamplePlace } from './places';
import { placeLabel } from './places';

export interface NamedWaypoint {
  name: string;
  location: LngLat;
}

export interface CorridorSpec {
  label: '1' | '2' | '3';
  name: string;
  via: string;
  averageSpeedMph: number;
  waypoints: NamedWaypoint[];
}

const waypoint = (name: string, lng: number, lat: number): NamedWaypoint => ({ name, location: [lng, lat] });

// Waypoints follow the real highways.
const DENVER_KANSAS_CITY_CORRIDORS: CorridorSpec[] = [
  {
    label: '1',
    name: 'Northern Route',
    via: 'I-76 · I-80 · I-29',
    averageSpeedMph: 64,
    waypoints: [
      waypoint('Denver, CO', -104.9903, 39.7392),
      waypoint('Brighton, CO', -104.82, 39.985),
      waypoint('Fort Morgan, CO', -103.8, 40.25),
      waypoint('Sterling, CO', -103.21, 40.625),
      waypoint('Julesburg, CO', -102.26, 40.99),
      waypoint('Ogallala, NE', -101.72, 41.13),
      waypoint('North Platte, NE', -100.77, 41.12),
      waypoint('Lexington, NE', -99.74, 40.78),
      waypoint('Kearney, NE', -99.08, 40.7),
      waypoint('Grand Island, NE', -98.34, 40.92),
      waypoint('York, NE', -97.59, 40.87),
      waypoint('Lincoln, NE', -96.7, 40.81),
      waypoint('Nebraska City, NE', -95.86, 40.68),
      waypoint('Rock Port, MO', -95.52, 40.41),
      waypoint('St. Joseph, MO', -94.85, 39.77),
      waypoint('Kansas City, MO', -94.5786, 39.0997),
    ],
  },
  {
    label: '2',
    name: 'Middle Route',
    via: 'I-70',
    averageSpeedMph: 65,
    waypoints: [
      waypoint('Denver, CO', -104.9903, 39.7392),
      waypoint('Watkins, CO', -104.6, 39.75),
      waypoint('Limon, CO', -103.69, 39.26),
      waypoint('Flagler, CO', -103.07, 39.29),
      waypoint('Burlington, CO', -102.27, 39.3),
      waypoint('Goodland, KS', -101.71, 39.35),
      waypoint('Colby, KS', -101.05, 39.4),
      waypoint('Oakley, KS', -100.86, 39.13),
      waypoint('WaKeeney, KS', -99.88, 39.02),
      waypoint('Hays, KS', -99.33, 38.88),
      waypoint('Russell, KS', -98.86, 38.9),
      waypoint('Salina, KS', -97.61, 38.84),
      waypoint('Abilene, KS', -97.21, 38.92),
      waypoint('Junction City, KS', -96.83, 39.03),
      waypoint('Topeka, KS', -95.69, 39.05),
      waypoint('Lawrence, KS', -95.24, 38.97),
      waypoint('Kansas City, MO', -94.5786, 39.0997),
    ],
  },
  {
    label: '3',
    name: 'Southern Route',
    via: 'I-25 · US-50 · I-35',
    averageSpeedMph: 59,
    waypoints: [
      waypoint('Denver, CO', -104.9903, 39.7392),
      waypoint('Castle Rock, CO', -104.86, 39.37),
      waypoint('Colorado Springs, CO', -104.82, 38.83),
      waypoint('Pueblo, CO', -104.61, 38.25),
      waypoint('La Junta, CO', -103.54, 37.98),
      waypoint('Lamar, CO', -102.62, 38.09),
      waypoint('Syracuse, KS', -101.75, 37.98),
      waypoint('Garden City, KS', -100.87, 37.97),
      waypoint('Dodge City, KS', -100.02, 37.75),
      waypoint('Greensburg, KS', -99.29, 37.6),
      waypoint('Pratt, KS', -98.74, 37.64),
      waypoint('Kingman, KS', -98.11, 37.65),
      waypoint('Wichita, KS', -97.34, 37.69),
      waypoint('El Dorado, KS', -96.86, 37.82),
      waypoint('Emporia, KS', -96.18, 38.4),
      waypoint('Ottawa, KS', -95.27, 38.62),
      waypoint('Olathe, KS', -94.82, 38.88),
      waypoint('Kansas City, MO', -94.5786, 39.0997),
    ],
  },
];

export function presetCorridors(origin: SamplePlace, destination: SamplePlace): CorridorSpec[] | null {
  const trip = `${placeLabel(origin)}|${placeLabel(destination)}`;
  if (trip === 'Denver, CO|Kansas City, MO') return DENVER_KANSAS_CITY_CORRIDORS;
  if (trip === 'Kansas City, MO|Denver, CO') {
    return DENVER_KANSAS_CITY_CORRIDORS.map((corridor) => ({ ...corridor, waypoints: [...corridor.waypoints].reverse() }));
  }
  return null;
}

// Fallback for other city pairs: one route bowed to each side plus a straight one.
export function genericCorridors(origin: SamplePlace, destination: SamplePlace): CorridorSpec[] {
  const [originLng, originLat] = origin.location;
  const [destinationLng, destinationLat] = destination.location;
  // Scale longitude by cos(lat) so the offset is the same distance in both axes.
  const lngScale = Math.cos((((originLat + destinationLat) / 2) * Math.PI) / 180);
  const directionX = (destinationLng - originLng) * lngScale;
  const directionY = destinationLat - originLat;
  const tripLength = Math.hypot(directionX, directionY);
  const normalX = -directionY / tripLength;
  const normalY = directionX / tripLength;
  const isEastWest = Math.abs(directionX) >= Math.abs(directionY);
  const sideName = (side: number) =>
    isEastWest ? (normalY * side > 0 ? 'Northern' : 'Southern') : normalX * side > 0 ? 'Eastern' : 'Western';

  const variants = [
    { label: '1' as const, bow: 0.16, name: `${sideName(1)} Route`, averageSpeedMph: 62 },
    { label: '2' as const, bow: 0, name: 'Middle Route', averageSpeedMph: 64 },
    { label: '3' as const, bow: -0.14, name: `${sideName(-1)} Route`, averageSpeedMph: 60 },
  ];

  return variants.map(({ label, bow, name, averageSpeedMph }) => {
    const waypoints: NamedWaypoint[] = [{ name: placeLabel(origin), location: origin.location }];
    for (let step = 1; step < 6; step++) {
      const progress = step / 6;
      const offset = bow * tripLength * Math.sin(Math.PI * progress);
      waypoints.push({
        name: '',
        location: [
          originLng + (directionX * progress + normalX * offset) / lngScale,
          originLat + directionY * progress + normalY * offset,
        ],
      });
    }
    waypoints.push({ name: placeLabel(destination), location: destination.location });
    return { label, name, via: 'Sample corridor', averageSpeedMph, waypoints };
  });
}
