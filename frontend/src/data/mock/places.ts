import type { LngLat } from '../../types/routing';

export interface SamplePlace {
  city: string;
  region: string;
  location: LngLat;
}

export const SAMPLE_PLACES: SamplePlace[] = [
  { city: 'Denver', region: 'CO', location: [-104.9903, 39.7392] },
  { city: 'Kansas City', region: 'MO', location: [-94.5786, 39.0997] },
  { city: 'Colorado Springs', region: 'CO', location: [-104.8214, 38.8339] },
  { city: 'Cheyenne', region: 'WY', location: [-104.8202, 41.14] },
  { city: 'Omaha', region: 'NE', location: [-95.9345, 41.2565] },
  { city: 'Lincoln', region: 'NE', location: [-96.6852, 40.8136] },
  { city: 'Wichita', region: 'KS', location: [-97.3301, 37.6872] },
  { city: 'Topeka', region: 'KS', location: [-95.689, 39.0473] },
  { city: 'Oklahoma City', region: 'OK', location: [-97.5164, 35.4676] },
  { city: 'Tulsa', region: 'OK', location: [-95.9928, 36.154] },
  { city: 'Amarillo', region: 'TX', location: [-101.8313, 35.222] },
  { city: 'Dallas', region: 'TX', location: [-96.797, 32.7767] },
  { city: 'Albuquerque', region: 'NM', location: [-106.6504, 35.0844] },
  { city: 'Salt Lake City', region: 'UT', location: [-111.891, 40.7608] },
  { city: 'Des Moines', region: 'IA', location: [-93.6091, 41.5868] },
  { city: 'Minneapolis', region: 'MN', location: [-93.265, 44.9778] },
  { city: 'Sioux Falls', region: 'SD', location: [-96.7311, 43.5446] },
  { city: 'St. Louis', region: 'MO', location: [-90.1994, 38.627] },
  { city: 'Chicago', region: 'IL', location: [-87.6298, 41.8781] },
  { city: 'Memphis', region: 'TN', location: [-90.049, 35.1495] },
];

export const placeLabel = (place: SamplePlace) => `${place.city}, ${place.region}`;

function normalizePlaceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/,?\s*(usa|united states)$/, '')
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findSamplePlace(query: string): SamplePlace | null {
  const normalizedQuery = normalizePlaceText(query);
  if (!normalizedQuery) return null;
  return (
    SAMPLE_PLACES.find((place) => normalizePlaceText(placeLabel(place)) === normalizedQuery) ??
    SAMPLE_PLACES.find((place) => normalizePlaceText(place.city) === normalizedQuery) ??
    null
  );
}

export function searchSamplePlaces(query: string, limit = 6): SamplePlace[] {
  const normalizedQuery = normalizePlaceText(query);
  if (!normalizedQuery) return [];
  const startsWithQuery = (place: SamplePlace) => normalizePlaceText(place.city).startsWith(normalizedQuery);
  return SAMPLE_PLACES.filter((place) => normalizePlaceText(placeLabel(place)).includes(normalizedQuery))
    .sort((a, b) => Number(startsWithQuery(b)) - Number(startsWithQuery(a)))
    .slice(0, limit);
}
