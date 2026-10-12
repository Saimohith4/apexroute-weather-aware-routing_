from datetime import datetime, timezone
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase

from .services import analyze_route, generate_checkpoints


class CheckpointGenerationTests(SimpleTestCase):
    def test_generates_checkpoints_at_selected_interval(self):
        coordinates = [[0.0, 0.0], [0.45, 0.0]]
        checkpoints = generate_checkpoints(coordinates, 10)
        distances = [point["distance_miles"] for point in checkpoints]

        self.assertEqual(distances[0], 0.0)
        self.assertAlmostEqual(distances[1], 10.0, delta=0.1)
        self.assertAlmostEqual(distances[2], 20.0, delta=0.1)
        self.assertAlmostEqual(distances[-1], 31.0, delta=1.0)

    def test_rejects_invalid_interval(self):
        with self.assertRaises(ValueError):
            generate_checkpoints([[0.0, 0.0], [0.1, 0.0]], 15)


class RouteWeatherIntegrationTests(SimpleTestCase):
    def setUp(self):
        self.route = {
            "route_id": 1,
            "distance_miles": 20.0,
            "duration_seconds": 3600,
            "coordinates": [[0.0, 0.0], [0.3, 0.0]],
        }
        self.departure = datetime(2026, 10, 10, 16, tzinfo=timezone.utc)

    @patch("routing.services.get_checkpoint_weather")
    def test_missing_weather_is_marked_unknown(self, mock_weather):
        mock_weather.return_value = None
        result = analyze_route(
            route=self.route,
            interval_miles=10,
            departure_time=self.departure,
            load_lbs=25000,
        )

        self.assertTrue(all(not point["data_available"] for point in result["checkpoints"]))
        self.assertGreater(result["unknown_miles"], 0)
        self.assertEqual(result["weather_coverage_percent"], 0)
        self.assertIsNone(result["average_risk_score"])

    @patch("routing.services.get_checkpoint_weather")
    def test_forecast_samples_receive_risk_classification(self, mock_weather):
        mock_weather.return_value = {
            "wind_mph": 10.0,
            "rain_inches": 0.0,
            "snowfall_inches": 0.0,
            "forecast_hours": [
                {
                    "hour": 0,
                    "forecast_time": "2026-10-10T16:00:00+00:00",
                    "wind_mph": 10.0,
                    "rain_inches": 0.0,
                    "snowfall_inches": 0.0,
                },
                {
                    "hour": 1,
                    "forecast_time": "2026-10-10T17:00:00+00:00",
                    "wind_mph": 56.0,
                    "rain_inches": 0.0,
                    "snowfall_inches": 0.0,
                },
            ],
        }
        result = analyze_route(
            route=self.route,
            interval_miles=10,
            departure_time=self.departure,
            load_lbs=25000,
        )

        samples = result["checkpoints"][0]["forecast_hours"]
        self.assertEqual(samples[0]["risk"]["overall_risk"], "Low")
        self.assertEqual(samples[1]["risk"]["overall_risk"], "No Travel")


class WeatherUnitConversionTests(SimpleTestCase):
    def setUp(self):
        # Each mocked API response must be tested independently of cached weather.
        cache.clear()

    @patch("routing.services.requests.get")
    def test_snowfall_centimeters_are_converted_to_inches(self, mock_get):
        from routing.services import get_checkpoint_weather

        mock_get.return_value.status_code = 200
        mock_get.return_value.raise_for_status.return_value = None
        mock_get.return_value.json.return_value = {
            "hourly_units": {
                "wind_speed_10m": "mph",
                "rain": "inch",
                "snowfall": "cm",
            },
            "hourly": {
                "time": ["2026-10-10T16:00"],
                "wind_speed_10m": [10],
                "rain": [0.1],
                "snowfall": [2.54],
            },
        }
        result = get_checkpoint_weather(
            30.3,
            -97.7,
            datetime(2026, 10, 10, 16, tzinfo=timezone.utc),
        )

        self.assertIsNotNone(result)
        self.assertAlmostEqual(result["snowfall_inches"], 1.0)
        self.assertAlmostEqual(result["rain_inches"], 0.1)
        self.assertAlmostEqual(result["wind_mph"], 10.0)

    @patch("routing.services.requests.get")
    def test_wind_kmh_is_converted_to_mph(self, mock_get):
        from routing.services import get_checkpoint_weather

        mock_get.return_value.status_code = 200
        mock_get.return_value.raise_for_status.return_value = None
        mock_get.return_value.json.return_value = {
            "hourly_units": {
                "wind_speed_10m": "km/h",
                "rain": "mm",
                "snowfall": "mm",
            },
            "hourly": {
                "time": ["2026-10-10T16:00"],
                "wind_speed_10m": [16.09344],
                "rain": [25.4],
                "snowfall": [25.4],
            },
        }
        result = get_checkpoint_weather(
            30.3,
            -97.7,
            datetime(2026, 10, 10, 16, tzinfo=timezone.utc),
        )

        self.assertIsNotNone(result)
        self.assertAlmostEqual(result["wind_mph"], 10.0, places=4)
        self.assertAlmostEqual(result["rain_inches"], 1.0)
        self.assertAlmostEqual(result["snowfall_inches"], 1.0)
