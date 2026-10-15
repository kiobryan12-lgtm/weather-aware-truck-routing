import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalyzeResponse, TripRequest } from '../types/routing';
import { analyzeRoutes } from '../services/routingApi';
import { toUserMessage } from '../services/apiError';

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

interface AnalysisState {
  status: AnalysisStatus;
  /** Kept while a new request loads so the map doesn't blank out. */
  data: AnalyzeResponse | null;
  error: string | null;
}

export function useRouteAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle', data: null, error: null });
  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<TripRequest | null>(null);

  const analyze = useCallback(async (request: TripRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    lastRequestRef.current = request;
    setState((current) => ({ status: 'loading', data: current.data, error: null }));

    try {
      const data = await analyzeRoutes(request, controller.signal);
      if (!controller.signal.aborted) setState({ status: 'success', data, error: null });
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: 'error', data: null, error: toUserMessage(error) });
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRequestRef.current) void analyze(lastRequestRef.current);
  }, [analyze]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { ...state, analyze, retry };
}
