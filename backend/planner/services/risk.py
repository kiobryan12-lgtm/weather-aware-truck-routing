"""
Weather risk rules and route ranking.

A value on a shared boundary belongs to the higher band (rain 0.25 in/hr is High),
except the No Travel edges for rain and snow, which the spec defines as strictly greater.
"""

from collections.abc import Iterable, Sequence
from functools import cmp_to_key
from dataclasses import dataclass, field

LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL, UNKNOWN = "low", "moderate", "high", "severe", "no_travel", "unknown"
RISK_LEVELS = (LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL, UNKNOWN)
SEVERITY = {UNKNOWN: -1, LOW: 0, MODERATE: 1, HIGH: 2, SEVERE: 3, NO_TRAVEL: 4}
LABELS = {LOW: "Low", MODERATE: "Moderate", HIGH: "High", SEVERE: "Severe", NO_TRAVEL: "No Travel", UNKNOWN: "Unknown"}

BAND_RANGES = {
    "wind": {LOW: "below 25 mph", MODERATE: "25–34 mph", HIGH: "35–44 mph", SEVERE: "45–54 mph", NO_TRAVEL: "55 mph or more"},
    "rain": {
        LOW: "below 0.10 in/hr",
        MODERATE: "0.10–0.25 in/hr",
        HIGH: "0.25–0.50 in/hr",
        SEVERE: "0.50–1.00 in/hr",
        NO_TRAVEL: "above 1.00 in/hr",
    },
    "snow": {
        LOW: "below 0.5 in/hr",
        MODERATE: "0.5–1.0 in/hr",
        HIGH: "1.0–2.0 in/hr",
        SEVERE: "2.0–3.0 in/hr",
        NO_TRAVEL: "above 3.0 in/hr",
    },
}


def classify_wind(mph: float) -> str:
    if mph >= 55:
        return NO_TRAVEL
    if mph >= 45:
        return SEVERE
    if mph >= 35:
        return HIGH
    if mph >= 25:
        return MODERATE
    return LOW


def classify_rain(inches_per_hour: float) -> str:
    if inches_per_hour > 1.0:
        return NO_TRAVEL
    if inches_per_hour >= 0.5:
        return SEVERE
    if inches_per_hour >= 0.25:
        return HIGH
    if inches_per_hour >= 0.1:
        return MODERATE
    return LOW


def classify_snow(inches_per_hour: float) -> str:
    if inches_per_hour > 3.0:
        return NO_TRAVEL
    if inches_per_hour >= 2.0:
        return SEVERE
    if inches_per_hour >= 1.0:
        return HIGH
    if inches_per_hour >= 0.5:
        return MODERATE
    return LOW


def higher_risk(*levels: str) -> str:
    return max(levels, key=SEVERITY.__getitem__)


@dataclass(frozen=True)
class Conditions:
    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float


@dataclass(frozen=True)
class CheckpointRisk:
    risk: str
    condition_risk: dict[str, str]
    load_adjusted: bool = False
    reasons: list[str] = field(default_factory=list)


UNKNOWN_RISK = CheckpointRisk(
    risk=UNKNOWN,
    condition_risk={"wind": UNKNOWN, "rain": UNKNOWN, "snow": UNKNOWN},
    reasons=["No forecast is available for this arrival time."],
)


def load_rule(wind_mph: float, load_lb: int) -> tuple[str, str] | None:
    """Load rules apply to wind only; wind >= 55 mph is already No Travel for any load."""
    wind, load = f"{wind_mph:g}", f"{load_lb:,} lb"
    if 45 <= wind_mph < 55 and load_lb > 30_000:
        return NO_TRAVEL, f"Wind speed {wind} mph with a {load} load (over 30,000 lb) is No Travel."
    if 35 <= wind_mph < 45 and load_lb > 40_000:
        return SEVERE, f"Wind speed {wind} mph with a {load} load (over 40,000 lb) raises risk to Severe."
    return None


def evaluate_checkpoint(conditions: Conditions, load_lb: int) -> CheckpointRisk:
    condition_risk = {
        "wind": classify_wind(conditions.wind_mph),
        "rain": classify_rain(conditions.rain_in_hr),
        "snow": classify_snow(conditions.snow_in_hr),
    }
    weather_risk = higher_risk(*condition_risk.values())
    escalation = load_rule(conditions.wind_mph, load_lb)
    load_adjusted = escalation is not None and SEVERITY[escalation[0]] > SEVERITY[weather_risk]
    risk = higher_risk(weather_risk, escalation[0]) if escalation else weather_risk

    if risk == LOW:
        return CheckpointRisk(risk, condition_risk, False, ["Wind, rain, and snow are all within Low thresholds."])

    readings = {
        "wind": f"Wind speed {conditions.wind_mph:g} mph",
        "rain": f"Rain rate {conditions.rain_in_hr:.2f} in/hr",
        "snow": f"Snowfall {conditions.snow_in_hr:.2f} in/hr",
    }
    reasons = [
        f"{readings[name]} falls in {LABELS[risk]} range ({BAND_RANGES[name][risk]})."
        for name, level in condition_risk.items()
        if level == risk
    ]
    if load_adjusted and escalation:
        reasons.append(escalation[1])
    return CheckpointRisk(risk, condition_risk, load_adjusted, reasons)


