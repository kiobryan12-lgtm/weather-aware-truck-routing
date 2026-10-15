import hashlib
import json
import math
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from . import geocoding, routing, weather
from .geo import (
    LngLat,
    bounds,
    haversine_miles,
    interpolate_along,
    point_at_distance,
    sample_along,
    simplify,
    slice_line,
)
from .risk import UNKNOWN, UNKNOWN_RISK, evaluate_checkpoint, rank_routes, summarize_risk
from .validation import TripRequest, ValidationError

MAX_TRIP_MILES = 1500
HEATMAP_HOURS = 48
CORRIDOR_RADIUS_MILES = 75
GRID_PADDING_DEG = 1.25
GEOMETRY_TOLERANCE_DEG = 0.0008
ANALYSIS_CACHE_SECONDS = 10 * 60
ROUTE_NAMES_BY_COUNT = {
    1: ("Direct",),
    2: ("{first}", "{last}"),
    3: ("{first}", "Middle", "{last}"),
}


@dataclass(frozen=True)
class Providers:
    """External data sources, injectable for tests."""

    resolve_place: Callable[[str], geocoding.Place] = geocoding.resolve_place
    fetch_route_options: Callable[..., list[routing.RouteOption]] = routing.fetch_route_options
    fetch_hourly_forecasts: Callable[..., list[weather.HourlyForecast | None]] = weather.fetch_hourly_forecasts


@dataclass(frozen=True)
class PlannedCheckpoint:
    index: int
    miles: float
    location: LngLat
    eta: datetime


def iso(moment: datetime) -> str:
    return moment.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def rounded_point(point: LngLat) -> list[float]:
    return [round(point[0], 5), round(point[1], 5)]


def checkpoint_mileposts(total_miles: float, interval_miles: int) -> list[float]:
    """Every `interval_miles` from the origin, plus the destination."""
    mileposts = [float(miles) for miles in range(0, math.ceil(total_miles), interval_miles)]
    if len(mileposts) > 1 and total_miles - mileposts[-1] < 1:
        mileposts[-1] = total_miles
    else:
        mileposts.append(total_miles)
    return mileposts


def order_and_name(options: Sequence[routing.RouteOption], origin: LngLat, destination: LngLat) -> list[tuple[str, routing.RouteOption]]:
    """Orders routes north to south (or west to east for north–south trips) and names them by position."""
    lng_scale = math.cos(math.radians((origin[1] + destination[1]) / 2))
    east_west = abs((destination[0] - origin[0]) * lng_scale) >= abs(destination[1] - origin[1])

    def position(option: routing.RouteOption) -> float:
        coordinates = option.coordinates
        if east_west:
            return -sum(lat for _, lat in coordinates) / len(coordinates)
        return sum(lng for lng, _ in coordinates) / len(coordinates)

    ordered = sorted(options, key=position)
    first, last = ("Northern", "Southern") if east_west else ("Western", "Eastern")
    templates = ROUTE_NAMES_BY_COUNT[len(ordered)]
    return [(f"{template.format(first=first, last=last)} Route", option) for template, option in zip(templates, ordered)]


def plan_checkpoints(option: routing.RouteOption, trip: TripRequest) -> list[PlannedCheckpoint]:
    checkpoints = []
    for index, miles in enumerate(checkpoint_mileposts(option.distance_miles, trip.checkpoint_interval_miles)):
        seconds = interpolate_along(option.cumulative_miles, option.cumulative_seconds, miles)
        checkpoints.append(
            PlannedCheckpoint(
                index=index,
                miles=miles,
                location=point_at_distance(option.coordinates, option.cumulative_miles, miles),
                eta=trip.departure + timedelta(seconds=seconds),
            )
        )
    return checkpoints


