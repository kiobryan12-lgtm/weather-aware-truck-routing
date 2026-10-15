import { AlertOctagon, CloudSun, ShieldCheck } from 'lucide-react';
import type { RiskLevel, RouteResult } from '../../types/routing';
import { formatDuration, formatMiles, formatWeekdayTime } from '../../lib/format';
import { RISK_LABELS, RISK_SEVERITY } from '../../lib/risk';
import { describeRouteWeather } from '../../lib/weatherText';
import { RISK_COLORS } from '../../styles/tokens';
import { cn } from '../../lib/cn';
import { RiskBadge } from './RiskBadge';

interface RouteCardProps {
  route: RouteResult;
  selected: boolean;
  recommended: boolean;
  reason: string | null;
  onSelect: (routeId: string) => void;
}

const BAR_LEVELS: RiskLevel[] = ['low', 'moderate', 'high', 'severe', 'no_travel', 'unknown'];

function worstRisk(route: RouteResult): RiskLevel {
  return route.checkpoints.reduce<RiskLevel>(
    (worst, checkpoint) => (RISK_SEVERITY[checkpoint.risk] > RISK_SEVERITY[worst] ? checkpoint.risk : worst),
    'unknown',
  );
}

function RiskBar({ route }: { route: RouteResult }) {
  const miles = route.risk_summary.miles_by_level;
  const levels = BAR_LEVELS.filter((level) => miles[level] > 0);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-hover" aria-hidden>
        {levels.map((level) => (
          <span key={level} style={{ width: `${(miles[level] / route.distance_mi) * 100}%`, backgroundColor: RISK_COLORS[level] }} />
        ))}
      </div>
      <p className="mt-1 text-meta text-ink-muted tabular-nums">
        {levels.map((level) => `${RISK_LABELS[level]} ${formatMiles(miles[level])}`).join(' · ')}
      </p>
    </div>
  );
}

export function RouteCard({ route, selected, recommended, reason, onSelect }: RouteCardProps) {
  const miles = route.risk_summary.miles_by_level;
  const arrival = route.checkpoints.at(-1)?.eta;
  const average = route.risk_summary.average_risk;

  return (
    <button
      type="button"
      onClick={() => onSelect(route.id)}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col gap-2.5 rounded-card border bg-surface p-3.5 text-left transition-[border-color,box-shadow] duration-150 ease-out',
        selected ? 'border-ink shadow-hover ring-1 ring-ink' : 'border-line shadow-card hover:border-line-strong',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-card text-ink">
            <span className="text-label font-semibold text-ink-muted tabular-nums">#{route.rank ?? '–'}</span>
            Route {route.label} · {route.name}
          </p>
          <p className="truncate text-label text-ink-muted">via {route.via}</p>
        </div>
        {recommended ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-badge bg-risk-low px-2 text-meta font-semibold text-white">
            <ShieldCheck className="size-3.5" aria-hidden />
            Recommended
          </span>
        ) : !route.eligible ? (
          <RiskBadge level={miles.no_travel > 0 ? 'no_travel' : 'unknown'} variant="solid" srPrefix="Not eligible:" className="h-6 rounded-badge" />
        ) : null}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-ink tabular-nums">
        <div>
          <dt className="text-meta text-ink-muted">Distance</dt>
          <dd className="text-card">{formatMiles(route.distance_mi)}</dd>
        </div>
        <div>
          <dt className="text-meta text-ink-muted">Drive time</dt>
          <dd className="text-card">{formatDuration(route.duration_min)}</dd>
        </div>
        <div>
          <dt className="text-meta text-ink-muted">Avg risk</dt>
          <dd className="text-card">{average === null ? '–' : `${average.toFixed(1)} / 4`}</dd>
        </div>
      </dl>

      <RiskBar route={route} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-secondary">
        <span className="flex items-center gap-1.5">
          Worst <RiskBadge level={worstRisk(route)} srPrefix="Worst risk:" />
        </span>
        {arrival && <span className="tabular-nums">Arrives {formatWeekdayTime(new Date(arrival))}</span>}
      </div>

      <p className="flex items-center gap-1.5 text-label text-ink-secondary">
        <CloudSun className="size-4 shrink-0 text-ink-muted" aria-hidden />
        <span className="truncate">{describeRouteWeather(route.checkpoints)}</span>
      </p>

      {miles.no_travel > 0 && (
        <p className="flex items-center gap-1.5 rounded-control bg-risk-severe-bg px-2.5 py-1.5 text-label font-semibold text-risk-severe-fg">
          <AlertOctagon className="size-3.5 shrink-0" aria-hidden />
          {formatMiles(miles.no_travel)} of No Travel conditions
        </p>
      )}
      {recommended && reason && <p className="border-t border-line pt-2 text-label text-risk-low-fg">{reason}</p>}
    </button>
  );
}
