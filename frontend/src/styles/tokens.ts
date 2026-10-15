import type { RiskLevel } from '../types/routing';

/** Literal colors for MapLibre, which can't read CSS variables. Mirrors globals.css. */

const ROUTE_COLORS = ['#2563EB', '#16A34A', '#DC2626'] as const;

export function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

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
  origin: '#16A34A',
  destination: '#DC2626',
} as const;
