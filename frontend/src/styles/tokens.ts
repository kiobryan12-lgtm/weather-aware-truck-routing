import type { RiskLevel } from '../types/routing';

// MapLibre can't read CSS variables, so the map colors are duplicated here. Keep in sync with globals.css.

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#16A34A',
  moderate: '#EAB308',
  high: '#F97316',
  severe: '#DC2626',
  no_travel: '#7F1D1D',
  unknown: '#64748B',
};

export const MAP_COLORS = {
  casing: '#FFFFFF',
  selectedStroke: '#0F172A',
  alternative: '#94A3B8',
  alternativeHover: '#64748B',
  origin: '#2563EB',
  destination: '#0F172A',
} as const;