def build_route(
    label: str,
    name: str,
    option: routing.RouteOption,
    planned: list[PlannedCheckpoint],
    forecasts: Sequence[weather.HourlyForecast | None],
    load_lb: int,
) -> dict:
    route_id = f"route-{label}"
    checkpoints = []
    for checkpoint, forecast in zip(planned, forecasts):
        conditions = forecast.conditions_at(checkpoint.eta) if forecast else None
        risk = evaluate_checkpoint(conditions, load_lb) if conditions else UNKNOWN_RISK
        checkpoints.append(
            {
                "id": f"{route_id}-checkpoint-{checkpoint.index}",
                "index": checkpoint.index,
                "distance_mi": round(checkpoint.miles, 1),
                "eta": iso(checkpoint.eta),
                "location": rounded_point(checkpoint.location),
                "place_name": None,
                "weather": {
                    "wind_mph": conditions.wind_mph if conditions else None,
                    "rain_in_hr": conditions.rain_in_hr if conditions else None,
                    "snow_in_hr": conditions.snow_in_hr if conditions else None,
                },
                "condition_risk": risk.condition_risk,
                "load_adjusted": risk.load_adjusted,
                "risk": risk.risk,
                "reasons": risk.reasons,
            }
        )

    # Each checkpoint covers the road halfway to its neighbours.
    mileposts = [checkpoint.miles for checkpoint in planned]
    segments = []
    for index, checkpoint in enumerate(checkpoints):
        start = 0.0 if index == 0 else (mileposts[index - 1] + mileposts[index]) / 2
        end = option.distance_miles if index == len(mileposts) - 1 else (mileposts[index] + mileposts[index + 1]) / 2
        coordinates = simplify(slice_line(option.coordinates, option.cumulative_miles, start, end), GEOMETRY_TOLERANCE_DEG)
        segments.append(
            {
                "checkpoint_id": checkpoint["id"],
                "from_mi": round(start, 1),
                "to_mi": round(end, 1),
                "risk": checkpoint["risk"],
                "coordinates": [rounded_point(point) for point in coordinates],
            }
        )

    risk_summary = summarize_risk((segment["to_mi"] - segment["from_mi"], segment["risk"]) for segment in segments)
    unknown_miles = risk_summary["miles_by_level"][UNKNOWN]
    return {
        "id": route_id,
        "label": label,
        "name": name,
        "via": option.roads,
        "distance_mi": round(option.distance_miles, 1),
        "duration_min": round(option.duration_seconds / 60),
        "geometry": [rounded_point(point) for point in simplify(option.coordinates, GEOMETRY_TOLERANCE_DEG)],
        "checkpoints": checkpoints,
        "segments": segments,
        "risk_summary": risk_summary,
        "warnings": [f"{round(unknown_miles):,} mi have no forecast coverage at the estimated arrival time."]
        if unknown_miles
        else [],
    }


def grid_points(lines: Sequence[Sequence[LngLat]], spacing_deg: float) -> list[LngLat]:
    """Grid cells within the trip corridor; latitude spacing shrinks so cells are square on the map."""
    west, south, east, north = bounds(lines)
    lat_spacing = spacing_deg * math.cos(math.radians((south + north) / 2))
    columns = math.floor((east - west + 2 * GRID_PADDING_DEG) / spacing_deg) + 1
    rows = math.floor((north - south + 2 * GRID_PADDING_DEG) / lat_spacing) + 1
    route_samples = [point for line in lines for point in sample_along(line, every_miles=10)]
    cells = (
        (round(west - GRID_PADDING_DEG + column * spacing_deg, 4), round(south - GRID_PADDING_DEG + row * lat_spacing, 4))
        for row in range(rows)
        for column in range(columns)
    )
    return [
        cell for cell in cells if any(haversine_miles(cell, sample) <= CORRIDOR_RADIUS_MILES for sample in route_samples)
    ]


def build_weather_grid(
    points: Sequence[LngLat], forecasts: Sequence[weather.HourlyForecast | None], start: datetime, spacing_deg: float
) -> dict:
    series_by_variable = {"precipitation": "rain_in", "wind": "wind_mph", "snow": "snow_in", "clouds": "cloud_pct"}
    hours = [start + timedelta(hours=hour) for hour in range(HEATMAP_HOURS + 1)]
    values = {
        variable: [
            [forecast.value_at_hour(getattr(forecast, series), hour) if forecast else None for forecast in forecasts]
            for hour in hours
        ]
        for variable, series in series_by_variable.items()
    }
    return {
        "start_time": iso(start),
        "hour_count": len(hours),
        "spacing_deg": spacing_deg,
        "points": [list(point) for point in points],
        "values": values,
    }


