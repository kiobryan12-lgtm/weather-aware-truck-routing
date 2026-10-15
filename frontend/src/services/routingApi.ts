import type { AnalyzeResponse, ForecastPlan, LocationSuggestion, TripRequest } from '../types/routing';
import { ApiError } from './apiError';
import { fetchForecasts } from './weatherClient';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export const isSampleMode = import.meta.env.VITE_DATA_SOURCE === 'mock';

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const message = body.detail ?? body.error;
    if (typeof message === 'string' && message.length < 300) return message;
  } catch {
    // not JSON, fall back to the generic message
  }
  return response.status >= 500
    ? 'The routing service is having trouble right now. Please try again in a moment.'
    : 'The request could not be processed. Check your trip details and try again.';
}

// The free backend sleeps when idle and can take a minute or two to start again.
const WAKE_UP_LIMIT_MS = 120_000;
const MAX_RETRY_DELAY_MS = 8000;
const WAKING_STATUSES = new Set([502, 503, 504]);

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

function wait(milliseconds: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

const retryDelay = (attempt: number) => Math.min(2000 * 2 ** attempt, MAX_RETRY_DELAY_MS);

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt++) {
    const canRetry = Date.now() - startedAt + retryDelay(attempt) < WAKE_UP_LIMIT_MS;
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
      });
    } catch (error) {
      if (isAbort(error)) throw error;
      if (canRetry) {
        await wait(retryDelay(attempt), init.signal);
        continue;
      }
      throw new ApiError("Can't reach the routing service. Check your connection and try again.");
    }
    // Render's own error page while starting has no JSON body.
    const isStartupPage = WAKING_STATUSES.has(response.status) && !response.headers.get('content-type')?.includes('json');
    if (isStartupPage && canRetry) {
      await wait(retryDelay(attempt), init.signal);
      continue;
    }
    if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);
    return (await response.json()) as T;
  }
}

export function wakeBackend(): void {
  if (isSampleMode) return;
  fetch(`${API_BASE_URL}/api/health`).catch(() => undefined);
}

export async function analyzeRoutes(trip: TripRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  if (isSampleMode) {
    const { mockAnalyzeRoutes } = await import('../data/mock/mockRouting');
    return mockAnalyzeRoutes(trip, signal);
  }
  // 1. ask which forecasts are needed, 2. fetch them here, 3. send them back for the risk analysis
  const plan = await requestJson<ForecastPlan>('/api/routes/plan', {
    method: 'POST',
    body: JSON.stringify(trip),
    signal,
  });
  const forecasts = await fetchForecasts(plan, signal);
  return requestJson<AnalyzeResponse>('/api/routes/analyze', {
    method: 'POST',
    body: JSON.stringify({ ...trip, forecasts: forecasts ?? { points: [] } }),
    signal,
  });
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  if (query.trim().length < 2) return [];
  if (isSampleMode) {
    const { mockSearchLocations } = await import('../data/mock/mockRouting');
    return mockSearchLocations(query, signal);
  }
  return requestJson<LocationSuggestion[]>(`/api/locations/search?q=${encodeURIComponent(query.trim())}`, {
    method: 'GET',
    signal,
  });
}
