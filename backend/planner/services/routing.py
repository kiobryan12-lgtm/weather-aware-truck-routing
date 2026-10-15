import re
from dataclasses import dataclass
from itertools import pairwise

from django.conf import settings
from django.core.cache import cache

from .geo import LngLat, cumulative_miles, haversine_miles, offset_point, point_at_distance
from .http import UpstreamError, get_json

DETOUR_OFFSETS = (0.2, -0.2, 0.35, -0.35)
MAX_DETOUR_RATIO = 1.6
OVERLAP_RADIUS_MILES = 3.0
MAX_OVERLAP_SHARE = 0.75
MIN_ROAD_SHARE = 0.05
ROUTE_CACHE_SECONDS = 60 * 60
ROAD_REFERENCE = re.compile(r"\b(I|US|[A-Z]{2})\s(\d+[A-Z]?)\b")


class RoutingError(Exception):
    pass


@dataclass(frozen=True)
class RouteOption:
    coordinates: list[LngLat]
    cumulative_miles: list[float]
    cumulative_seconds: list[float]
    roads: str

    @property
    def distance_miles(self) -> float:
        return self.cumulative_miles[-1]

    @property
    def duration_seconds(self) -> float:
        return self.cumulative_seconds[-1]


def fetch_route_options(origin: LngLat, destination: LngLat, count: int = 3) -> list[RouteOption]:
    """
    Up to `count` distinct routes, fastest first. When OSRM returns fewer alternatives,
    extra routes are found by forcing a detour through points to either side of the trip.
    """
    cache_key = f"routes:{origin[0]:.4f},{origin[1]:.4f}:{destination[0]:.4f},{destination[1]:.4f}:{count}"
    if (cached := cache.get(cache_key)) is not None:
        return cached

    options = _request_routes([origin, destination], alternatives=count - 1)
    if not options:
        raise RoutingError("No drivable route was found between these places.")

    longest_allowed = options[0].distance_miles * MAX_DETOUR_RATIO
    for across in DETOUR_OFFSETS:
        if len(options) >= count:
            break
        via = offset_point(origin, destination, along=0.5, across=across)
        for candidate in _request_routes([origin, via, destination], alternatives=0):
            if candidate.distance_miles <= longest_allowed and not any(_overlaps(candidate, other) for other in options):
                options.append(candidate)

    options = options[:count]
    cache.set(cache_key, options, ROUTE_CACHE_SECONDS)
    return options


def _request_routes(waypoints: list[LngLat], alternatives: int) -> list[RouteOption]:
    coordinates = ";".join(f"{lng:.5f},{lat:.5f}" for lng, lat in waypoints)
    try:
        payload = get_json(
            f"{settings.OSRM_BASE_URL}/route/v1/driving/{coordinates}",
            params={
                "alternatives": alternatives if alternatives > 0 else "false",
                "overview": "full",
                "geometries": "geojson",
                "annotations": "duration",
                "steps": "true",
            },
            service="routing",
        )
    except UpstreamError as error:
        if error.status == 400 and isinstance(error.payload, dict) and error.payload.get("code") in {"NoRoute", "NoSegment"}:
            return []
        raise
    return [parse_route(route) for route in payload.get("routes", [])]


def parse_route(route: dict) -> RouteOption:
    """Builds cumulative distance and truck travel time; each segment is capped at the truck speed limit."""
    coordinates = [(float(lng), float(lat)) for lng, lat in route["geometry"]["coordinates"]]
    cumulative = cumulative_miles(coordinates)

    segment_seconds = [seconds for leg in route["legs"] for seconds in leg.get("annotation", {}).get("duration", [])]
    if len(segment_seconds) != len(coordinates) - 1:
        seconds_per_mile = route["duration"] / cumulative[-1] if cumulative[-1] else 0.0
        segment_seconds = [(end - start) * seconds_per_mile for start, end in pairwise(cumulative)]

    truck_seconds = [0.0]
    for (start, end), car_seconds in zip(pairwise(cumulative), segment_seconds):
        minimum_seconds = (end - start) / settings.TRUCK_MAX_SPEED_MPH * 3600
        truck_seconds.append(truck_seconds[-1] + max(car_seconds, minimum_seconds))

    return RouteOption(coordinates, cumulative, truck_seconds, road_summary(route["legs"]))


def road_summary(legs: list[dict]) -> str:
    """The three longest roads in driving order, by route number where one exists, e.g. 'I-70 · US-40'."""
    meters_by_road: dict[str, float] = {}
    for leg in legs:
        for step in leg.get("steps", []):
            road = (step.get("ref") or "").split(";")[0].strip() or step.get("name", "").strip()
            if road:
                meters_by_road[road] = meters_by_road.get(road, 0.0) + step.get("distance", 0.0)
    minimum_meters = sum(meters_by_road.values()) * MIN_ROAD_SHARE
    longest = set(sorted(meters_by_road, key=meters_by_road.__getitem__, reverse=True)[:3])
    roads = [
        ROAD_REFERENCE.sub(r"\1-\2", road)
        for road, meters in meters_by_road.items()
        if road in longest and meters >= minimum_meters
    ]
    return " · ".join(roads) or "Local roads"


def _sample(option: RouteOption, every_miles: float) -> list[LngLat]:
    steps = max(1, int(option.distance_miles // every_miles))
    return [
        point_at_distance(option.coordinates, option.cumulative_miles, option.distance_miles * step / steps)
        for step in range(steps + 1)
    ]


def _overlaps(candidate: RouteOption, existing: RouteOption) -> bool:
    samples = _sample(candidate, every_miles=5)
    reference = _sample(existing, every_miles=2)
    shared = sum(1 for point in samples if any(haversine_miles(point, other) <= OVERLAP_RADIUS_MILES for other in reference))
    return shared / len(samples) > MAX_OVERLAP_SHARE
