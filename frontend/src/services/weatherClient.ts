import type { ForecastPlan, LngLat, SuppliedForecasts } from '../types/routing';
import { ApiError } from './apiError';

// Fetched in the browser so each visitor uses their own Open-Meteo allowance
// instead of the hosting server's shared one.
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const BATCH_SIZE = 100;
const PARALLEL_REQUESTS = 2;
const CACHE_MS = 30 * 60 * 1000;

interface OpenMeteoLocation {
  hourly: {
    time: string[];
    wind_speed_10m: (number | null)[];
    rain: (number | null)[];
    snowfall: (number | null)[];
    cloud_cover: (number | null)[];
  };
}

const cache = new Map<string, { savedAt: number; forecasts: SuppliedForecasts }>();

const toOpenMeteoHour = (iso: string) => iso.slice(0, 16);

async function readReason(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { reason?: unknown };
    return typeof body.reason === 'string' ? body.reason : null;
  } catch {
    return null;
  }
}

async function fetchBatch(points: LngLat[], plan: ForecastPlan, signal?: AbortSignal): Promise<OpenMeteoLocation[]> {
  const params = new URLSearchParams({
    latitude: points.map(([, lat]) => lat.toFixed(2)).join(','),
    longitude: points.map(([lng]) => lng.toFixed(2)).join(','),
    hourly: 'wind_speed_10m,rain,snowfall,cloud_cover',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'GMT',
    start_hour: toOpenMeteoHour(plan.start_time!),
    end_hour: toOpenMeteoHour(plan.end_time!),
  });

  let response: Response;
  try {
    response = await fetch(`${OPEN_METEO_URL}?${params}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError("Can't reach the weather service. Check your connection and try again.");
  }
  if (response.status === 429) {
    const reason = (await readReason(response)) ?? 'Please try again later.';
    throw new ApiError(`The weather service's free usage limit was reached. ${reason}`, 429);
  }
  if (!response.ok) throw new ApiError('The weather service could not process the request. Please try again.', response.status);
  const body = (await response.json()) as OpenMeteoLocation | OpenMeteoLocation[];
  return Array.isArray(body) ? body : [body];
}

export async function fetchForecasts(plan: ForecastPlan, signal?: AbortSignal): Promise<SuppliedForecasts | null> {
  if (!plan.start_time || !plan.end_time || plan.points.length === 0) return null;

  const cacheKey = JSON.stringify(plan);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_MS) return cached.forecasts;

  const batches: LngLat[][] = [];
  for (let index = 0; index < plan.points.length; index += BATCH_SIZE) {
    batches.push(plan.points.slice(index, index + BATCH_SIZE));
  }
  const locations: OpenMeteoLocation[] = [];
  for (let index = 0; index < batches.length; index += PARALLEL_REQUESTS) {
    const results = await Promise.all(batches.slice(index, index + PARALLEL_REQUESTS).map((batch) => fetchBatch(batch, plan, signal)));
    locations.push(...results.flat());
  }

  const forecasts: SuppliedForecasts = {
    start_time: `${locations[0].hourly.time[0]}Z`,
    points: plan.points,
    wind_mph: locations.map((location) => location.hourly.wind_speed_10m),
    rain_in: locations.map((location) => location.hourly.rain),
    snow_in: locations.map((location) => location.hourly.snowfall),
    cloud_pct: locations.map((location) => location.hourly.cloud_cover),
  };
  cache.set(cacheKey, { savedAt: Date.now(), forecasts });
  return forecasts;
}
