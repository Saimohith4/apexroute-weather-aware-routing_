import os
import sys
from pathlib import Path

# Ensure Django can find config.settings when this script is run directly.
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from routing.services import geocode_address
from routing.services import RoutingProviderError


def main():
    addresses = [
        "Austin, Texas, USA",
        "Dallas, Texas, USA",
    ]

    for address in addresses:
        print(f"\nSearching: {address}")

        try:
            result = geocode_address(address)

            print("Matched address:", result["address"])
            print("Longitude:", result["longitude"])
            print("Latitude:", result["latitude"])

        except (RoutingProviderError, ValueError) as error:
            print(f"Geocoding failed: {error}")

        except Exception as error:
            print(
                f"Unexpected error for {address}: "
                f"{type(error).__name__}: {error}"
            )


if __name__ == "__main__":
    main()
