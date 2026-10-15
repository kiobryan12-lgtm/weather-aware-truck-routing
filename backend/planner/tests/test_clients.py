from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from planner.services import geocoding, routing, weather
from planner.services.http import UpstreamError


def osrm_route(coordinates, seconds_per_segment):
    return {
        "geometry": {"coordinates": coordinates},
        "duration": seconds_per_segment * (len(coordinates) - 1),
        "legs": [{"steps": [], "annotation": {"duration": [seconds_per_segment] * (len(coordinates) - 1)}}],
    }


class GeocodingTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    @patch("planner.services.geocoding.get_json")
    def test_filters_by_state_and_formats_names(self, get_json):
        get_json.return_value = {
            "results": [
                {"id": 1, "name": "Denver", "admin1": "Colorado", "latitude": 39.74, "longitude": -104.98},
                {"id": 2, "name": "Denver", "admin1": "Pennsylvania", "latitude": 40.23, "longitude": -76.14},
            ]
        }
        place = geocoding.resolve_place("Denver, PA, USA")
        self.assertEqual(place.name, "Denver, PA")
        self.assertEqual(place.location, (-76.14, 40.23))
        self.assertEqual(get_json.call_args.kwargs["params"]["name"], "Denver")

    @patch("planner.services.geocoding.get_json", return_value={})
    def test_unknown_place_raises(self, _):
        with self.assertRaises(geocoding.GeocodingError):
            geocoding.resolve_place("Nowhere, ZZ")


@override_settings(TRUCK_MAX_SPEED_MPH=65)
class RouteParsingTests(SimpleTestCase):
    def test_truck_speed_is_capped(self):
        # ~69 miles per segment covered in 30 minutes by car (138 mph) is slowed to 65 mph.
        option = routing.parse_route(osrm_route([(0, 0), (0, 1), (0, 2)], seconds_per_segment=1800))
        hours = option.duration_seconds / 3600
        self.assertAlmostEqual(option.distance_miles / hours, 65, delta=0.1)

    def test_slower_car_time_is_kept(self):
        option = routing.parse_route(osrm_route([(0, 0), (0, 1)], seconds_per_segment=7200))
        self.assertEqual(option.duration_seconds, 7200)

    def test_road_summary_uses_longest_roads_in_driving_order(self):
        steps = [
            {"ref": "US 40", "name": "Colfax Avenue", "distance": 60_000},
            {"ref": "I 70;US 24", "name": "Dwight D. Eisenhower Highway", "distance": 500_000},
            {"ref": "", "name": "Main Street", "distance": 1_000},
            {"ref": "I 135", "name": "", "distance": 90_000},
            {"ref": "I 70", "name": "", "distance": 100_000},
        ]
        self.assertEqual(routing.road_summary([{"steps": steps}]), "US-40 · I-70 · I-135")
        self.assertEqual(routing.road_summary([{"steps": []}]), "Local roads")

    def test_road_summary_skips_short_city_streets(self):
        steps = [
            {"ref": "I 70", "name": "", "distance": 900_000},
            {"ref": "I 670", "name": "", "distance": 8_000},
            {"ref": "", "name": "West 12th Street", "distance": 2_000},
        ]
        self.assertEqual(routing.road_summary([{"steps": steps}]), "I-70")


class RouteOptionsTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    @patch("planner.services.routing.get_json")
    def test_adds_detours_until_three_distinct_routes(self, get_json):
        direct = osrm_route([(0, 0), (5, 0), (10, 0)], 3600)
        north = osrm_route([(0, 0), (5, 2), (10, 0)], 3600)
        south = osrm_route([(0, 0), (5, -2), (10, 0)], 3600)
        get_json.side_effect = [{"routes": [direct]}, {"routes": [north]}, {"routes": [direct]}, {"routes": [south]}]

        options = routing.fetch_route_options((0, 0), (10, 0))
        self.assertEqual(len(options), 3)
        self.assertEqual([option.coordinates[1] for option in options], [(5, 0), (5, 2), (5, -2)])

    @patch("planner.services.routing.get_json")
    def test_no_route_raises_routing_error(self, get_json):
        get_json.side_effect = UpstreamError("bad", status=400, payload={"code": "NoRoute"})
        with self.assertRaises(routing.RoutingError):
            routing.fetch_route_options((0, 0), (10, 0))


class ForecastTests(SimpleTestCase):
    start = datetime(2026, 10, 15, 8, tzinfo=UTC)

    def forecast(self):
        return weather.HourlyForecast(
            start=self.start,
            wind_mph=(10.0, 20.0, 30.0),
            rain_in=(0.0, 0.1, 0.4),
            snow_in=(0.0, 0.0, 0.0),
            cloud_pct=(10, 50, 90),
        )

    def test_wind_interpolates_and_rain_uses_containing_hour(self):
        conditions = self.forecast().conditions_at(self.start + timedelta(minutes=90))
        self.assertEqual(conditions.wind_mph, 25.0)
        self.assertEqual(conditions.rain_in_hr, 0.4)

    def test_outside_window_is_none(self):
        self.assertIsNone(self.forecast().conditions_at(self.start - timedelta(minutes=1)))
        self.assertIsNone(self.forecast().conditions_at(self.start + timedelta(hours=3)))

    def test_parse_forecast(self):
        parsed = weather.parse_forecast(
            {"time": ["2026-10-15T08:00"], "wind_speed_10m": [12.0], "rain": [0.0], "snowfall": [0.1], "cloud_cover": [40]}
        )
        self.assertEqual(parsed.start, self.start)
        self.assertEqual(parsed.snow_in, (0.1,))

    def test_departure_beyond_forecast_range_returns_none(self):
        far_future = datetime.now(UTC) + timedelta(days=30)
        self.assertEqual(weather.fetch_hourly_forecasts([(0, 0)], far_future, far_future), [None])
