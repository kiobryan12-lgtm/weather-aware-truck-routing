import type { AnalyzeResponse, LocationSuggestion, TripRequest } from '../types/routing';
import { ApiError } from './apiError';

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

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError("Can't reach the routing service. Check your connection and try again.");
  }
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);
  return (await response.json()) as T;
}

export async function analyzeRoutes(trip: TripRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  if (isSampleMode) {
    const { mockAnalyzeRoutes } = await import('../data/mock/mockRouting');
    return mockAnalyzeRoutes(trip, signal);
  }
  return requestJson<AnalyzeResponse>('/api/routes/analyze', {
    method: 'POST',
    body: JSON.stringify(trip),
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
