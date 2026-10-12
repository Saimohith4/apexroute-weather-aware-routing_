from math import isfinite
from typing import Any


RISK_SCORE = {
    "Low": 1,
    "Moderate": 2,
    "High": 3,
    "Severe": 4,
    "No Travel": 5,
}


def _validate_non_negative_finite(value: float, label: str) -> None:
    """Reject negative, NaN, and infinite measurements."""
    if not isfinite(value):
        raise ValueError(f"{label} must be a finite number.")
    if value < 0:
        raise ValueError(f"{label} cannot be negative.")


def classify_wind(wind_mph: float, load_lbs: float = 0) -> str:
    """Classify wind risk, including load-specific assessment rules."""
    _validate_non_negative_finite(wind_mph, "Wind speed")
    _validate_non_negative_finite(load_lbs, "Load weight")

    if wind_mph >= 55:
        return "No Travel"
    if wind_mph >= 45 and load_lbs > 30_000:
        return "No Travel"
    if wind_mph >= 35 and load_lbs > 40_000:
        return "Severe"
    if wind_mph >= 45:
        return "Severe"
    if wind_mph >= 35:
        return "High"
    if wind_mph >= 25:
        return "Moderate"
    return "Low"


def classify_rain(rain_in_per_hour: float) -> str:
    """Classify hourly rainfall intensity in inches per hour."""
    _validate_non_negative_finite(rain_in_per_hour, "Rainfall")

    if rain_in_per_hour > 1.00:
        return "No Travel"
    if rain_in_per_hour >= 0.50:
        return "Severe"
    if rain_in_per_hour >= 0.25:
        return "High"
    if rain_in_per_hour >= 0.10:
        return "Moderate"
    return "Low"


def classify_snow(snow_in_per_hour: float) -> str:
    """Classify hourly snowfall intensity in inches per hour."""
    _validate_non_negative_finite(snow_in_per_hour, "Snowfall")

    if snow_in_per_hour > 3.00:
        return "No Travel"
    if snow_in_per_hour >= 2.00:
        return "Severe"
    if snow_in_per_hour >= 1.00:
        return "High"
    if snow_in_per_hour >= 0.50:
        return "Moderate"
    return "Low"


def analyze_weather(
    wind_mph: float,
    rain_in_per_hour: float,
    snow_in_per_hour: float,
    load_lbs: float,
) -> dict[str, Any]:
    """Return individual weather risks and the highest overall risk."""
    wind_risk = classify_wind(wind_mph, load_lbs)
    rain_risk = classify_rain(rain_in_per_hour)
    snow_risk = classify_snow(snow_in_per_hour)

    risks = {
        "wind": wind_risk,
        "rain": rain_risk,
        "snow": snow_risk,
    }
    overall_risk = max(risks.values(), key=RISK_SCORE.__getitem__)

    return {
        "overall_risk": overall_risk,
        "risk_score": RISK_SCORE[overall_risk],
        "risks": risks,
        "no_travel": overall_risk == "No Travel",
    }


def rank_routes(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Rank routes by the assessment's priority:
    1. Fewest Severe miles
    2. Fewest High miles
    3. Lowest average risk score
    4. Shortest travel time

    Routes with incomplete weather coverage or any No Travel segments are
    placed after fully covered routes without No Travel segments. Within
    each group, the four assessment priorities determine the order.

    Required fields: severe_miles, high_miles, average_risk_score,
    duration_seconds. Optional fields: unknown_miles, no_travel_miles.
    """
    required_fields = (
        "severe_miles",
        "high_miles",
        "average_risk_score",
        "duration_seconds",
    )

    for index, route in enumerate(routes, start=1):
        for field in required_fields:
            if field not in route:
                raise ValueError(
                    f"Route {index} is missing required field: {field}"
                )

        for field in ("severe_miles", "high_miles", "duration_seconds"):
            value = route[field]
            if not isinstance(value, (int, float)) or not isfinite(value) or value < 0:
                raise ValueError(
                    f"Route {index} field '{field}' must be a finite, "
                    "non-negative number."
                )

        average = route["average_risk_score"]
        if average is not None and (
            not isinstance(average, (int, float))
            or not isfinite(average)
            or average < 0
        ):
            raise ValueError(
                f"Route {index} field 'average_risk_score' must be a "
                "finite, non-negative number or None."
            )

    return sorted(
        routes,
        key=lambda route: (
            route.get("no_travel_miles", 0) > 0,
            route.get("unknown_miles", 0) > 0,
            route["severe_miles"],
            route["high_miles"],
            (
                route["average_risk_score"]
                if route["average_risk_score"] is not None
                else float("inf")
            ),
            route["duration_seconds"],
        ),
    )