def snap_to_cell(point: LngLat, cell_deg: float) -> LngLat:
    return (round(round(point[0] / cell_deg) * cell_deg, 4), round(round(point[1] / cell_deg) * cell_deg, 4))


def analysis_cache_key(trip: TripRequest) -> str:
    fields = [trip.origin.lower(), trip.destination.lower(), trip.departure.isoformat(), trip.load_weight_lb, trip.checkpoint_interval_miles]
    return "analysis:" + hashlib.sha1(json.dumps(fields).encode()).hexdigest()


def analyze_trip_cached(trip: TripRequest) -> dict:
    """Repeated identical searches are served from cache to stay within free API limits."""
    cache_key = analysis_cache_key(trip)
    if (cached := cache.get(cache_key)) is not None:
        return cached
    result = analyze_trip(trip)
    cache.set(cache_key, result, ANALYSIS_CACHE_SECONDS)
    return result


def analyze_trip(trip: TripRequest, providers: Providers = Providers()) -> dict:
    with ThreadPoolExecutor(max_workers=2) as pool:
        origin, destination = pool.map(providers.resolve_place, (trip.origin, trip.destination))

    straight_line_miles = haversine_miles(origin.location, destination.location)
    if straight_line_miles < 1:
        raise ValidationError("Origin and destination must be different places.")
    if straight_line_miles > MAX_TRIP_MILES:
        raise ValidationError(f"Trips longer than {MAX_TRIP_MILES:,} miles aren't supported.")

    named_options = order_and_name(
        providers.fetch_route_options(origin.location, destination.location), origin.location, destination.location
    )
    plans = [plan_checkpoints(option, trip) for _, option in named_options]
    latest_eta = max(checkpoint.eta for plan in plans for checkpoint in plan)

    # Checkpoints share forecasts within a model-scale cell, and every request for this
    # departure uses the same window, so changing the load or interval reuses cached data.
    checkpoint_cells = [snap_to_cell(checkpoint.location, settings.FORECAST_CELL_DEG) for plan in plans for checkpoint in plan]
    spacing_deg = settings.WEATHER_GRID_SPACING_DEG
    heatmap_points = grid_points([option.coordinates for _, option in named_options], spacing_deg)
    forecast_start = weather.floor_hour(trip.departure)
    forecast_end = max(forecast_start + timedelta(hours=HEATMAP_HOURS), latest_eta)
    forecast_points = list(dict.fromkeys([*checkpoint_cells, *heatmap_points]))
    forecast_by_point = dict(
        zip(forecast_points, providers.fetch_hourly_forecasts(forecast_points, forecast_start, forecast_end))
    )
    checkpoint_forecasts = [forecast_by_point[cell] for cell in checkpoint_cells]
    heatmap_forecasts = [forecast_by_point[point] for point in heatmap_points]
    warnings = []

    routes = []
    offset = 0
    for (name, option), plan in zip(named_options, plans):
        forecasts = checkpoint_forecasts[offset : offset + len(plan)]
        offset += len(plan)
        routes.append(build_route(str(len(routes) + 1), name, option, plan, forecasts, trip.load_weight_lb))

    recommendation = rank_routes(routes)
    if all(forecast is None for forecast in checkpoint_forecasts):
        warnings.append("The departure is beyond forecast range (about 16 days), so risk levels are Unknown.")

    has_heatmap = any(forecast is not None for forecast in heatmap_forecasts)
    return {
        "origin": {"name": origin.name, "location": list(origin.location)},
        "destination": {"name": destination.name, "location": list(destination.location)},
        "departure_time": iso(trip.departure),
        "load_weight_lb": trip.load_weight_lb,
        "checkpoint_interval_miles": trip.checkpoint_interval_miles,
        "routes": routes,
        "recommendation": recommendation,
        "weather_grid": build_weather_grid(heatmap_points, heatmap_forecasts, forecast_start, spacing_deg) if has_heatmap else None,
        "warnings": warnings,
        "data_source": "live",
    }
