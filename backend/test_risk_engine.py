
from django.test import SimpleTestCase

from routing.risk_engine import (
    analyze_weather,
    classify_rain,
    classify_snow,
    classify_wind,
    rank_routes,
)


class WindRiskTests(SimpleTestCase):
    def test_wind_thresholds(self):
        cases = [
            (0, "Low"),
            (24.99, "Low"),
            (25, "Moderate"),
            (34.99, "Moderate"),
            (35, "High"),
            (44.99, "High"),
            (45, "Severe"),
            (54.99, "Severe"),
            (55, "No Travel"),
            (70, "No Travel"),
        ]
        for wind, expected in cases:
            with self.subTest(wind=wind):
                self.assertEqual(classify_wind(wind), expected)

    def test_load_specific_wind_rules(self):
        self.assertEqual(classify_wind(45, 30000), "Severe")
        self.assertEqual(classify_wind(45, 30000.01), "No Travel")
        self.assertEqual(classify_wind(54, 40000), "No Travel")
        self.assertEqual(classify_wind(35, 40000), "High")
        self.assertEqual(classify_wind(35, 40000.01), "Severe")
        self.assertEqual(classify_wind(44, 40000.01), "Severe")
        self.assertEqual(classify_wind(55, 0), "No Travel")

    def test_negative_or_non_finite_wind_is_rejected(self):
        for value in (-1, float("nan"), float("inf")):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    classify_wind(value)


class RainRiskTests(SimpleTestCase):
    def test_rainfall_thresholds(self):
        cases = [
            (0, "Low"),
            (0.0999, "Low"),
            (0.10, "Moderate"),
            (0.2499, "Moderate"),
            (0.25, "High"),
            (0.4999, "High"),
            (0.50, "Severe"),
            (1.00, "Severe"),
            (1.0001, "No Travel"),
            (2.0, "No Travel"),
        ]
        for rainfall, expected in cases:
            with self.subTest(rainfall=rainfall):
                self.assertEqual(classify_rain(rainfall), expected)

    def test_negative_or_non_finite_rain_is_rejected(self):
        for value in (-1, float("nan"), float("inf")):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    classify_rain(value)


class SnowRiskTests(SimpleTestCase):
    def test_snowfall_thresholds(self):
        cases = [
            (0, "Low"),
            (0.4999, "Low"),
            (0.50, "Moderate"),
            (0.9999, "Moderate"),
            (1.00, "High"),
            (1.9999, "High"),
            (2.00, "Severe"),
            (3.00, "Severe"),
            (3.0001, "No Travel"),
            (4.0, "No Travel"),
        ]
        for snowfall, expected in cases:
            with self.subTest(snowfall=snowfall):
                self.assertEqual(classify_snow(snowfall), expected)

    def test_negative_or_non_finite_snow_is_rejected(self):
        for value in (-1, float("nan"), float("inf")):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    classify_snow(value)


class CombinedWeatherRiskTests(SimpleTestCase):
    def test_overall_risk_is_the_highest_weather_risk(self):
        result = analyze_weather(
            wind_mph=10,
            rain_in_per_hour=0.30,
            snow_in_per_hour=0,
            load_lbs=25000,
        )
        self.assertEqual(result["overall_risk"], "High")
        self.assertEqual(result["risks"]["rain"], "High")
        self.assertFalse(result["no_travel"])

    def test_no_travel_from_wind_is_preserved(self):
        result = analyze_weather(
            wind_mph=55,
            rain_in_per_hour=0,
            snow_in_per_hour=0,
            load_lbs=25000,
        )
        self.assertEqual(result["overall_risk"], "No Travel")
        self.assertTrue(result["no_travel"])


class RouteRankingTests(SimpleTestCase):
    def make_route(
        self,
        route_id,
        severe=0,
        high=0,
        average=1,
        duration=1000,
        no_travel=0,
        unknown=0,
    ):
        return {
            "route_id": route_id,
            "severe_miles": severe,
            "high_miles": high,
            "average_risk_score": average,
            "duration_seconds": duration,
            "no_travel_miles": no_travel,
            "unknown_miles": unknown,
        }

    def test_ranking_uses_assessment_priorities(self):
        routes = [
            self.make_route(1, severe=2, high=0, average=1, duration=500),
            self.make_route(2, severe=0, high=3, average=2, duration=700),
            self.make_route(3, severe=0, high=1, average=2, duration=900),
            self.make_route(4, severe=0, high=1, average=1, duration=1200),
            self.make_route(5, severe=0, high=1, average=1, duration=800),
        ]

        ranked = rank_routes(routes)
        self.assertEqual(
            [route["route_id"] for route in ranked],
            [5, 4, 3, 2, 1],
        )

    def test_no_travel_routes_rank_after_safe_routes(self):
        unsafe = self.make_route(
            1, severe=0, high=0, average=1, no_travel=5
        )
        safe = self.make_route(2, severe=2, high=0, average=3)

        ranked = rank_routes([unsafe, safe])
        self.assertEqual([route["route_id"] for route in ranked], [2, 1])

    def test_incomplete_coverage_ranks_after_complete_coverage(self):
        incomplete = self.make_route(1, unknown=5)
        complete = self.make_route(2)

        ranked = rank_routes([incomplete, complete])
        self.assertEqual([route["route_id"] for route in ranked], [2, 1])

    def test_missing_required_metric_is_rejected(self):
        with self.assertRaises(ValueError):
            rank_routes([{"route_id": 1}])
