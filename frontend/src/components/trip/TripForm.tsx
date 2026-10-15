import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { CalendarDays, MapPin, Pencil, Search, Truck } from 'lucide-react';
import type { CheckpointIntervalMiles, TripRequest } from '../../types/routing';
import { formatWeekdayTime, localTimeZoneLabel, toDateTimeLocalValue } from '../../lib/format';
import { Button } from '../common/Button';
import { Field, TextInput, fieldDescribedBy } from '../common/Input';
import { LocationInput } from './LocationInput';
import { CheckpointInterval } from './CheckpointInterval';

interface FormValues {
  origin: string;
  destination: string;
  departure: string;
  loadWeight: string;
  interval: CheckpointIntervalMiles;
}

type FieldName = Exclude<keyof FormValues, 'interval'>;
type FormErrors = Partial<Record<FieldName, string>>;

const MAX_LOAD_LB = 200_000;
// Allow a little slack so a departure of "now" doesn't go stale while the form is open.
const PAST_GRACE_MS = 60 * 60 * 1000;

function defaultDeparture(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.origin.trim()) errors.origin = 'Enter an origin.';
  if (!values.destination.trim()) errors.destination = 'Enter a destination.';
  else if (values.destination.trim().toLowerCase() === values.origin.trim().toLowerCase()) {
    errors.destination = 'Destination must differ from the origin.';
  }

  const departure = new Date(values.departure);
  if (!values.departure || Number.isNaN(departure.getTime())) errors.departure = 'Choose a departure date and time.';
  else if (departure.getTime() < Date.now() - PAST_GRACE_MS) errors.departure = 'Departure can’t be in the past.';

  const load = Number(values.loadWeight);
  if (values.loadWeight === '') errors.loadWeight = 'Enter the load weight.';
  else if (load > MAX_LOAD_LB) errors.loadWeight = `Enter a weight up to ${MAX_LOAD_LB.toLocaleString('en-US')} lb.`;
  return errors;
}

function toRequest(values: FormValues): TripRequest {
  return {
    origin: values.origin.trim(),
    destination: values.destination.trim(),
    departure_time: new Date(values.departure).toISOString(),
    load_weight_lb: Number(values.loadWeight),
    checkpoint_interval_miles: values.interval,
  };
}

function FieldRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
      <span className="pt-[36px] text-ink-muted md:pt-[35px] [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      {children}
    </div>
  );
}

interface TripFormProps {
  loading: boolean;
  onSubmit: (request: TripRequest) => void;
  submitOnMount?: boolean;
  // Shows a one-line summary instead of the fields, to leave room for the results.
  collapsed?: boolean;
  onExpand?: () => void;
}

function tripSummary(values: FormValues): string {
  const departure = new Date(values.departure);
  const when = Number.isNaN(departure.getTime()) ? '' : formatWeekdayTime(departure);
  const load = values.loadWeight ? `${Number(values.loadWeight).toLocaleString('en-US')} lb` : '';
  return [when, load, `every ${values.interval} mi`].filter(Boolean).join(' · ');
}

export function TripForm({ loading, onSubmit, submitOnMount = false, collapsed = false, onExpand }: TripFormProps) {
  const [values, setValues] = useState<FormValues>(() => ({
    origin: 'Denver, CO, USA',
    destination: 'Kansas City, MO, USA',
    departure: defaultDeparture(),
    loadWeight: '35000',
    interval: 25,
  }));
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const errors = useMemo(() => validate(values), [values]);
  const isValid = Object.keys(errors).length === 0;
  const timeZone = useMemo(localTimeZoneLabel, []);

  // StrictMode runs effects twice in dev; only submit once.
  const mountSubmitRef = useRef({ submitOnMount, values, onSubmit, submitted: false });
  useEffect(() => {
    const mount = mountSubmitRef.current;
    if (mount.submitted || !mount.submitOnMount || Object.keys(validate(mount.values)).length > 0) return;
    mount.submitted = true;
    mount.onSubmit(toRequest(mount.values));
  }, []);

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const markTouched = (key: FieldName) => setTouched((current) => ({ ...current, [key]: true }));
  const visibleError = (key: FieldName) => (touched[key] ? errors[key] : undefined);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      setTouched({ origin: true, destination: true, departure: true, loadWeight: true });
      return;
    }
    if (!loading) onSubmit(toRequest(values));
  };

  return (
    <section aria-labelledby="trip-form-heading" className="h-full rounded-card border border-line bg-surface p-4 shadow-card">
      {collapsed && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="trip-form-heading" className="truncate text-card text-ink">
              {values.origin} → {values.destination}
            </h2>
            <p className="truncate text-label text-ink-muted tabular-nums">{tripSummary(values)}</p>
          </div>
          <button
            type="button"
            onClick={onExpand}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-badge px-2 text-label font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary-light"
          >
            <Pencil className="size-3.5" aria-hidden />
            Edit trip
          </button>
        </div>
      )}
      {!collapsed && (
        <h2 id="trip-form-heading" className="text-section text-ink">
          Plan Your Route
        </h2>
      )}

      <form noValidate onSubmit={handleSubmit} hidden={collapsed} className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-1">
        <FieldRow icon={<MapPin />}>
          <LocationInput
            id="trip-origin"
            label="Origin"
            placeholder="e.g. Denver, CO"
            value={values.origin}
            error={visibleError('origin')}
            onChange={(origin) => setField('origin', origin)}
            onBlur={() => markTouched('origin')}
          />
        </FieldRow>
        <FieldRow icon={<MapPin />}>
          <LocationInput
            id="trip-destination"
            label="Destination"
            placeholder="e.g. Kansas City, MO"
            value={values.destination}
            error={visibleError('destination')}
            onChange={(destination) => setField('destination', destination)}
            onBlur={() => markTouched('destination')}
          />
        </FieldRow>

        <FieldRow icon={<CalendarDays />}>
          <Field id="trip-departure" label="Departure Date & Time" error={visibleError('departure')} hint={`Local time · ${timeZone}`}>
            <TextInput
              id="trip-departure"
              type="datetime-local"
              value={values.departure}
              invalid={Boolean(visibleError('departure'))}
              aria-describedby={fieldDescribedBy('trip-departure', visibleError('departure'), true)}
              onChange={(event) => setField('departure', event.target.value)}
              onBlur={() => markTouched('departure')}
              className="tabular-nums"
            />
          </Field>
        </FieldRow>

        <FieldRow icon={<Truck />}>
          <Field id="trip-load" label="Load Weight (lbs)" error={visibleError('loadWeight')}>
            <TextInput
              id="trip-load"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 35000"
              value={values.loadWeight}
              invalid={Boolean(visibleError('loadWeight'))}
              aria-describedby={fieldDescribedBy('trip-load', visibleError('loadWeight'))}
              onChange={(event) => setField('loadWeight', event.target.value.replace(/\D/g, '').slice(0, 6))}
              onBlur={() => markTouched('loadWeight')}
              className="tabular-nums"
            />
          </Field>
        </FieldRow>

        <FieldRow icon={<MapPin />}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="trip-interval-label" className="text-label text-ink-secondary">
              Checkpoint Interval
            </span>
            <CheckpointInterval labelId="trip-interval-label" value={values.interval} onChange={(interval) => setField('interval', interval)} />
          </div>
        </FieldRow>

        <Button
          type="submit"
          loading={loading}
          disabled={!isValid}
          icon={<Search />}
          className="w-full md:self-end lg:mt-1 lg:self-auto"
        >
          {loading ? 'Finding routes…' : 'Find Routes'}
        </Button>
      </form>
    </section>
  );
}
