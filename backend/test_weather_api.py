import unittest

import requests


class TestWeatherAPI(unittest.TestCase):
    def test_weather_api(self):
        url = "https://api.open-meteo.com/v1/forecast"

        params = {
            "latitude": 30.2672,
            "longitude": -97.7431,
            "hourly": "wind_speed_10m,rain,snowfall",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "forecast_days": 3,
            "timezone": "UTC",
        }

        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as exc:
            self.skipTest(f"Open-Meteo unavailable: {exc}")

        hourly = data.get("hourly", {})
        self.assertIn("time", hourly)
        self.assertIn("wind_speed_10m", hourly)
        self.assertIn("rain", hourly)
        self.assertIn("snowfall", hourly)
        self.assertGreater(len(hourly["time"]), 0)


if __name__ == "__main__":
    unittest.main()
