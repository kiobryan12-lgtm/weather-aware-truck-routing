from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

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
