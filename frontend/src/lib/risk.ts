import type { RiskLevel } from '../types/routing';

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
  no_travel: 'No Travel',
  unknown: 'Unknown',
};

export const RISK_SEVERITY: Record<RiskLevel, number> = {
  unknown: -1,
  low: 0,
  moderate: 1,
  high: 2,
  severe: 3,
  no_travel: 4,
};

export const RISK_TINT_CLASSES: Record<RiskLevel, string> = {
  low: 'bg-risk-low-bg text-risk-low-fg',
  moderate: 'bg-risk-moderate-bg text-risk-moderate-fg',
  high: 'bg-risk-high-bg text-risk-high-fg',
  severe: 'bg-risk-severe-bg text-risk-severe-fg',
  no_travel: 'bg-risk-no-travel-bg text-risk-no-travel-fg',
  unknown: 'bg-risk-unknown-bg text-risk-unknown-fg',
};

export const RISK_TEXT_CLASSES: Record<RiskLevel, string> = {
  low: 'text-risk-low-fg',
  moderate: 'text-risk-moderate-fg',
  high: 'text-risk-high-fg',
  severe: 'text-risk-severe-fg',
  no_travel: 'text-risk-no-travel',
  unknown: 'text-risk-unknown-fg',
};
