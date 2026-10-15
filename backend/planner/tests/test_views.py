import json
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase

from planner.services.geocoding import GeocodingError, Place
from planner.services.http import UpstreamError
from planner.services.routing import RoutingError

ANALYZE_URL = "/api/routes/analyze"


def valid_payload():
    return {
        "origin": "Denver, CO",
        "destination": "Kansas City, MO",
        "departure_time": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        "load_weight_lb": 35000,
        "checkpoint_interval_miles": 25,
    }


class HealthViewTests(SimpleTestCase):
    def test_health_returns_ok(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class AnalyzeViewTests(SimpleTestCase):
    def post(self, body):
        return self.client.post(ANALYZE_URL, data=body, content_type="application/json")

    @patch("planner.views.analyze_trip_cached", return_value={"routes": []})
    def test_valid_request_returns_analysis(self, analyze_trip):
        response = self.post(json.dumps(valid_payload()))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"routes": []})
        self.assertEqual(analyze_trip.call_args.args[0].checkpoint_interval_miles, 25)

    def test_invalid_json_returns_400(self):
        response = self.post("{not json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("valid JSON", response.json()["detail"])

    def test_validation_error_returns_400(self):
        response = self.post(json.dumps({**valid_payload(), "checkpoint_interval_miles": 15}))
        self.assertEqual(response.status_code, 400)

    def test_get_is_not_allowed(self):
        self.assertEqual(self.client.get(ANALYZE_URL).status_code, 405)

    def test_errors_map_to_status_codes(self):
        cases = [
            (GeocodingError("Not found"), 400),
            (RoutingError("No route"), 422),
            (UpstreamError("Weather down"), 502),
            (UpstreamError("Limit reached", status=429), 503),
            (RuntimeError("boom"), 500),
        ]
        for error, status in cases:
            with self.subTest(error=error), patch("planner.views.analyze_trip_cached", side_effect=error):
                response = self.post(json.dumps(valid_payload()))
                self.assertEqual(response.status_code, status)
                self.assertNotIn("boom", response.json()["detail"])


class SearchViewTests(SimpleTestCase):
    @patch("planner.views.search_places")
    def test_returns_suggestions(self, search_places):
        search_places.return_value = [Place("1", "Denver, CO", "Colorado, United States", (-104.98, 39.74))]
        response = self.client.get("/api/locations/search", {"q": "Denv"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["name"], "Denver, CO")
        self.assertEqual(response.json()[0]["location"], [-104.98, 39.74])