def summarize_risk(segments: Iterable[tuple[float, str]]) -> dict:
    """Miles per level and the distance-weighted average risk (Low = 0 … No Travel = 4) from (miles, risk) pairs."""
    miles_by_level = dict.fromkeys(RISK_LEVELS, 0.0)
    weighted_score = known_miles = 0.0
    for miles, level in segments:
        miles_by_level[level] += miles
        if level != UNKNOWN:
            weighted_score += SEVERITY[level] * miles
            known_miles += miles
    return {
        "miles_by_level": {level: round(miles, 1) for level, miles in miles_by_level.items()},
        "average_risk": round(weighted_score / known_miles, 2) if known_miles else None,
    }


RANKING_CRITERIA = (
    (0.05, lambda route: route["risk_summary"]["miles_by_level"][SEVERE]),
    (0.05, lambda route: route["risk_summary"]["miles_by_level"][HIGH]),
    (0.005, lambda route: route["risk_summary"]["average_risk"]),
    (0.5, lambda route: route["duration_min"]),
)


def _deciding_criterion(first: dict, second: dict) -> int | None:
    for index, (tolerance, value_of) in enumerate(RANKING_CRITERIA):
        if abs(value_of(first) - value_of(second)) > tolerance:
            return index
    return None


def _compare_routes(first: dict, second: dict) -> int:
    criterion = _deciding_criterion(first, second)
    if criterion is None:
        return 0
    _, value_of = RANKING_CRITERIA[criterion]
    return -1 if value_of(first) < value_of(second) else 1


def _recommendation_reason(best: dict, runner_up: dict) -> str:
    def name(route: dict) -> str:
        return f"Route {route['label']}"

    def miles(route: dict, level: str) -> str:
        return f"{round(route['risk_summary']['miles_by_level'][level]):,} mi"

    def duration(route: dict) -> str:
        hours, minutes = divmod(round(route["duration_min"]), 60)
        return f"{hours}h {minutes}m" if hours else f"{minutes}m"

    criterion = _deciding_criterion(best, runner_up)
    if criterion == 0:
        return f"{name(best)} has the fewest Severe miles ({miles(best, SEVERE)} vs. {miles(runner_up, SEVERE)} on {name(runner_up)})."
    if criterion == 1:
        return (
            f"{name(best)} ties on Severe miles and has the fewest High miles "
            f"({miles(best, HIGH)} vs. {miles(runner_up, HIGH)} on {name(runner_up)})."
        )
    if criterion == 2:
        return (
            f"{name(best)} ties on Severe and High miles and has the lowest average risk "
            f"({best['risk_summary']['average_risk']:.2f} vs. {runner_up['risk_summary']['average_risk']:.2f})."
        )
    if criterion == 3:
        return f"{name(best)} ties on risk and is the fastest ({duration(best)} vs. {duration(runner_up)})."
    return f"Routes tie on every criterion; {name(best)} is listed first."


def rank_routes(routes: Sequence[dict]) -> dict:
    """
    Sets `eligible`, `rank`, and `ineligible_reason` on each route and returns the recommendation.

    Routes with No Travel miles or no forecast data are ineligible; the rest are ranked by
    fewest Severe miles, fewest High miles, lowest average risk, then shortest travel time.
    """

    def no_travel_miles(route: dict) -> float:
        return route["risk_summary"]["miles_by_level"][NO_TRAVEL]

    eligible = [route for route in routes if no_travel_miles(route) == 0 and route["risk_summary"]["average_risk"] is not None]
    ranked = sorted(eligible, key=cmp_to_key(_compare_routes))
    rank_by_id = {route["id"]: position for position, route in enumerate(ranked, start=1)}

    for route in routes:
        rank = rank_by_id.get(route["id"])
        route["eligible"] = rank is not None
        route["rank"] = rank
        if rank is not None:
            route["ineligible_reason"] = None
        elif no_travel_miles(route) > 0:
            route["ineligible_reason"] = f"Crosses {round(no_travel_miles(route)):,} mi of No Travel conditions."
        else:
            route["ineligible_reason"] = "No forecast coverage at the estimated arrival times."

    excluded = [route for route in routes if no_travel_miles(route) > 0]
    if not ranked:
        reason = (
            "Every route crosses No Travel conditions at its estimated arrival times. "
            "Try a different departure time or a lighter load."
            if excluded
            else "Forecasts are unavailable for this departure time, so no route can be recommended."
        )
        return {"route_id": None, "reason": reason}

    best = ranked[0]
    if len(ranked) == 1:
        if excluded:
            return {"route_id": best["id"], "reason": f"Route {best['label']} is the only route without No Travel conditions."}
        return {"route_id": best["id"], "reason": f"Route {best['label']} is the only route available."}

    reason = _recommendation_reason(best, ranked[1])
    if excluded:
        names = " and ".join(f"Route {route['label']}" for route in excluded)
        reason += f" {names} {'is' if len(excluded) == 1 else 'are'} excluded for No Travel conditions."
    return {"route_id": best["id"], "reason": reason}
