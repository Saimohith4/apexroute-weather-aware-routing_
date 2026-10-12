
import os
import requests
from dotenv import load_dotenv

load_dotenv(".env")

api_key = os.getenv("OPENROUTESERVICE_API_KEY")

if not api_key:
    raise RuntimeError(
        "API key missing. Check backend/.env"
    )

url = (
    "https://api.openrouteservice.org/v2/directions/"
    "driving-hgv/geojson"
)

# Example trip: Austin to Dallas, Texas.
# Coordinates must be [longitude, latitude].
payload = {
    "coordinates": [
        [-97.7431, 30.2672],
        [-97.5000, 30.2672],
    ],
    "alternative_routes": {
        "target_count": 3,
        "weight_factor": 1.4,
        "share_factor": 0.6,
    },
}

response = requests.post(
    url,
    headers={
        "Authorization": api_key,
        "Content-Type": "application/json",
    },
    json=payload,
    timeout=30,
)

print("HTTP status:", response.status_code)

if not response.ok:
    print("API response:", response.text[:1500])
    response.raise_for_status()

data = response.json()
features = data.get("features", [])

print("Routes returned:", len(features))

for index, feature in enumerate(features, start=1):
    properties = feature.get("properties", {})
    summary = properties.get("summary", {})

    distance_m = summary.get("distance", 0)
    duration_s = summary.get("duration", 0)

    print(f"\nRoute {index}")
    print(f"Distance: {distance_m / 1609.344:.1f} miles")
    print(f"Duration: {duration_s / 3600:.2f} hours")
    print(
        "Coordinates:",
        len(feature.get("geometry", {}).get("coordinates", [])),
    )
