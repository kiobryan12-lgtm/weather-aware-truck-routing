import type { RiskLevel, RiskSummary } from '../../types/routing';
import { formatWeight } from '../../lib/format';
import { RISK_LABELS, RISK_SEVERITY } from '../../lib/risk';
import type { WeatherSample } from './weatherField';

/**
 * Sample-mode copy of the backend risk rules. A shared boundary belongs to the higher band,
 * except the No Travel edges for rain and snow, which the spec defines as strictly greater.
 */

type KnownRisk = Exclude<RiskLevel, 'unknown'>;
type Condition = 'wind' | 'rain' | 'snow';
type ConditionReadings = Pick<WeatherSample, 'wind_mph' | 'rain_in_hr' | 'snow_in_hr'>;

const higherRisk = (first: KnownRisk, second: KnownRisk): KnownRisk =>
  RISK_SEVERITY[first] >= RISK_SEVERITY[second] ? first : second;

function classifyWind(mph: number): KnownRisk {
  if (mph >= 55) return 'no_travel';
  if (mph >= 45) return 'severe';
  if (mph >= 35) return 'high';
  if (mph >= 25) return 'moderate';
  return 'low';
}

function classifyRain(inchesPerHour: number): KnownRisk {
  if (inchesPerHour > 1.0) return 'no_travel';
  if (inchesPerHour >= 0.5) return 'severe';
  if (inchesPerHour >= 0.25) return 'high';
  if (inchesPerHour >= 0.1) return 'moderate';
  return 'low';
}

function classifySnow(inchesPerHour: number): KnownRisk {
  if (inchesPerHour > 3.0) return 'no_travel';
  if (inchesPerHour >= 2.0) return 'severe';
  if (inchesPerHour >= 1.0) return 'high';
  if (inchesPerHour >= 0.5) return 'moderate';
  return 'low';
}

const BAND_RANGES: Record<Condition, Record<KnownRisk, string>> = {
  wind: {
    low: 'below 25 mph',
    moderate: '25–34 mph',
    high: '35–44 mph',
    severe: '45–54 mph',
    no_travel: '55 mph or more',
  },
  rain: {
    low: 'below 0.10 in/hr',
    moderate: '0.10–0.25 in/hr',
    high: '0.25–0.50 in/hr',
    severe: '0.50–1.00 in/hr',
    no_travel: 'above 1.00 in/hr',
  },
  snow: {
    low: 'below 0.5 in/hr',
    moderate: '0.5–1.0 in/hr',
    high: '1.0–2.0 in/hr',
    severe: '2.0–3.0 in/hr',
    no_travel: 'above 3.0 in/hr',
  },
};

interface CheckpointRisk {
  condition_risk: Record<Condition, KnownRisk>;
  load_adjusted: boolean;
  risk: KnownRisk;
  reasons: string[];
}

/** Load rules apply to wind only; wind >= 55 mph is already No Travel for any load. */
function loadRule(windMph: number, loadLb: number): { risk: KnownRisk; reason: string } | null {
  const load = formatWeight(loadLb);
  if (windMph >= 45 && windMph < 55 && loadLb > 30000) {
    return { risk: 'no_travel', reason: `Wind speed ${windMph} mph with a ${load} load (over 30,000 lb) is No Travel.` };
  }
  if (windMph >= 35 && windMph < 45 && loadLb > 40000) {
    return { risk: 'severe', reason: `Wind speed ${windMph} mph with a ${load} load (over 40,000 lb) raises risk to Severe.` };
  }
  return null;
}

export function evaluateCheckpoint(readings: ConditionReadings, loadLb: number): CheckpointRisk {
  const { wind_mph: wind, rain_in_hr: rain, snow_in_hr: snow } = readings;
  const condition_risk: Record<Condition, KnownRisk> = {
    wind: classifyWind(wind),
    rain: classifyRain(rain),
    snow: classifySnow(snow),
  };
  const weatherRisk = higherRisk(condition_risk.wind, higherRisk(condition_risk.rain, condition_risk.snow));
  const loadEscalation = loadRule(wind, loadLb);
  const load_adjusted = loadEscalation !== null && RISK_SEVERITY[loadEscalation.risk] > RISK_SEVERITY[weatherRisk];
  const risk = loadEscalation ? higherRisk(weatherRisk, loadEscalation.risk) : weatherRisk;

  if (risk === 'low') {
    return { condition_risk, load_adjusted, risk, reasons: ['Wind, rain, and snow are all within Low thresholds.'] };
  }

  const readingText: Record<Condition, string> = {
    wind: `Wind speed ${wind} mph`,
    rain: `Rain rate ${rain.toFixed(2)} in/hr`,
    snow: `Snowfall ${snow.toFixed(2)} in/hr`,
  };
  const reasons = (['wind', 'rain', 'snow'] as const)
    .filter((condition) => condition_risk[condition] === risk)
    .map((condition) => `${readingText[condition]} falls in ${RISK_LABELS[risk]} range (${BAND_RANGES[condition][risk]}).`);
  if (load_adjusted && loadEscalation) reasons.push(loadEscalation.reason);

  return { condition_risk, load_adjusted, risk, reasons };
}

export function summarizeRisk(segments: { from_mi: number; to_mi: number; risk: RiskLevel }[]): RiskSummary {
  const miles_by_level: Record<RiskLevel, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    severe: 0,
    no_travel: 0,
    unknown: 0,
  };
  let weightedScore = 0;
  let knownMiles = 0;
  for (const segment of segments) {
    const miles = segment.to_mi - segment.from_mi;
    miles_by_level[segment.risk] += miles;
    if (segment.risk !== 'unknown') {
      weightedScore += RISK_SEVERITY[segment.risk] * miles;
      knownMiles += miles;
    }
  }
  for (const level of Object.keys(miles_by_level) as RiskLevel[]) {
    miles_by_level[level] = Math.round(miles_by_level[level] * 10) / 10;
  }
  return {
    miles_by_level,
    average_risk: knownMiles > 0 ? Math.round((weightedScore / knownMiles) * 100) / 100 : null,
  };
}
