import type { LngLat } from '../types/routing';

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const weekdayTimeFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString('en-US')} mi`;
}

export function formatDuration(minutes: number): string {
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatDateTime(iso: string | Date): string {
  return dateTimeFormat.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function formatWeekdayTime(date: Date): string {
  return weekdayTimeFormat.format(date);
}

export function formatWeight(lb: number): string {
  return `${lb.toLocaleString('en-US')} lb`;
}

export function formatWind(mph: number | null): string {
  if (mph === null) return '—';
  return `${Number.isInteger(mph) ? mph : mph.toFixed(1)} mph`;
}

export function formatRate(inPerHour: number | null): string {
  if (inPerHour === null) return '—';
  return `${inPerHour.toFixed(2)} in/hr`;
}

export function formatCoordinates([lng, lat]: LngLat): string {
  const latHemisphere = lat >= 0 ? 'N' : 'S';
  const lngHemisphere = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latHemisphere}, ${Math.abs(lng).toFixed(2)}°${lngHemisphere}`;
}

/** e.g. "America/Denver (MDT)". */
export function localTimeZoneLabel(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const abbreviation = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value;
  return abbreviation ? `${timeZone} (${abbreviation})` : timeZone;
}

export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
