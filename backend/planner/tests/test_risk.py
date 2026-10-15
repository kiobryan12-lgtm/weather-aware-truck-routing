from django.test import SimpleTestCase

from planner.services.risk import (
    HIGH,
    LOW,
    MODERATE,
    NO_TRAVEL,
    SEVERE,
    UNKNOWN,
    Conditions,
    classify_rain,
    classify_snow,
    classify_wind,
    evaluate_checkpoint,
    rank_routes,
    summarize_risk,
)


class ThresholdTests(SimpleTestCase):
    def assert_bands(self, classify, cases):
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(classify(value), expected)

    def test_wind_bands(self):
        self.assert_bands(
            classify_wind,
            [(0, LOW), (24.9, LOW), (25, MODERATE), (34.9, MODERATE), (35, HIGH), (44.9, HIGH),
             (45, SEVERE), (54.9, SEVERE), (55, NO_TRAVEL), (80, NO_TRAVEL)],
        )

    def test_rain_bands(self):
        self.assert_bands(
            classify_rain,
            [(0, LOW), (0.09, LOW), (0.10, MODERATE), (0.24, MODERATE), (0.25, HIGH), (0.49, HIGH),
             (0.50, SEVERE), (1.00, SEVERE), (1.01, NO_TRAVEL)],
        )

    def test_snow_bands(self):
        self.assert_bands(
            classify_snow,
            [(0, LOW), (0.49, LOW), (0.5, MODERATE), (0.99, MODERATE), (1.0, HIGH), (1.99, HIGH),
             (2.0, SEVERE), (3.0, SEVERE), (3.01, NO_TRAVEL)],
        )


def conditions(wind=10.0, rain=0.0, snow=0.0) -> Conditions:
    return Conditions(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow)


class CheckpointEvaluationTests(SimpleTestCase):
    def test_overall_risk_is_the_worst_condition(self):
        result = evaluate_checkpoint(conditions(wind=30, rain=0.3, snow=0.6), load_lb=10_000)
        self.assertEqual(result.risk, HIGH)
        self.assertEqual(result.condition_risk, {"wind": MODERATE, "rain": HIGH, "snow": MODERATE})
        self.assertEqual(result.reasons, ["Rain rate 0.30 in/hr falls in High range (0.25–0.50 in/hr)."])

    def test_wind_of_55_is_no_travel_for_any_load(self):
        self.assertEqual(evaluate_checkpoint(conditions(wind=55), load_lb=0).risk, NO_TRAVEL)

    def test_severe_wind_with_heavy_load_is_no_travel(self):
        self.assertEqual(evaluate_checkpoint(conditions(wind=50), load_lb=30_000).risk, SEVERE)
        result = evaluate_checkpoint(conditions(wind=50), load_lb=30_001)
        self.assertEqual(result.risk, NO_TRAVEL)
        self.assertTrue(result.load_adjusted)
        self.assertIn("over 30,000 lb", result.reasons[-1])

    def test_high_wind_with_very_heavy_load_is_severe(self):
        self.assertEqual(evaluate_checkpoint(conditions(wind=40), load_lb=40_000).risk, HIGH)
        result = evaluate_checkpoint(conditions(wind=40), load_lb=40_001)
        self.assertEqual(result.risk, SEVERE)
        self.assertTrue(result.load_adjusted)

    def test_load_rules_never_lower_risk(self):
        result = evaluate_checkpoint(conditions(wind=40, rain=1.5), load_lb=45_000)
        self.assertEqual(result.risk, NO_TRAVEL)
        self.assertFalse(result.load_adjusted)

    def test_low_risk_has_a_single_reason(self):
        result = evaluate_checkpoint(conditions(), load_lb=35_000)
        self.assertEqual(result.risk, LOW)
        self.assertEqual(len(result.reasons), 1)


class SummaryTests(SimpleTestCase):
    def test_miles_and_distance_weighted_average(self):
        summary = summarize_risk([(30, LOW), (10, SEVERE), (10, UNKNOWN)])
        self.assertEqual(summary["miles_by_level"][LOW], 30)
        self.assertEqual(summary["miles_by_level"][SEVERE], 10)
        self.assertEqual(summary["miles_by_level"][UNKNOWN], 10)
        self.assertEqual(summary["average_risk"], 0.75)

    def test_average_is_none_without_forecast_data(self):
        self.assertIsNone(summarize_risk([(20, UNKNOWN)])["average_risk"])


def route(route_id, severe=0.0, high=0.0, average=1.0, duration=600, no_travel=0.0):
    miles = dict.fromkeys([LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL, UNKNOWN], 0.0)
    miles.update({SEVERE: severe, HIGH: high, NO_TRAVEL: no_travel})
    return {
        "id": route_id,
        "label": route_id,
        "duration_min": duration,
        "risk_summary": {"miles_by_level": miles, "average_risk": average},
    }


class RankingTests(SimpleTestCase):
    def test_fewest_severe_miles_wins_first(self):
        routes = [route("1", severe=45, high=0), route("2", severe=0, high=120), route("3", severe=60)]
        recommendation = rank_routes(routes)
        self.assertEqual(recommendation["route_id"], "2")
        self.assertEqual([r["rank"] for r in routes], [2, 1, 3])
        self.assertIn("fewest Severe miles", recommendation["reason"])

    def test_high_miles_break_severe_ties(self):
        routes = [route("1", high=50), route("2", high=20)]
        self.assertEqual(rank_routes(routes)["route_id"], "2")

    def test_average_risk_then_travel_time_break_ties(self):
        self.assertEqual(rank_routes([route("1", average=1.4), route("2", average=1.2)])["route_id"], "2")
        recommendation = rank_routes([route("1", duration=700), route("2", duration=650)])
        self.assertEqual(recommendation["route_id"], "2")
        self.assertIn("fastest", recommendation["reason"])

    def test_no_travel_routes_are_never_recommended(self):
        routes = [route("1", no_travel=10), route("2", severe=80)]
        recommendation = rank_routes(routes)
        self.assertEqual(recommendation["route_id"], "2")
        self.assertFalse(routes[0]["eligible"])
        self.assertIsNone(routes[0]["rank"])
        self.assertIn("No Travel", routes[0]["ineligible_reason"])

    def test_no_recommendation_when_every_route_is_no_travel(self):
        recommendation = rank_routes([route("1", no_travel=5), route("2", no_travel=25)])
        self.assertIsNone(recommendation["route_id"])
        self.assertIn("Every route", recommendation["reason"])

    def test_routes_without_forecast_are_ineligible(self):
        recommendation = rank_routes([route("1", average=None)])
        self.assertIsNone(recommendation["route_id"])
        self.assertIn("unavailable", recommendation["reason"])
