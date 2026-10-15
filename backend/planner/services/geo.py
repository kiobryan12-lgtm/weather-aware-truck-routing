import math
from bisect import bisect_right
from collections.abc import Sequence

LngLat = tuple[float, float]

EARTH_RADIUS_MILES = 3958.8
MILES_PER_DEGREE = 69.17


def haversine_miles(start: LngLat, end: LngLat) -> float:
    lng1, lat1 = map(math.radians, start)
    lng2, lat2 = map(math.radians, end)
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(min(1.0, math.sqrt(a)))


def cumulative_miles(line: Sequence[LngLat]) -> list[float]:
    distances = [0.0]
    for previous, current in zip(line, line[1:]):
        distances.append(distances[-1] + haversine_miles(previous, current))
    return distances


def _segment_index(cumulative: Sequence[float], miles: float) -> int:
    return min(max(bisect_right(cumulative, miles) - 1, 0), len(cumulative) - 2)


def interpolate_along(cumulative: Sequence[float], values: Sequence[float], miles: float) -> float:
    """Value at `miles`, linearly interpolated between the vertices' `values`."""
    if miles <= 0:
        return values[0]
    if miles >= cumulative[-1]:
        return values[-1]
    index = _segment_index(cumulative, miles)
    span = cumulative[index + 1] - cumulative[index]
    fraction = 0.0 if span == 0 else (miles - cumulative[index]) / span
    return values[index] + (values[index + 1] - values[index]) * fraction


def point_at_distance(line: Sequence[LngLat], cumulative: Sequence[float], miles: float) -> LngLat:
    lng = interpolate_along(cumulative, [point[0] for point in line], miles)
    lat = interpolate_along(cumulative, [point[1] for point in line], miles)
    return (lng, lat)


def slice_line(line: Sequence[LngLat], cumulative: Sequence[float], start_miles: float, end_miles: float) -> list[LngLat]:
    points = [point_at_distance(line, cumulative, start_miles)]
    points.extend(point for point, miles in zip(line, cumulative) if start_miles < miles < end_miles)
    points.append(point_at_distance(line, cumulative, end_miles))
    return points


def simplify(line: Sequence[LngLat], tolerance_deg: float) -> list[LngLat]:
    """Ramer–Douglas–Peucker simplification; always keeps both endpoints."""
    if len(line) < 3:
        return list(line)
    keep = [False] * len(line)
    keep[0] = keep[-1] = True
    stack = [(0, len(line) - 1)]
    while stack:
        first, last = stack.pop()
        farthest_index, farthest_distance = first, 0.0
        for index in range(first + 1, last):
            distance = _perpendicular_distance(line[index], line[first], line[last])
            if distance > farthest_distance:
                farthest_index, farthest_distance = index, distance
        if farthest_distance > tolerance_deg:
            keep[farthest_index] = True
            stack.extend([(first, farthest_index), (farthest_index, last)])
    return [point for point, kept in zip(line, keep) if kept]


def _perpendicular_distance(point: LngLat, start: LngLat, end: LngLat) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / math.hypot(dx, dy)


def bounds(lines: Sequence[Sequence[LngLat]]) -> tuple[float, float, float, float]:
    """(west, south, east, north) of all points."""
    lngs = [point[0] for line in lines for point in line]
    lats = [point[1] for line in lines for point in line]
    return min(lngs), min(lats), max(lngs), max(lats)


def offset_point(origin: LngLat, destination: LngLat, along: float, across: float) -> LngLat:
    """Point `along` the way from origin to destination, shifted sideways by `across` × trip length (left is positive)."""
    lng_scale = math.cos(math.radians((origin[1] + destination[1]) / 2))
    dx = (destination[0] - origin[0]) * lng_scale
    dy = destination[1] - origin[1]
    length = math.hypot(dx, dy) or 1.0
    normal_x, normal_y = -dy / length, dx / length
    x = dx * along + normal_x * across * length
    y = dy * along + normal_y * across * length
    return (origin[0] + x / lng_scale, origin[1] + y)
