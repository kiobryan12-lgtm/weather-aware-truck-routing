import json
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from planner.services.analysis import Providers, analyze_trip, forecast_request
from planner.services.validation import ValidationError, parse_supplied_forecasts
from planner.services.weather import point_key
from planner.tests.test_analysis import PLACES, straight_route, trip

HOURS = 60


def supplied_payload(points, wind=10.0, rain=0.0):
    return {
        "start_time": "2026-10-15T08:00Z",
        "points": [list(point) for point in points],
        "wind_mph": [[wind] * HOURS for _ in points],
        "rain_in": [[rain] * HOURS for _ in points],
        "snow_in": [[0.0] * HOURS for _ in points],
        "cloud_pct": [[50] * HOURS for _ in points],
    }


class ParseSuppliedForecastsTests(SimpleTestCase):
    def test_missing_forecasts_mean_server_fetches(self):
        self.assertIsNone(parse_supplied_forecasts(None))

    def test_valid_payload_is_looked_up_by_rounded_point(self):
        supplied = parse_supplied_forecasts(supplied_payload([(-104.99, 39.74)], wind=30))
        departure = datetime(2026, 10, 15, 8, tzinfo=UTC)
        (forecast,) = supplied([(-104.991, 39.741)], departure, departure)
        self.assertEqual(forecast.conditions_at(departure).wind_mph, 30)

    def test_malformed_payloads_are_rejected(self):
        good = supplied_payload([(-104.99, 39.74)])
        broken = [
            "not an object",
            {**good, "points": "nope"},
            {**good, "start_time": "yesterday"},
            {**good, "rain_in": []},
            {**good, "wind_mph": [["fast"] * HOURS]},
            {**good, "points": [[-104.99]]},
        ]
        for payload in broken:
            with self.subTest(payload=str(payload)[:40]), self.assertRaises(ValidationError):
                parse_supplied_forecasts(payload)


@override_settings(WEATHER_GRID_SPACING_DEG=2.0)
class SuppliedForecastAnalysisTests(SimpleTestCase):
    def providers(self, fetch=None):
        return Providers(
            resolve_place=PLACES.__getitem__,
            fetch_route_options=lambda origin, destination: [straight_route(39.4)],
            fetch_hourly_forecasts=fetch or (lambda points, start, end: self.fail("server should not fetch weather")),
        )

    @patch("planner.services.weather.datetime")
    def test_forecast_request_lists_points_and_window(self, mocked_datetime):
        mocked_datetime.now.return_value = datetime(2026, 10, 15, 6, tzinfo=UTC)
        request = forecast_request(trip(), self.providers())
        self.assertTrue(request["points"])
        self.assertEqual(request["start_time"], "2026-10-15T08:00:00Z")
        self.assertGreaterEqual(datetime.fromisoformat(request["end_time"]), datetime(2026, 10, 17, 8, tzinfo=UTC))

    def test_analysis_uses_supplied_forecasts_only(self):
        plan_points = [tuple(point) for point in forecast_request(trip(), self.providers())["points"]]
        supplied = parse_supplied_forecasts(supplied_payload(plan_points, wind=50))
        result = analyze_trip(trip(load=35_000), self.providers(fetch=supplied))
        checkpoint_risks = {checkpoint["risk"] for checkpoint in result["routes"][0]["checkpoints"]}
        self.assertEqual(checkpoint_risks, {"no_travel"})
        self.assertIsNotNone(result["weather_grid"])

    def test_points_missing_from_supplied_forecasts_are_unknown(self):
        result = analyze_trip(trip(), self.providers(fetch=parse_supplied_forecasts(supplied_payload([]))))
        self.assertEqual({checkpoint["risk"] for checkpoint in result["routes"][0]["checkpoints"]}, {"unknown"})


class PlanAndAnalyzeViewTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def payload(self, **extra):
        return {
            "origin": "Denver, CO",
            "destination": "Kansas City, MO",
            "departure_time": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            "load_weight_lb": 35000,
            "checkpoint_interval_miles": 25,
            **extra,
        }

    @patch("planner.views.forecast_request", return_value={"points": [[-104.99, 39.74]], "start_time": "x", "end_time": "y"})
    def test_plan_endpoint(self, _):
        response = self.client.post("/api/routes/plan", data=json.dumps(self.payload()), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["points"], [[-104.99, 39.74]])

    @patch("planner.views.analyze_trip_cached", return_value={"routes": []})
    def test_analyze_passes_supplied_forecasts(self, analyze):
        body = self.payload(forecasts=supplied_payload([(-104.99, 39.74)]))
        response = self.client.post("/api/routes/analyze", data=json.dumps(body), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        providers = analyze.call_args.args[1]
        self.assertIn(point_key((-104.99, 39.74)), providers.fetch_hourly_forecasts.forecasts_by_point)

    def test_analyze_rejects_malformed_forecasts(self):
        body = self.payload(forecasts={"points": "nope"})
        response = self.client.post("/api/routes/analyze", data=json.dumps(body), content_type="application/json")
        self.assertEqual(response.status_code, 400)
