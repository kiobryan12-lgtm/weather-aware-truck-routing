import type { ReactNode } from 'react';
import { AlertOctagon, ArrowRight, Clock, Route as RouteIcon, ShieldAlert, ShieldCheck, TriangleAlert, Truck } from 'lucide-react';
import type { RouteResult } from '../../types/routing';
import { formatDuration, formatMiles } from '../../lib/format';
import { RISK_COLORS } from '../../styles/tokens';
import { RiskBadge } from './RiskBadge';

interface RouteCardProps {
  route: RouteResult;
  color: string;
  selected: boolean;
  recommended: boolean;
  onSelect: (routeId: string) => void;
  onViewDetails: (routeId: string) => void;
}

function Metric({ icon, label, value, valueClass }: { icon: ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 [&_svg]:size-[18px]" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-label text-ink-muted">{label}</dt>
        <dd className={`text-value whitespace-nowrap tabular-nums ${valueClass ?? 'text-ink'}`}>{value}</dd>
      </div>
    </div>
  );
}

function RiskGauge({ score, color }: { score: number | null; color: string }) {
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  const fraction = score === null ? 0 : Math.min(score / 4, 1);
  return (
    <div className="relative size-[76px] shrink-0" role="img" aria-label={`Average risk ${score === null ? 'unknown' : score.toFixed(1)} on a 0 to 4 scale`}>
      <svg viewBox="0 0 76 76" className="size-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="6" />
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(fraction * circumference, 0.01)} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="text-metric text-ink tabular-nums">{score === null ? '—' : score.toFixed(1)}</span>
        <span className="-mt-0.5 text-meta text-ink-muted">Avg Risk</span>
      </span>
    </div>
  );
}

export function RouteCard({ route, color, selected, recommended, onSelect, onViewDetails }: RouteCardProps) {
  const milesByLevel = route.risk_summary.miles_by_level;
  const outlineShadow = selected
    ? `inset 0 0 0 2px ${color}`
    : recommended
      ? `inset 0 0 0 1.5px ${RISK_COLORS.low}`
      : 'inset 0 0 0 1px var(--color-line)';

  return (
    <article
      onClick={() => onSelect(route.id)}
      className="flex min-h-40 cursor-pointer flex-col rounded-card bg-surface p-4 transition-shadow duration-150 ease-out"
      style={{ boxShadow: `${outlineShadow}, var(${selected ? '--shadow-hover' : '--shadow-card'})` }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(route.id);
          }}
          className="flex min-w-0 items-center gap-2 rounded-badge text-left"
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color}1A`, color }}
            aria-hidden
          >
            <RouteIcon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-card" style={{ color }}>
              Route {route.label} - {route.name}
            </span>
            <span className="block truncate text-label font-normal text-ink-muted">via {route.via}</span>
          </span>
        </button>
        {recommended ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-badge bg-risk-low px-2 text-meta font-semibold text-white">
            Recommended
            <ShieldCheck className="size-3.5" aria-hidden />
          </span>
        ) : !route.eligible ? (
          <RiskBadge level={milesByLevel.no_travel > 0 ? 'no_travel' : 'unknown'} variant="solid" srPrefix="Not eligible:" className="h-6 rounded-badge" />
        ) : (
          <span className="inline-flex h-6 shrink-0 items-center rounded-badge border border-primary-border bg-primary-light px-2 text-meta font-semibold text-primary">
            Alternative
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3">
          <Metric icon={<Truck className="text-ink-secondary" />} label="Distance" value={formatMiles(route.distance_mi).replace(' mi', ' miles')} />
          <Metric icon={<Clock className="text-ink-secondary" />} label="Travel Time" value={formatDuration(route.duration_min)} />
          <Metric
            icon={<ShieldAlert className="text-risk-severe" />}
            label="Severe Miles"
            value={formatMiles(milesByLevel.severe)}
            valueClass={milesByLevel.severe > 0 ? 'text-risk-severe-fg' : undefined}
          />
          <Metric
            icon={<TriangleAlert className="text-risk-high" />}
            label="High Miles"
            value={formatMiles(milesByLevel.high)}
            valueClass={milesByLevel.high > 0 ? 'text-risk-high-fg' : undefined}
          />
        </dl>
        <RiskGauge score={route.risk_summary.average_risk} color={color} />
      </div>

      {milesByLevel.no_travel > 0 && (
        <p className="mt-3 flex items-center gap-1.5 rounded-control bg-risk-severe-bg px-2.5 py-1.5 text-label font-semibold text-risk-severe-fg">
          <AlertOctagon className="size-3.5 shrink-0" aria-hidden />
          {formatMiles(milesByLevel.no_travel)} of No Travel conditions
        </p>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onViewDetails(route.id);
        }}
        className="mt-auto inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-control border border-line bg-surface-muted text-label font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary-light"
        style={{ marginTop: milesByLevel.no_travel > 0 ? 12 : 16 }}
      >
        View Details
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </article>
  );
}
