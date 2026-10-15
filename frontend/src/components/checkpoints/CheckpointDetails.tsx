import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CloudRain, ExternalLink, HelpCircle, Snowflake, Wind } from 'lucide-react';
import type { Checkpoint, LngLat, RiskLevel } from '../../types/routing';
import { formatCoordinates, formatDateTime, formatDuration, formatMiles, formatRate, formatWind } from '../../lib/format';
import { RISK_LABELS, RISK_TEXT_CLASSES, RISK_TINT_CLASSES } from '../../lib/risk';
import { cn } from '../../lib/cn';
import { RiskBadge } from '../routes/RiskBadge';

function nwsForecastUrl([lng, lat]: LngLat): string {
  return `https://forecast.weather.gov/MapClick.php?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;
}

interface CheckpointDetailsProps {
  checkpoint: Checkpoint | null;
  departureTime: string;
}

function WeatherTile({ icon, label, value, level }: { icon: ReactNode; label: string; value: string; level: RiskLevel }) {
  const [quantity, unit] = value.split(' ');
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-control border border-line px-2 py-3 text-center">
      <span className="text-primary [&_svg]:size-6">{icon}</span>
      <span className="mt-1 text-label text-ink-muted">{label}</span>
      <span className="text-value whitespace-nowrap text-ink tabular-nums">
        {quantity}
        {unit && <span className="ml-0.5 text-label font-medium text-ink-secondary">{unit}</span>}
      </span>
      <span className={cn('text-label font-semibold', RISK_TEXT_CLASSES[level])}>{RISK_LABELS[level]}</span>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-1.5">
      <dt className="text-ink-muted">{label}:</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

export function CheckpointDetails({ checkpoint, departureTime }: CheckpointDetailsProps) {
  if (!checkpoint) {
    return (
      <section className="flex min-h-40 items-center justify-center rounded-card border border-line bg-surface p-4 text-center text-body text-ink-muted shadow-card">
        Select a checkpoint in the table or on the map to see its weather details.
      </section>
    );
  }

  const { weather, condition_risk: levels, risk } = checkpoint;
  const minutesFromDeparture = (new Date(checkpoint.eta).getTime() - new Date(departureTime).getTime()) / 60000;
  const ExplanationIcon = risk === 'low' ? CheckCircle2 : risk === 'unknown' ? HelpCircle : AlertTriangle;

  return (
    <section aria-labelledby="checkpoint-details-heading" aria-live="polite" className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="checkpoint-details-heading" className="text-section text-ink">
          Checkpoint {checkpoint.index + 1} Details
        </h2>
        <RiskBadge level={risk} variant="solid" withSuffix />
      </div>

      <dl className="mt-3 flex flex-col gap-1 text-body tabular-nums">
        <DetailRow label="Distance from start">{formatMiles(checkpoint.distance_mi).replace(' mi', ' miles')}</DetailRow>
        <DetailRow label="Estimated arrival">
          {formatDateTime(checkpoint.eta)} <span className="text-ink-muted">(in {formatDuration(minutesFromDeparture)})</span>
        </DetailRow>
        <DetailRow label="Location">
          {formatCoordinates(checkpoint.location)}
          {checkpoint.place_name && ` (${checkpoint.place_name})`}
        </DetailRow>
      </dl>
      <a
        href={nwsForecastUrl(checkpoint.location)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-label font-semibold text-primary underline-offset-2 hover:underline"
      >
        Compare with weather.gov forecast
        <ExternalLink className="size-3.5" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <WeatherTile icon={<Wind aria-hidden />} label="Wind" value={formatWind(weather.wind_mph)} level={levels.wind} />
        <WeatherTile icon={<CloudRain aria-hidden />} label="Rain" value={formatRate(weather.rain_in_hr)} level={levels.rain} />
        <WeatherTile icon={<Snowflake aria-hidden />} label="Snow" value={formatRate(weather.snow_in_hr)} level={levels.snow} />
      </div>

      <div className={cn('mt-4 rounded-control px-3 py-2.5', RISK_TINT_CLASSES[risk])}>
        <p className="flex items-center gap-1.5 text-body font-semibold">
          <ExplanationIcon className="size-4 shrink-0" aria-hidden />
          {risk === 'unknown' ? 'Forecast unavailable' : `Why this is ${RISK_LABELS[risk]}${risk === 'no_travel' ? '' : ' Risk'}?`}
        </p>
        <ul className="mt-1 flex flex-col gap-0.5 pl-5 text-label font-normal [&>li]:list-disc">
          {checkpoint.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
