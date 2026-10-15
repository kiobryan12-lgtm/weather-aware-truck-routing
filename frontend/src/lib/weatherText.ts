import type { Checkpoint } from '../types/routing';

/** Plain-language descriptions, using the same bands as the risk rules. */

const TRACE = 0.005;

export function describeRain(inchesPerHour: number): string {
  if (inchesPerHour < TRACE) return 'No rain';
  if (inchesPerHour < 0.1) return 'Light rain';
  if (inchesPerHour < 0.25) return 'Moderate rain';
  if (inchesPerHour < 0.5) return 'Heavy rain';
  return 'Very heavy rain';
}

export function describeSnow(inchesPerHour: number): string {
  if (inchesPerHour < TRACE) return 'No snow';
  if (inchesPerHour < 0.5) return 'Light snow';
  if (inchesPerHour < 1) return 'Moderate snow';
  if (inchesPerHour < 2) return 'Heavy snow';
  return 'Very heavy snow';
}

export function describeWind(mph: number): string {
  if (mph < 10) return 'Light wind';
  if (mph < 25) return 'Breezy';
  if (mph < 35) return 'Windy';
  if (mph < 45) return 'Strong wind';
  if (mph < 55) return 'Severe wind';
  return 'Extreme wind';
}

export function describeClouds(percent: number): string {
  if (percent < 25) return 'Clear';
  if (percent < 50) return 'Partly cloudy';
  if (percent < 75) return 'Mostly cloudy';
  return 'Overcast';
}

export interface PointWeather {
  rain: number | null;
  snow: number | null;
  wind: number | null;
  clouds: number | null;
}

/** e.g. "Light rain (0.04 in/hr) · Breezy, 18 mph · Partly cloudy". */
export function describePointWeather({ rain, snow, wind, clouds }: PointWeather): string {
  const parts: string[] = [];
  if (snow !== null && snow >= TRACE) parts.push(`${describeSnow(snow)} (${snow.toFixed(2)} in/hr)`);
  else if (rain !== null) parts.push(rain >= TRACE ? `${describeRain(rain)} (${rain.toFixed(2)} in/hr)` : 'Dry');
  if (wind !== null) parts.push(`${describeWind(wind)}, ${Math.round(wind)} mph`);
  if (clouds !== null) parts.push(describeClouds(clouds));
  return parts.join(' · ') || 'No forecast';
}

/** Worst conditions along a route, e.g. "Rain up to 0.30 in/hr · wind up to 40 mph". */
export function describeRouteWeather(checkpoints: Checkpoint[]): string {
  const known = checkpoints.filter((checkpoint) => checkpoint.weather.wind_mph !== null);
  if (known.length === 0) return 'Forecast unavailable';
  const maxOf = (pick: (checkpoint: Checkpoint) => number | null) => Math.max(...known.map((checkpoint) => pick(checkpoint) ?? 0));
  const maxRain = maxOf((checkpoint) => checkpoint.weather.rain_in_hr);
  const maxSnow = maxOf((checkpoint) => checkpoint.weather.snow_in_hr);
  const maxWind = maxOf((checkpoint) => checkpoint.weather.wind_mph);

  const precipitation: string[] = [];
  if (maxSnow >= TRACE) precipitation.push(`Snow up to ${maxSnow.toFixed(2)} in/hr`);
  if (maxRain >= TRACE) precipitation.push(`Rain up to ${maxRain.toFixed(2)} in/hr`);
  return [...(precipitation.length ? precipitation : ['Dry']), `wind up to ${Math.round(maxWind)} mph`].join(' · ');
}
