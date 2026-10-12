
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from .risk_engine import (
    analyze_weather,
    classify_rain,
    classify_snow,
    classify_wind,
    rank_routes,
)
from .views import analyze_route_view


class WindRiskTests(SimpleTestCase):
   
    def test_wind_thresholds(self):
        cases = [
            (24.9, "Low"),
            (25, "Moderate"),
            (34.9, "Moderate"),
            (35, "High"),
            (44.9, "High"),
            (45, "Severe"),
            (54.9, "Severe"),
            (55, "No Travel"),
        ]

        for wind, expected in cases:
            with self.subTest(wind=wind):
                self.assertEqual(classify_wind(wind), expected)

    def test_heavy_load_rules(self):
        self.assertEqual(classify_wind(45, 30001), "No Travel")
        self.assertEqual(classify_wind(44, 40001), "Severe")
        self.assertEqual(classify_wind(35, 40001), "Severe")
        self.assertEqual(classify_wind(55, 10000), "No Travel")

    def test_load_boundaries(self):
        # At exactly 30,000 lb, the extra No Travel rule does not apply.
        self.assertEqual(classify_wind(45, 30000), "Severe")

        # Above 30,000 lb, 45 mph becomes No Travel.
        self.assertEqual(classify_wind(45, 30001), "No Travel")

        # At exactly 40,000 lb, the extra Severe rule does not apply.
        self.assertEqual(classify_wind(35, 40000), "High")

        # Above 40,000 lb, 35 mph becomes Severe.
        self.assertEqual(classify_wind(35, 40001), "Severe")



class RainRiskTests(SimpleTestCase):
    def test_rain_thresholds(self):
        cases = [
            (0.099, "Low"),
            (0.10, "Moderate"),
            (0.25, "High"),
            (0.50, "Severe"),
            (1.00, "Severe"),
            (1.001, "No Travel"),
        ]
        for rain, expected in cases:
            with self.subTest(rain=rain):
                self.assertEqual(classify_rain(rain), expected)


class SnowRiskTests(SimpleTestCase):
    def test_snow_thresholds(self):
        cases = [
            (0.499, "Low"),
            (0.50, "Moderate"),
            (1.00, "High"),
            (2.00, "Severe"),
            (3.00, "Severe"),
            (3.001, "No Travel"),
        ]
        for snow, expected in cases:
            with self.subTest(snow=snow):
                self.assertEqual(classify_snow(snow), expected)

    def test_fewer_high_miles_have_priority(self):
        routes = [
            {
                "route_id": 1,
                "severe_miles": 0,
                "high_miles": 5,
                "average_risk_score": 1,
                "duration_seconds": 600,
            },
            {
                "route_id": 2,
                "severe_miles": 0,
                "high_miles": 2,
                "average_risk_score": 2,
                "duration_seconds": 900,
            },
        ]

        self.assertEqual(rank_routes(routes)[0]["route_id"], 2)



class OverallRiskTests(SimpleTestCase):
    def test_highest_weather_risk_wins(self):
        result = analyze_weather(10, 0, 3.1, 25000)
        self.assertEqual(result["overall_risk"], "No Travel")
        self.assertTrue(result["no_travel"])

    def test_negative_values_are_rejected(self):
        with self.assertRaises(ValueError):
            classify_wind(-1)
        with self.assertRaises(ValueError):
            classify_rain(-0.1)
        with self.assertRaises(ValueError):
            classify_snow(-0.1)


class RouteRankingTests(SimpleTestCase):
    def test_severe_miles_have_priority(self):
        routes = [
            {
                "route_id": 2,
                "severe_miles": 1,
                "high_miles": 0,
                "average_risk_score": 1,
                "duration_seconds": 600,
            },
            {
                "route_id": 1,
                "severe_miles": 0,
                "high_miles": 5,
                "average_risk_score": 2,
                "duration_seconds": 900,
            },
        ]
        self.assertEqual(rank_routes(routes)[0]["route_id"], 1)

    def test_shorter_time_breaks_tie(self):
        routes = [
            {
                "route_id": 1,
                "severe_miles": 0,
                "high_miles": 0,
                "average_risk_score": 1,
                "duration_seconds": 900,
            },
            {
                "route_id": 2,
                "severe_miles": 0,
                "high_miles": 0,
                "average_risk_score": 1,
                "duration_seconds": 600,
            },
        ]
        self.assertEqual(rank_routes(routes)[0]["route_id"], 2)


def make_route(route_id, risk="Low", unknown_miles=0):
    risk_scores = {
        "Low": 1,
        "Moderate": 2,
        "High": 3,
        "Severe": 4,
        "No Travel": 5,
    }
    return {
        "route_id": route_id,
        "distance_miles": 20.0,
        "duration_seconds": 1200,
        "coordinates": [[-97.7, 30.3], [-97.6, 30.2]],
        "checkpoints": [{
            "distance_miles": 0,
            "data_available": risk is not None,
            "risk": (
                {
                    "overall_risk": risk,
                    "risk_score": risk_scores[risk],
                    "no_travel": risk == "No Travel",
                }
                if risk is not None else None
            ),
        }],
        "severe_miles": 10.0 if risk in ("Severe", "No Travel") else 0.0,
        "high_miles": 10.0 if risk == "High" else 0.0,
        "no_travel_miles": 10.0 if risk == "No Travel" else 0.0,
        "unknown_miles": unknown_miles,
        "average_risk_score": (
            None if risk is None else risk_scores[risk]
        ),
        "weather_coverage_percent": 0 if unknown_miles else 100,
    }


class AnalyzeRouteRecommendationTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.payload = {
            "origin": "Austin, Texas, USA",
            "destination": "Mueller Lake Park, Austin, Texas, USA",
            "departure_time": "2026-10-10T16:00:00-05:00",
            "load_lbs": 25000,
            "interval_miles": 10,
        }
        self.origin = {
            "address": "Austin, Texas, USA",
            "longitude": -97.7,
            "latitude": 30.3,
        }
        self.destination = {
            "address": "Mueller Lake Park, Austin, Texas, USA",
            "longitude": -97.6,
            "latitude": 30.2,
        }

    def call_view(self, routes):
        request = self.factory.post(
            "/api/analyze-route/", self.payload, format="json"
        )
        route_data = [
            {
                "route_id": route["route_id"],
                "distance_miles": route["distance_miles"],
                "duration_seconds": route["duration_seconds"],
                "coordinates": route["coordinates"],
            }
            for route in routes
        ]
        with (
            patch(
                "routing.views.geocode_address",
                side_effect=[self.origin, self.destination],
            ),
            patch("routing.views.get_routes", return_value=route_data),
            patch("routing.views.analyze_route", side_effect=routes),
        ):
            return analyze_route_view(request)

    def test_recommends_safe_route(self):
        response = self.call_view([make_route(1)])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["recommended_route_id"], 1)

    def test_rejects_no_travel_route(self):
        response = self.call_view([make_route(1, "No Travel")])
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["recommended_route_id"])

    def test_rejects_incomplete_weather(self):
        response = self.call_view([
            make_route(1, None, unknown_miles=5)
        ])
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["recommended_route_id"])

    def test_selects_safe_route_over_no_travel_route(self):
        response = self.call_view([
            make_route(1, "No Travel"),
            make_route(2, "Low"),
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["recommended_route_id"], 2)
