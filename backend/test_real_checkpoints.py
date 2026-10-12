
import os
import django

# Initialize Django before importing services
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from routing.services import get_routes, generate_checkpoints

# Coordinates: [longitude, latitude]
origin = [-97.7431, 30.2672]
destination = [-97.5000, 30.2672]

routes = get_routes(origin, destination)

for route in routes:
    print(f"\nRoute {route['route_id']}")
    print(f"Distance: {route['distance_miles']:.2f} miles")

    checkpoints = generate_checkpoints(
        route["coordinates"],
        interval_miles=10,
    )

    print(f"Checkpoints: {len(checkpoints)}")

    for checkpoint in checkpoints:
        print(
            f"Mile {checkpoint['distance_miles']:.2f}: "
            f"({checkpoint['latitude']:.5f}, "
            f"{checkpoint['longitude']:.5f})"
        )
