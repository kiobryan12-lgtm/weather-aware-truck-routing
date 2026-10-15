import threading
import time
from datetime import UTC, datetime
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase

from planner.services import analysis, http
from planner.services.validation import TripRequest


def response(status: int, payload: dict) -> httpx.Response:
    return httpx.Response(status, json=payload, request=httpx.Request("GET", "https://example.test"))


class GetJsonTests(SimpleTestCase):
    @patch.object(http._client, "get")
    def test_rate_limit_is_not_retried_and_keeps_provider_reason(self, get):
        get.return_value = response(429, {"error": True, "reason": "Hourly API request limit exceeded."})
        with self.assertRaises(http.UpstreamError) as raised:
            http.get_json("https://example.test", service="weather")
        self.assertEqual(get.call_count, 1)
        self.assertTrue(raised.exception.is_rate_limited)
        self.assertIn("Hourly API request limit exceeded.", raised.exception.message)

    @patch.object(http._client, "get", side_effect=httpx.ReadTimeout("slow"))
    def test_slow_responses_are_not_retried(self, get):
        with self.assertRaises(http.UpstreamError) as raised:
            http.get_json("https://example.test", service="weather")
        self.assertEqual(get.call_count, 1)
        self.assertIn("slowly", raised.exception.message)

    @patch.object(http._client, "get")
    def test_connection_failures_are_retried_once(self, get):
        get.side_effect = [httpx.ConnectError("down"), response(200, {"ok": True})]
        self.assertEqual(http.get_json("https://example.test", service="weather"), {"ok": True})
        self.assertEqual(get.call_count, 2)


class SearchDeduplicationTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_concurrent_identical_searches_run_the_analysis_once(self):
        calls = []

        def slow_analysis(trip):
            calls.append(trip)
            time.sleep(0.2)
            return {"routes": []}

        trip = TripRequest("Denver, CO", "Kansas City, MO", datetime(2026, 10, 16, 14, tzinfo=UTC), 35000, 25)
        results = []
        with patch.object(analysis, "analyze_trip", side_effect=slow_analysis):
            threads = [threading.Thread(target=lambda: results.append(analysis.analyze_trip_cached(trip))) for _ in range(3)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

        self.assertEqual(len(calls), 1)
        self.assertEqual(results, [{"routes": []}] * 3)
