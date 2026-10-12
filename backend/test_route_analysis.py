
import os
import django
from datetime import datetime, timezone

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from routing.services import get_routes, analyze_route

origin = [-97.7431, 30.2672]
destination = [-97.5000, 30.2672]

# Use a UTC departure time within the available forecast window.
departure = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

routes = get_routes(origin, destination)

for route in routes:
    print(f"\nAnalyzing route {route['route_id']}")

    result = analyze_route(
        route=route,
        interval_miles=10,
        departure_time=departure,
        load_lbs=25000,
    )

    print("Distance:", round(result["distance_miles"], 2), "miles")
    print("Duration:", round(result["duration_seconds"] / 60, 1), "minutes")
    print("Severe-risk miles:", result["severe_miles"])
    print("High-risk miles:", result["high_miles"])
    print("Average risk score:", result["average_risk_score"])
    print("Weather coverage:", result["weather_coverage_percent"], "%")
    print("Unknown miles:", result["unknown_miles"])

    for checkpoint in result["checkpoints"]:
        print({
            "mile": checkpoint["distance_miles"],
            "eta": checkpoint["eta"],
            "weather": checkpoint["weather"],
            "risk": checkpoint["risk"],
            "data_available": checkpoint["data_available"],
        })
