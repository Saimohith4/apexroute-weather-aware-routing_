from datetime import datetime
import math

import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response


from .risk_engine import rank_routes
from .services import (
    RoutingProviderError,
    analyze_route,
    geocode_address,
    get_routes,
    search_location_suggestions,
)


@api_view(["GET"])
def health_check(request):
    return Response({
        "status": "success",
        "message": "Weather-Aware Truck Routing API is running!",
        "service": "Django REST Framework",
    })


@api_view(["GET"])
def location_suggestions_view(request):
    """Return location suggestions for autocomplete."""
    query = request.query_params.get("q", "").strip()

    if len(query) < 2:
        return Response({"suggestions": []})

    if len(query) > 200:
        return Response(
            {"error": "Search query must be 200 characters or fewer."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        suggestions = search_location_suggestions(query)
        return Response({"suggestions": suggestions})
    except RoutingProviderError as error:
        return Response(
            {"error": str(error)},
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(["POST"])
def analyze_route_view(request):
    """Analyze routes using weather conditions and truck safety rules."""
    origin_address = request.data.get("origin")
    destination_address = request.data.get("destination")
    departure_text = request.data.get("departure_time")
    raw_load_lbs = request.data.get("load_lbs")
    raw_interval = request.data.get("interval_miles", 10)

    if not all(
        isinstance(value, str) and value.strip()
        for value in (origin_address, destination_address, departure_text)
    ):
        return Response(
            {"error": "origin, destination, and departure_time are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        load_lbs = float(raw_load_lbs)
        if not math.isfinite(load_lbs) or not 0 <= load_lbs <= 100_000:
            raise ValueError("Load must be between 0 and 100,000 lb.")

        if isinstance(raw_interval, bool):
            raise ValueError("interval_miles must be 10, 25, or 50.")

        if str(raw_interval).strip() not in {"10", "25", "50"}:
            raise ValueError("interval_miles must be 10, 25, or 50.")

        interval_miles = int(raw_interval)

        departure_time = datetime.fromisoformat(
            departure_text.strip().replace("Z", "+00:00")
        )

        if departure_time.tzinfo is None or departure_time.utcoffset() is None:
            raise ValueError("departure_time must include a timezone offset.")

    except (TypeError, ValueError, OverflowError) as error:
        return Response(
            {"error": f"Invalid input: {error}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        origin = geocode_address(origin_address.strip())
        destination = geocode_address(destination_address.strip())

        origin_coordinates = [
            origin["longitude"],
            origin["latitude"],
        ]
        destination_coordinates = [
            destination["longitude"],
            destination["latitude"],
        ]

        routes = get_routes(origin_coordinates, destination_coordinates)

        if not routes:
            return Response(
                {"error": "The routing provider returned no routes."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        analyzed_routes = []

        for route in routes:
            result = analyze_route(
                route=route,
                interval_miles=interval_miles,
                departure_time=departure_time,
                load_lbs=load_lbs,
            )
            result["route_id"] = route["route_id"]
            result["coordinates"] = route["coordinates"]
            analyzed_routes.append(result)

        analyzed_routes = rank_routes(analyzed_routes)

        for position, route in enumerate(analyzed_routes, start=1):
            route["recommendation_rank"] = position

        def route_has_no_travel(route):
            if route.get("no_travel_miles", 0) > 0:
                return True

            for checkpoint in route.get("checkpoints", []):
                risk_data = checkpoint.get("risk") or {}
                overall_risk = (
                    risk_data.get("overall_risk")
                    if isinstance(risk_data, dict)
                    else None
                ) or checkpoint.get("overall_risk")

                if overall_risk == "No Travel":
                    return True

                if (
                    isinstance(risk_data, dict)
                    and risk_data.get("no_travel") is True
                ):
                    return True

            return False

        recommended_route = next(
            (
                route for route in analyzed_routes
                if route.get("unknown_miles", 0) == 0
                and not route_has_no_travel(route)
                and route.get("average_risk_score") is not None
            ),
            None,
        )

        if recommended_route:
            message = "Analysis complete."
            recommended_route_id = recommended_route["route_id"]
        else:
            message = (
                "No route meets the current recommendation safety checks: "
                "weather coverage may be incomplete or routes may contain "
                "No Travel conditions."
            )
            recommended_route_id = None

        return Response({
            "status": "success",
            "origin": origin,
            "destination": destination,
            "departure_time": departure_time.isoformat(),
            "load_lbs": load_lbs,
            "interval_miles": interval_miles,
            "routes": analyzed_routes,
            "recommended_route_id": recommended_route_id,
            "message": message,
        })

    except requests.RequestException:
        return Response(
            {
                "error": (
                    "A routing or weather provider request failed. "
                    "Please try again."
                )
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except RoutingProviderError as error:
        return Response(
            {"error": str(error)},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except (RuntimeError, ValueError, KeyError) as error:
        return Response(
            {"error": str(error)},
            status=(
                status.HTTP_502_BAD_GATEWAY
                if isinstance(error, RuntimeError)
                else status.HTTP_400_BAD_REQUEST
            ),
        )
