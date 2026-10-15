import type { Bounds } from '../../lib/geo';

// Fake weather for sample mode: a few moving storm cells placed for Denver to Kansas City
// and stretched to fit other trips. Not a forecast.

export interface WeatherSample {
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  cloud_pct: number;
}

interface StormCell {
  lng: number;
  lat: number;
  lngPerHour: number;
  latPerHour: number;
  lngRadius: number;
  latRadius: number;
  rain: number;
  snow: number;
  wind: number;
  // hours after departure
  startHour: number;
  endHour: number;
}

const REFERENCE_BOUNDS: Bounds = [
  [-104.99, 37.6],
  [-94.58, 41.13],
];

const STORM_CELLS: StormCell[] = [
  // Snow squall, northeast Colorado
  { lng: -103.8, lat: 40.95, lngPerHour: 0.2, latPerHour: 0, lngRadius: 1.1, latRadius: 0.7, rain: 0, snow: 1.35, wind: 8, startHour: -3, endHour: 9 },
  // Thunderstorms, central Nebraska
  { lng: -100.9, lat: 41.0, lngPerHour: 0.12, latPerHour: -0.03, lngRadius: 0.75, latRadius: 0.65, rain: 0.72, snow: 0, wind: 22, startHour: -3, endHour: 12 },
  // High winds, southwest Kansas
  { lng: -101.4, lat: 37.85, lngPerHour: 0.12, latPerHour: 0, lngRadius: 1.5, latRadius: 0.6, rain: 0.06, snow: 0, wind: 37, startHour: 0, endHour: 14 },
  // Showers, central Kansas
  { lng: -99.7, lat: 38.9, lngPerHour: 0.3, latPerHour: 0, lngRadius: 1.2, latRadius: 1.05, rain: 0.33, snow: 0, wind: 10, startHour: -2, endHour: 16 },
  // Later systems so the slider has something to show
  { lng: -106.5, lat: 39.6, lngPerHour: 0.42, latPerHour: -0.02, lngRadius: 1.8, latRadius: 1.4, rain: 0.6, snow: 0, wind: 18, startHour: 16, endHour: 46 },
  { lng: -103.0, lat: 41.6, lngPerHour: 0.3, latPerHour: -0.05, lngRadius: 1.4, latRadius: 0.9, rain: 0, snow: 1.8, wind: 20, startHour: 26, endHour: 52 },
];

const RAMP_HOURS = 3;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function cellStrength(hour: number, startHour: number, endHour: number): number {
  return Math.max(0, Math.min(1, (hour - startHour) / RAMP_HOURS, (endHour - hour) / RAMP_HOURS));
}

export type WeatherField = (lng: number, lat: number, hour: number) => WeatherSample;

export function createWeatherField(bounds: Bounds): WeatherField {
  const [[referenceWest, referenceSouth], [referenceEast, referenceNorth]] = REFERENCE_BOUNDS;
  const [[west, south], [east, north]] = bounds;
  const scaleLng = Math.max(east - west, 1) / (referenceEast - referenceWest);
  const scaleLat = Math.max(north - south, 1) / (referenceNorth - referenceSouth);

  const cells = STORM_CELLS.map((cell) => ({
    ...cell,
    lng: west + (cell.lng - referenceWest) * scaleLng,
    lat: south + (cell.lat - referenceSouth) * scaleLat,
    lngPerHour: cell.lngPerHour * scaleLng,
    latPerHour: cell.latPerHour * scaleLat,
    lngRadius: cell.lngRadius * scaleLng,
    latRadius: cell.latRadius * scaleLat,
  }));

  return (lng, lat, hour) => {
    const showerPattern =
      Math.sin(1.1 * lng + 0.35 * hour) * Math.cos(1.6 * lat - 0.2 * hour) +
      0.6 * Math.sin(2.3 * lng - 1.7 * lat + 0.5 * hour);

    // Background showers stay under 0.10 in/hr so they never change the risk.
    let rain = 0.09 * smoothstep(0.35, 1.4, showerPattern);
    let snow = 0;
    let wind = 13 + 3 * Math.sin(0.9 * lng + 0.25 * hour) + 2 * Math.cos(1.4 * lat - 0.15 * hour);
    let cloud = 20 + 35 * smoothstep(-1.2, 1.4, showerPattern);

    for (const cell of cells) {
      const strength = cellStrength(hour, cell.startHour, cell.endHour);
      if (strength === 0) continue;
      const offsetLng = (lng - (cell.lng + cell.lngPerHour * hour)) / cell.lngRadius;
      const offsetLat = (lat - (cell.lat + cell.latPerHour * hour)) / cell.latRadius;
      const distanceSquared = offsetLng ** 2 + offsetLat ** 2;
      const influence = strength * Math.exp(-distanceSquared);
      rain += cell.rain * influence;
      snow += cell.snow * influence;
      wind += cell.wind * influence;
      cloud += 60 * strength * Math.exp(-distanceSquared / 3);
    }

    return {
      wind_mph: Math.round(wind),
      rain_in_hr: Math.round(rain * 100) / 100,
      snow_in_hr: Math.round(snow * 100) / 100,
      cloud_pct: Math.round(Math.min(100, cloud)),
    };
  };
}
