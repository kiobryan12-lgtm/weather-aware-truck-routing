import hashlib
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

from .geo import LngLat
from .http import get_json

US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
STATE_CODES = {name.lower(): code for code, name in US_STATES.items()}
COUNTRY_SUFFIXES = {"usa", "us", "united states", "united states of america"}


class GeocodingError(Exception):
    pass


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    detail: str
    location: LngLat


def _split_query(query: str) -> tuple[str, str | None]:
    """'Denver, CO, USA' -> ('Denver', 'CO'). Accepts state codes or full names."""
    parts = [part.strip() for part in query.split(",") if part.strip()]
    if parts and parts[-1].lower() in COUNTRY_SUFFIXES:
        parts.pop()
    if not parts:
        return "", None
    state = parts[1] if len(parts) > 1 else None
    if state:
        state = state.upper() if state.upper() in US_STATES else STATE_CODES.get(state.lower())
    return parts[0], state


def _to_place(result: dict) -> Place | None:
    state_code = STATE_CODES.get(str(result.get("admin1", "")).lower())
    if not state_code:
        return None
    return Place(
        id=str(result["id"]),
        name=f"{result['name']}, {state_code}",
        detail=f"{result['admin1']}, United States",
        location=(round(result["longitude"], 5), round(result["latitude"], 5)),
    )


def search_places(query: str, limit: int = 6) -> list[Place]:
    """US places matching the query, biggest first."""
    city, state = _split_query(query)
    if len(city) < 2:
        return []
    cache_key = "geocode:" + hashlib.sha1(f"{city.lower()}|{state}".encode()).hexdigest()
    results = cache.get(cache_key)
    if results is None:
        payload = get_json(
            settings.OPEN_METEO_GEOCODING_URL,
            params={"name": city, "count": 20, "language": "en", "format": "json", "countryCode": "US"},
            service="geocoding",
        )
        results = payload.get("results", [])
        cache.set(cache_key, results, timeout=24 * 60 * 60)

    places = [place for place in map(_to_place, results) if place]
    if state:
        places = [place for place in places if place.name.endswith(f", {state}")]
    return places[:limit]


def resolve_place(query: str) -> Place:
    matches = search_places(query, limit=1)
    if not matches:
        raise GeocodingError(f'We couldn\'t find "{query.strip()}". Try a US city and state, e.g. Denver, CO.')
    return matches[0]
