import type {
  AnalyzeResponse,
  Checkpoint,
  LngLat,
  LocationSuggestion,
  Recommendation,
  RiskSegment,
  RouteResult,
  TripRequest,
  WeatherGrid,
  WeatherVariable,
} from '../../types/routing';
import { ApiError } from '../../services/apiError';
import { boundsOf, cumulativeMiles, haversineMiles, pointAtDistance, sliceLine } from '../../lib/geo';
import type { Bounds } from '../../lib/geo';
import { formatDuration, formatMiles } from '../../lib/format';
import { findSamplePlace, placeLabel, SAMPLE_PLACES, searchSamplePlaces } from './places';
import type { SamplePlace } from './places';
import { genericCorridors, presetCorridors } from './corridors';
import type { CorridorSpec, NamedWaypoint } from './corridors';
import { densify } from './geometry';
import { createWeatherField } from './weatherField';
import type { WeatherField } from './weatherField';
import { evaluateCheckpoint, summarizeRisk } from './riskRules';

/** Simulated POST /api/routes/analyze for UI development. Not a real forecast. */

const HOUR_MS = 3_600_000;
const FORECAST_HOURS = 48;
const FORECAST_HORIZON_DAYS = 14;
const GRID_SPACING_DEG = 0.3;
const GRID_PADDING_DEG = 2.2;
const PLACE_NAME_RADIUS_MILES = 30;

type RouteDraft = Omit<RouteResult, 'eligible' | 'rank' | 'ineligible_reason'>;

interface RouteBuildContext {
  request: TripRequest;
  departure: Date;
  forecastStart: Date;
  forecastAvailable: boolean;
  weatherAt: WeatherField;
}

