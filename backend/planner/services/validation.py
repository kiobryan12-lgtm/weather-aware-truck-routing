from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .weather import HourlyForecast, SuppliedForecasts, point_key

CHECKPOINT_INTERVALS_MILES = (10, 25, 50)
MAX_LOAD_LB = 200_000
MAX_PLACE_LENGTH = 200
PAST_DEPARTURE_GRACE = timedelta(hours=1)


class ValidationError(Exception):
    pass


@dataclass(frozen=True)
class TripRequest:
    origin: str
    destination: str
    departure: datetime
    load_weight_lb: int
    checkpoint_interval_miles: int


def _place(payload: dict, field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"Enter a {field}.")
    if len(value) > MAX_PLACE_LENGTH:
        raise ValidationError(f"The {field} is too long.")
    return value.strip()


def _departure(value: object, now: datetime) -> datetime:
    if not isinstance(value, str):
        raise ValidationError("Enter a departure date and time.")
    try:
        departure = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValidationError("Departure time must be an ISO 8601 date and time.") from error
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=UTC)
    if departure < now - PAST_DEPARTURE_GRACE:
        raise ValidationError("Departure can't be in the past.")
    return departure.astimezone(UTC)


def _load_weight(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValidationError("Load weight must be a number of pounds.")
    if not 0 <= value <= MAX_LOAD_LB:
        raise ValidationError(f"Load weight must be between 0 and {MAX_LOAD_LB:,} lb.")
    return round(value)


def parse_trip_request(payload: object, now: datetime | None = None) -> TripRequest:
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")
    interval = payload.get("checkpoint_interval_miles")
    if interval not in CHECKPOINT_INTERVALS_MILES or isinstance(interval, bool):
        raise ValidationError("Checkpoint interval must be 10, 25, or 50 miles.")
    return TripRequest(
        origin=_place(payload, "origin"),
        destination=_place(payload, "destination"),
        departure=_departure(payload.get("departure_time"), now or datetime.now(UTC)),
        load_weight_lb=_load_weight(payload.get("load_weight_lb")),
        checkpoint_interval_miles=int(interval),
    )


MAX_FORECAST_POINTS = 2000
MAX_FORECAST_HOURS = 24 * 16
FORECAST_SERIES = ("wind_mph", "rain_in", "snow_in", "cloud_pct")


def _number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _series(values: object, hours: int) -> tuple[float | None, ...]:
    if not isinstance(values, list) or len(values) != hours:
        raise ValidationError("Forecast series must have one value per hour.")
    if not all(value is None or _number(value) for value in values):
        raise ValidationError("Forecast values must be numbers or null.")
    return tuple(None if value is None else float(value) for value in values)


def parse_supplied_forecasts(value: object) -> SuppliedForecasts | None:
    """Forecasts the browser fetched from Open-Meteo; None when the client sent none."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValidationError("Forecasts must be a JSON object.")
    points = value.get("points")
    if not isinstance(points, list) or len(points) > MAX_FORECAST_POINTS:
        raise ValidationError("Forecast points are missing or too many.")
    if not points:
        return SuppliedForecasts({})
    try:
        start = datetime.fromisoformat(str(value.get("start_time")))
    except ValueError as error:
        raise ValidationError("Forecast start time must be an ISO 8601 date and time.") from error
    start = (start if start.tzinfo else start.replace(tzinfo=UTC)).astimezone(UTC)

    series_by_name = {name: value.get(name) for name in FORECAST_SERIES}
    if not all(isinstance(series, list) and len(series) == len(points) for series in series_by_name.values()):
        raise ValidationError("Every forecast series needs one entry per point.")
    first_series = series_by_name["wind_mph"][0]
    hours = len(first_series) if isinstance(first_series, list) else 0
    if not 0 < hours <= MAX_FORECAST_HOURS:
        raise ValidationError("Forecasts must cover between 1 hour and 16 days.")

    forecasts = {}
    for index, point in enumerate(points):
        if not (isinstance(point, list) and len(point) == 2 and all(_number(coordinate) for coordinate in point)):
            raise ValidationError("Forecast points must be [longitude, latitude] pairs.")
        forecasts[point_key((float(point[0]), float(point[1])))] = HourlyForecast(
            start=start,
            wind_mph=_series(series_by_name["wind_mph"][index], hours),
            rain_in=_series(series_by_name["rain_in"][index], hours),
            snow_in=_series(series_by_name["snow_in"][index], hours),
            cloud_pct=_series(series_by_name["cloud_pct"][index], hours),
        )
    return SuppliedForecasts(forecasts)
