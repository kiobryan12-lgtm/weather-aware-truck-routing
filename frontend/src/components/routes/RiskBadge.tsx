import type { RiskLevel } from '../../types/routing';
import { RISK_LABELS, RISK_TINT_CLASSES } from '../../lib/risk';
import { cn } from '../../lib/cn';

/** Moderate keeps dark text for contrast on yellow. */
const SOLID_CLASSES: Record<RiskLevel, string> = {
  low: 'bg-risk-low text-white',
  moderate: 'bg-risk-moderate text-ink',
  high: 'bg-risk-high text-white',
  severe: 'bg-risk-severe text-white',
  no_travel: 'bg-risk-no-travel text-white',
  unknown: 'bg-risk-unknown text-white',
};

interface RiskBadgeProps {
  level: RiskLevel;
  variant?: 'tint' | 'solid';
  /** Renders e.g. "High Risk". */
  withSuffix?: boolean;
  srPrefix?: string;
  className?: string;
}

export function RiskBadge({ level, variant = 'tint', withSuffix = false, srPrefix = 'Risk level:', className }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-meta font-semibold whitespace-nowrap',
        variant === 'solid' ? SOLID_CLASSES[level] : RISK_TINT_CLASSES[level],
        className,
      )}
    >
      <span className="sr-only">{srPrefix} </span>
      {RISK_LABELS[level]}
      {withSuffix && level !== 'unknown' && level !== 'no_travel' ? ' Risk' : ''}
    </span>
  );
}