function simulateLatency(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

const roundTenth = (value: number) => Math.round(value * 10) / 10;

function nearestPlaceName(point: LngLat, waypoints: NamedWaypoint[]): string | null {
  const candidates: NamedWaypoint[] = [
    ...waypoints.filter((waypoint) => waypoint.name),
    ...SAMPLE_PLACES.map((place) => ({ name: placeLabel(place), location: place.location })),
  ];
  let nearest: NamedWaypoint | null = null;
  let nearestDistance = PLACE_NAME_RADIUS_MILES;
  for (const candidate of candidates) {
    const distance = haversineMiles(point, candidate.location);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest ? `near ${nearest.name}` : null;
}

function checkpointMileposts(totalMiles: number, intervalMiles: number): number[] {
  const mileposts: number[] = [];
  for (let miles = 0; miles < totalMiles; miles += intervalMiles) mileposts.push(miles);
  if (totalMiles - mileposts[mileposts.length - 1] < 1 && mileposts.length > 1) mileposts[mileposts.length - 1] = totalMiles;
  else mileposts.push(totalMiles);
  return mileposts;
}

function buildRoute(corridor: CorridorSpec, geometry: LngLat[], context: RouteBuildContext): RouteDraft {
  const routeId = `route-${corridor.label}`;
  const cumulative = cumulativeMiles(geometry);
  const totalMiles = cumulative[cumulative.length - 1];
  const mileposts = checkpointMileposts(totalMiles, context.request.checkpoint_interval_miles);

  const checkpoints: Checkpoint[] = mileposts.map((miles, index) => {
    const location = pointAtDistance(geometry, cumulative, miles);
    const eta = new Date(context.departure.getTime() + (miles / corridor.averageSpeedMph) * HOUR_MS);
    const forecastHour = (eta.getTime() - context.forecastStart.getTime()) / HOUR_MS;
    const checkpointBase = {
      id: `${routeId}-checkpoint-${index}`,
      index,
      distance_mi: roundTenth(miles),
      eta: eta.toISOString(),
      location,
      place_name: nearestPlaceName(location, corridor.waypoints),
    };

    if (!context.forecastAvailable || forecastHour > FORECAST_HOURS) {
      return {
        ...checkpointBase,
        weather: { wind_mph: null, rain_in_hr: null, snow_in_hr: null },
        condition_risk: { wind: 'unknown', rain: 'unknown', snow: 'unknown' },
        load_adjusted: false,
        risk: 'unknown',
        reasons: ['No forecast is available for this arrival time.'],
      };
    }

    const { wind_mph, rain_in_hr, snow_in_hr } = context.weatherAt(location[0], location[1], forecastHour);
    const weather = { wind_mph, rain_in_hr, snow_in_hr };
    return { ...checkpointBase, weather, ...evaluateCheckpoint(weather, context.request.load_weight_lb) };
  });

  // Each checkpoint covers the road halfway to its neighbours.
  const segments: RiskSegment[] = checkpoints.map((checkpoint, index) => {
    const fromMiles = index === 0 ? 0 : (mileposts[index - 1] + mileposts[index]) / 2;
    const toMiles = index === checkpoints.length - 1 ? totalMiles : (mileposts[index] + mileposts[index + 1]) / 2;
    return {
      checkpoint_id: checkpoint.id,
      from_mi: roundTenth(fromMiles),
      to_mi: roundTenth(toMiles),
      risk: checkpoint.risk,
      coordinates: sliceLine(geometry, cumulative, fromMiles, toMiles),
    };
  });

  const risk_summary = summarizeRisk(segments);
  const unknownMiles = risk_summary.miles_by_level.unknown;
  const warnings = unknownMiles > 0 ? [`${formatMiles(unknownMiles)} have no forecast coverage at the estimated arrival time.`] : [];

  return {
    id: routeId,
    label: corridor.label,
    name: corridor.name,
    via: corridor.via,
    distance_mi: roundTenth(totalMiles),
    duration_min: Math.round((totalMiles / corridor.averageSpeedMph) * 60),
    geometry,
    checkpoints,
    segments,
    risk_summary,
    warnings,
  };
}

/** Applied in order; a later criterion only breaks ties on the earlier ones. */
const RANKING_CRITERIA: { tolerance: number; valueOf: (route: RouteDraft) => number }[] = [
  { tolerance: 0.05, valueOf: (route) => route.risk_summary.miles_by_level.severe },
  { tolerance: 0.05, valueOf: (route) => route.risk_summary.miles_by_level.high },
  { tolerance: 0.005, valueOf: (route) => route.risk_summary.average_risk ?? Infinity },
  { tolerance: 0.5, valueOf: (route) => route.duration_min },
];

function decidingCriterionIndex(first: RouteDraft, second: RouteDraft): number {
  return RANKING_CRITERIA.findIndex(
    (criterion) => Math.abs(criterion.valueOf(first) - criterion.valueOf(second)) > criterion.tolerance,
  );
}

function compareRoutes(first: RouteDraft, second: RouteDraft): number {
  const index = decidingCriterionIndex(first, second);
  return index === -1 ? 0 : RANKING_CRITERIA[index].valueOf(first) - RANKING_CRITERIA[index].valueOf(second);
}

function recommendationReason(best: RouteDraft, runnerUp: RouteDraft): string {
  const routeName = (route: RouteDraft) => `Route ${route.label}`;
  const severeMiles = (route: RouteDraft) => formatMiles(route.risk_summary.miles_by_level.severe);
  const highMiles = (route: RouteDraft) => formatMiles(route.risk_summary.miles_by_level.high);
  const averageRisk = (route: RouteDraft) => route.risk_summary.average_risk?.toFixed(2);

  switch (decidingCriterionIndex(best, runnerUp)) {
    case 0:
      return `${routeName(best)} has the fewest Severe miles (${severeMiles(best)} vs. ${severeMiles(runnerUp)} on ${routeName(runnerUp)}).`;
    case 1:
      return `${routeName(best)} ties on Severe miles and has the fewest High miles (${highMiles(best)} vs. ${highMiles(runnerUp)} on ${routeName(runnerUp)}).`;
    case 2:
      return `${routeName(best)} ties on Severe and High miles and has the lowest average risk (${averageRisk(best)} vs. ${averageRisk(runnerUp)}).`;
    case 3:
      return `${routeName(best)} ties on risk and is the fastest (${formatDuration(best.duration_min)} vs. ${formatDuration(runnerUp.duration_min)}).`;
    default:
      return `Routes tie on every criterion; ${routeName(best)} is listed first.`;
  }
}

/** Routes with No Travel miles are excluded; the rest are ranked by RANKING_CRITERIA. */
function rankRoutes(drafts: RouteDraft[]): { routes: RouteResult[]; recommendation: Recommendation } {
  const isEligible = (route: RouteDraft) =>
    route.risk_summary.miles_by_level.no_travel === 0 && route.risk_summary.average_risk !== null;
  const ranked = drafts.filter(isEligible).sort(compareRoutes);

  const routes: RouteResult[] = drafts.map((route) => {
    const rankIndex = ranked.indexOf(route);
    const noTravelMiles = route.risk_summary.miles_by_level.no_travel;
    let ineligibleReason: string | null = null;
    if (rankIndex === -1) {
      ineligibleReason =
        noTravelMiles > 0
          ? `Crosses ${formatMiles(noTravelMiles)} of No Travel conditions.`
          : 'No forecast coverage at the estimated arrival times.';
    }
    return { ...route, eligible: rankIndex !== -1, rank: rankIndex === -1 ? null : rankIndex + 1, ineligible_reason: ineligibleReason };
  });

  const excluded = drafts.filter((route) => route.risk_summary.miles_by_level.no_travel > 0);
  if (ranked.length === 0) {
    return {
      routes,
      recommendation: {
        route_id: null,
        reason: excluded.length
          ? 'Every route crosses No Travel conditions at its estimated arrival times. Try a different departure time or a lighter load.'
          : 'Forecasts are unavailable for this departure time, so no route can be recommended.',
      },
    };
  }

  const [best, runnerUp] = ranked;
  if (!runnerUp) {
    return {
      routes,
      recommendation: { route_id: best.id, reason: `Route ${best.label} is the only route without No Travel conditions.` },
    };
  }

  const excludedNote = excluded.length
    ? ` ${excluded.map((route) => `Route ${route.label}`).join(' and ')} ${excluded.length === 1 ? 'is' : 'are'} excluded for No Travel conditions.`
    : '';
  return { routes, recommendation: { route_id: best.id, reason: recommendationReason(best, runnerUp) + excludedNote } };
}

function buildWeatherGrid(weatherAt: WeatherField, bounds: Bounds, forecastStart: Date): WeatherGrid {
  const [[west, south], [east, north]] = bounds;
  // Shrink latitude spacing so cells are square on a Mercator map.
  const latSpacing = GRID_SPACING_DEG * Math.cos((((south + north) / 2) * Math.PI) / 180);

  const points: LngLat[] = [];
  for (let lat = south - GRID_PADDING_DEG; lat <= north + GRID_PADDING_DEG; lat += latSpacing) {
    for (let lng = west - GRID_PADDING_DEG; lng <= east + GRID_PADDING_DEG; lng += GRID_SPACING_DEG) {
      points.push([Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]);
    }
  }

  const values: Record<WeatherVariable, number[][]> = { precipitation: [], wind: [], snow: [], clouds: [] };
  for (let hour = 0; hour <= FORECAST_HOURS; hour++) {
    const samples = points.map(([lng, lat]) => weatherAt(lng, lat, hour));
    values.precipitation.push(samples.map((sample) => sample.rain_in_hr));
    values.wind.push(samples.map((sample) => sample.wind_mph));
    values.snow.push(samples.map((sample) => sample.snow_in_hr));
    values.clouds.push(samples.map((sample) => sample.cloud_pct));
  }

  return {
    start_time: forecastStart.toISOString(),
    hour_count: FORECAST_HOURS + 1,
    spacing_deg: GRID_SPACING_DEG,
    points,
    values,
  };
}

function resolvePlace(query: string, role: 'origin' | 'destination'): SamplePlace {
  const place = findSamplePlace(query);
  if (!place) {
    throw new ApiError(
      `We couldn't find "${query.trim()}" as the ${role}. Sample mode supports a fixed list of cities — try Denver, CO or Kansas City, MO.`,
      400,
    );
  }
  return place;
}

export async function mockAnalyzeRoutes(request: TripRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  await simulateLatency(600 + Math.random() * 400, signal);

  const origin = resolvePlace(request.origin, 'origin');
  const destination = resolvePlace(request.destination, 'destination');
  if (origin === destination) throw new ApiError('Origin and destination must be different places.', 400);

  const departure = new Date(request.departure_time);
  const forecastStart = new Date(Math.floor(departure.getTime() / HOUR_MS) * HOUR_MS);
  const forecastAvailable = departure.getTime() - Date.now() <= FORECAST_HORIZON_DAYS * 24 * HOUR_MS;

  const corridors = presetCorridors(origin, destination) ?? genericCorridors(origin, destination);
  const tripSeed = `${placeLabel(origin)}→${placeLabel(destination)}`;
  const geometries = corridors.map((corridor) =>
    densify(corridor.waypoints.map((waypoint) => waypoint.location), `${tripSeed}:${corridor.label}`),
  );
  const bounds = boundsOf(geometries)!;
  const weatherAt = createWeatherField(bounds);

  const context: RouteBuildContext = { request, departure, forecastStart, forecastAvailable, weatherAt };
  const { routes, recommendation } = rankRoutes(
    corridors.map((corridor, index) => buildRoute(corridor, geometries[index], context)),
  );

  return {
    origin: { name: placeLabel(origin), location: origin.location },
    destination: { name: placeLabel(destination), location: destination.location },
    departure_time: departure.toISOString(),
    load_weight_lb: request.load_weight_lb,
    checkpoint_interval_miles: request.checkpoint_interval_miles,
    routes,
    recommendation,
    weather_grid: forecastAvailable ? buildWeatherGrid(weatherAt, bounds, forecastStart) : null,
    warnings: forecastAvailable
      ? []
      : [`Departure is more than ${FORECAST_HORIZON_DAYS} days away, beyond forecast coverage. Risk levels are Unknown.`],
    data_source: 'sample',
  };
}

export async function mockSearchLocations(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  await simulateLatency(120, signal);
  return searchSamplePlaces(query).map((place) => ({
    id: placeLabel(place),
    name: placeLabel(place),
    detail: 'United States · sample location',
    location: place.location,
  }));
}
