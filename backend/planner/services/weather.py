import math
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from .geo import LngLat
from .http import get_json
from .risk import Conditions

HOURLY_VARIABLES = ("wind_speed_10m", "rain", "snowfall", "cloud_cover")
BATCH_SIZE = 100
MAX_PARALLEL_REQUESTS = 2
FORECAST_DAYS = 16
CACHE_SECONDS = 30 * 60
ONE_HOUR = timedelta(hours=1)

Series = tuple[float | None, ...]


@dataclass(frozen=True)
class HourlyForecast:
    """Hourly values from `start` (UTC). Rain and snow are totals for the preceding hour, i.e. in/hr."""

    start: datetime
    wind_mph: Series
    rain_in: Series
    snow_in: Series
    cloud_pct: Series

    def conditions_at(self, moment: datetime) -> Conditions | None:
        """Wind interpolated between hours; rain and snow from the hour that contains `moment`."""
        offset = (moment - self.start) / ONE_HOUR
        last_index = len(self.wind_mph) - 1
        if offset < 0 or offset > last_index:
            return None
        lower, upper = math.floor(offset), min(math.ceil(offset), last_index)
        wind_lower, wind_upper = self.wind_mph[lower], self.wind_mph[upper]
        rain, snow = self.rain_in[upper], self.snow_in[upper]
        if None in (wind_lower, wind_upper, rain, snow):
            return None
        wind = wind_lower + (wind_upper - wind_lower) * (offset - lower)
        return Conditions(wind_mph=round(wind, 1), rain_in_hr=round(rain, 2), snow_in_hr=round(snow, 2))

    def value_at_hour(self, series: Series, moment: datetime) -> float | None:
        index = (moment - self.start) // ONE_HOUR
        return series[index] if 0 <= index < len(series) else None


def floor_hour(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def fetch_hourly_forecasts(points: Sequence[LngLat], start: datetime, end: datetime) -> list[HourlyForecast | None]:
    """One forecast per point covering [start, end]; `None` where the window is beyond forecast range."""
    first_hour = floor_hour(start)
    last_available_hour = floor_hour(datetime.now(UTC)) + timedelta(days=FORECAST_DAYS) - ONE_HOUR
    last_hour = min(floor_hour(end) + ONE_HOUR, last_available_hour)
    if first_hour > last_hour:
        return [None] * len(points)

    rounded = [(round(lng, 2), round(lat, 2)) for lng, lat in points]
    window = f"{first_hour:%Y%m%d%H}-{last_hour:%Y%m%d%H}"
    keys = [f"weather:{lng},{lat}:{window}" for lng, lat in rounded]
    forecasts = cache.get_many(keys)

    missing = list(dict.fromkeys((key, point) for key, point in zip(keys, rounded) if key not in forecasts))
    batches = [missing[index : index + BATCH_SIZE] for index in range(0, len(missing), BATCH_SIZE)]
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_REQUESTS) as pool:
        results = pool.map(lambda batch: _fetch_batch([point for _, point in batch], first_hour, last_hour), batches)
        fetched = {key: forecast for batch, batch_forecasts in zip(batches, results) for (key, _), forecast in zip(batch, batch_forecasts)}

    cache.set_many(fetched, CACHE_SECONDS)
    forecasts.update(fetched)
    return [forecasts.get(key) for key in keys]


def _fetch_batch(points: list[LngLat], first_hour: datetime, last_hour: datetime) -> list[HourlyForecast]:
    payload = get_json(
        settings.OPEN_METEO_FORECAST_URL,
        params={
            "latitude": ",".join(f"{lat:.2f}" for _, lat in points),
            "longitude": ",".join(f"{lng:.2f}" for lng, _ in points),
            "hourly": ",".join(HOURLY_VARIABLES),
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "GMT",
            "start_hour": f"{first_hour:%Y-%m-%dT%H:%M}",
            "end_hour": f"{last_hour:%Y-%m-%dT%H:%M}",
        },
        service="weather",
    )
    locations = payload if isinstance(payload, list) else [payload]
    return [parse_forecast(location["hourly"]) for location in locations]


def parse_forecast(hourly: dict) -> HourlyForecast:
    start = datetime.fromisoformat(hourly["time"][0]).replace(tzinfo=UTC)
    return HourlyForecast(
        start=start,
        wind_mph=tuple(hourly["wind_speed_10m"]),
        rain_in=tuple(hourly["rain"]),
        snow_in=tuple(hourly["snowfall"]),
        cloud_pct=tuple(hourly["cloud_cover"]),
    )
