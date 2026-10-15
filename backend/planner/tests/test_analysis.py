from datetime import UTC, datetime, timedelta

from django.test import SimpleTestCase, override_settings

from planner.services.analysis import Providers, analyze_trip, checkpoint_mileposts, grid_points
from planner.services.geo import cumulative_miles
from planner.services.geocoding import Place
from planner.services.routing import RouteOption
from planner.services.validation import TripRequest, ValidationError, parse_trip_request
from planner.services.weather import HourlyForecast

NOW = datetime(2026, 10, 15, 6, tzinfo=UTC)
DEPARTURE = datetime(2026, 10, 15, 8, tzinfo=UTC)
PLACES = {
    "Denver, CO": Place("1", "Denver, CO", "Colorado, United States", (-104.99, 39.74)),
    "Kansas City, MO": Place("2", "Kansas City, MO", "Missouri, United States", (-94.58, 39.10)),
}


def straight_route(latitude: float, mph: float = 60) -> RouteOption:
    coordinates = [(-104.99 + step * 0.52, latitude) for step in range(21)]
    cumulative = cumulative_miles(coordinates)
    return RouteOption(coordinates, cumulative, [miles / mph * 3600 for miles in cumulative], "I-70")


def constant_forecast(wind=10.0, rain=0.0, snow=0.0, hours=60) -> HourlyForecast:
    return HourlyForecast(DEPARTURE, (wind,) * hours, (rain,) * hours, (snow,) * hours, (20,) * hours)


def trip(load=35_000, interval=50, departure=DEPARTURE) -> TripRequest:
    return TripRequest("Denver, CO", "Kansas City, MO", departure, load, interval)


def providers(routes, forecast_for_latitude=lambda latitude: constant_forecast()):
    return Providers(
        resolve_place=PLACES.__getitem__,
        fetch_route_options=lambda origin, destination: routes,
        fetch_hourly_forecasts=lambda points, start, end: [forecast_for_latitude(lat) for _, lat in points],
    )


@override_settings(WEATHER_GRID_SPACING_DEG=2.0)
class AnalyzeTripTests(SimpleTestCase):
    def test_response_matches_frontend_contract(self):
        result = analyze_trip(trip(), providers([straight_route(39.4)]))
        self.assertEqual(
            set(result),
            {"origin", "destination", "departure_time", "load_weight_lb", "checkpoint_interval_miles", "routes",
             "recommendation", "weather_grid", "warnings", "data_source"},
        )
        route = result["routes"][0]
        self.assertEqual(
            set(route),
            {"id", "label", "name", "via", "distance_mi", "duration_min", "geometry", "checkpoints", "segments",
             "risk_summary", "eligible", "rank", "ineligible_reason", "warnings"},
        )
        self.assertEqual(result["data_source"], "live")
        self.assertEqual(result["weather_grid"]["hour_count"], 49)

    def test_checkpoints_use_arrival_time_at_each_milepost(self):
        route = analyze_trip(trip(interval=50), providers([straight_route(39.4, mph=50)]))["routes"][0]
        checkpoints = route["checkpoints"]
        self.assertEqual([checkpoint["distance_mi"] for checkpoint in checkpoints[:3]], [0.0, 50.0, 100.0])
        self.assertEqual(checkpoints[1]["eta"], "2026-10-15T09:00:00Z")
        self.assertEqual(checkpoints[-1]["distance_mi"], route["distance_mi"])

    def test_routes_are_named_north_to_south_and_ranked(self):
        def stormy_south(latitude):
            return constant_forecast(wind=50) if latitude < 39 else constant_forecast()

        result = analyze_trip(trip(load=35_000), providers([straight_route(38.5), straight_route(39.9)], stormy_south))
        names = [route["name"] for route in result["routes"]]
        self.assertEqual(names, ["Northern Route", "Southern Route"])
        southern = result["routes"][1]
        self.assertFalse(southern["eligible"])
        self.assertTrue(all(checkpoint["load_adjusted"] for checkpoint in southern["checkpoints"]))
        self.assertEqual(result["recommendation"]["route_id"], "route-1")

    def test_missing_forecast_is_unknown_and_not_recommended(self):
        no_forecast = Providers(
            resolve_place=PLACES.__getitem__,
            fetch_route_options=lambda origin, destination: [straight_route(39.4)],
            fetch_hourly_forecasts=lambda points, start, end: [None] * len(points),
        )
        result = analyze_trip(trip(), no_forecast)
        self.assertEqual({checkpoint["risk"] for checkpoint in result["routes"][0]["checkpoints"]}, {"unknown"})
        self.assertIsNone(result["recommendation"]["route_id"])
        self.assertIsNone(result["weather_grid"])
        self.assertTrue(result["warnings"])

    def test_same_origin_and_destination_is_rejected(self):
        same_place = Providers(resolve_place=lambda query: PLACES["Denver, CO"])
        with self.assertRaises(ValidationError):
            analyze_trip(trip(), same_place)


class HelperTests(SimpleTestCase):
    def test_checkpoint_mileposts_end_at_destination(self):
        self.assertEqual(checkpoint_mileposts(60, 25), [0, 25, 50, 60])
        self.assertEqual(checkpoint_mileposts(50.4, 25), [0, 25, 50.4])

    def test_grid_covers_padded_bounds(self):
        points = grid_points([[(-100, 39), (-98, 40)]], spacing_deg=1.0)
        lngs = {lng for lng, _ in points}
        self.assertEqual(min(lngs), -101.5)
        self.assertGreaterEqual(max(lngs), -97)


class ValidationTests(SimpleTestCase):
    def payload(self, **overrides):
        payload = {
            "origin": "Denver, CO",
            "destination": "Kansas City, MO",
            "departure_time": "2026-10-15T08:00:00Z",
            "load_weight_lb": 35000,
            "checkpoint_interval_miles": 25,
        }
        payload.update(overrides)
        return payload

    def test_valid_request(self):
        request = parse_trip_request(self.payload(), now=NOW)
        self.assertEqual(request.departure, DEPARTURE)
        self.assertEqual(request.load_weight_lb, 35_000)

    def test_invalid_fields_are_rejected(self):
        invalid = [
            {"origin": " "},
            {"destination": None},
            {"departure_time": "tomorrow"},
            {"departure_time": (NOW - timedelta(hours=2)).isoformat()},
            {"load_weight_lb": -1},
            {"load_weight_lb": "35000"},
            {"load_weight_lb": True},
            {"checkpoint_interval_miles": 15},
        ]
        for overrides in invalid:
            with self.subTest(overrides=overrides), self.assertRaises(ValidationError):
                parse_trip_request(self.payload(**overrides), now=NOW)

    def test_non_object_body_is_rejected(self):
        with self.assertRaises(ValidationError):
            parse_trip_request([], now=NOW)
