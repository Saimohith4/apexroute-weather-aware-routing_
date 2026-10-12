import logging
import math
import time
from datetime import datetime, timedelta, timezone
import requests
from django.conf import settings
from django.core.cache import cache
from .risk_engine import analyze_weather
logger = logging.getLogger(__name__)
ORS_DIRECTIONS_URL = (
    "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson"
)
ORS_GEOCODE_URL = "https://api.openrouteservice.org/geocode/search"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
CONNECT_TIMEOUT = 8
READ_TIMEOUT = 30
class RoutingProviderError(RuntimeError):
    """A routing provider request failed with a useful safe-to-display message."""
def _ors_api_key():
    api_key = getattr(settings, "OPENROUTESERVICE_API_KEY", None)
    if not api_key:
        raise RoutingProviderError(
            "OpenRouteService API key is not configured. Check backend/.env "
            "and restart Django."
        )
    return api_key
def geocode_address(address):
    """Convert an address/place name to an ORS [longitude, latitude] point."""
    if not isinstance(address, str) or not address.strip():
        raise ValueError("Please provide a valid origin or destination.")
    response = requests.get(
        ORS_GEOCODE_URL,
        params={
            "api_key": _ors_api_key(),
            "text": address.strip(),
            "size": 1,
        },
        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
    )
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        logger.error(
            "ORS geocoding failed: HTTP %s; response=%s",
            response.status_code,
            response.text[:1500],
        )
        if response.status_code in (401, 403):
            message = (
                "The location provider rejected the API key or permissions. "
                "Check the OpenRouteService key and enabled services."
            )
        elif response.status_code == 429:
            message = "The location provider request limit was reached. Please try again later."
        else:
            message = (
                "The location provider could not resolve this address. "
                "Check the address and provider response in the Django terminal."
            )
        raise RoutingProviderError(message) from exc
    except requests.RequestException as exc:
        raise RoutingProviderError(
            "The location search service could not be reached. Please try again."
        ) from exc
    try:
        features = response.json().get("features", [])
        if not features:
            raise ValueError(f"No location found for: {address}")
        feature = features[0]
        longitude, latitude = feature["geometry"]["coordinates"]
        return {
            "address": feature.get("properties", {}).get("label", address.strip()),
            "longitude": float(longitude),
            "latitude": float(latitude),
        }
    except (ValueError, TypeError, KeyError, IndexError) as exc:
        if isinstance(exc, ValueError) and str(exc).startswith("No location found"):
            raise
        raise RoutingProviderError(
            "The location search provider returned an invalid response."
        ) from exc
def search_location_suggestions(query):
    """Return matching locations for autocomplete."""
    if not isinstance(query, str) or len(query.strip()) < 2:
        return []
    try:
        response = requests.get(
            ORS_GEOCODE_URL,
            params={
                "api_key": _ors_api_key(),
                "text": query.strip(),
                "size": 6,
            },
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )
        response.raise_for_status()
        features = response.json().get("features", [])
    except requests.HTTPError as exc:
        logger.error(
            "ORS location suggestions failed: HTTP %s; response=%s",
            response.status_code,
            response.text[:1500],
        )
        if response.status_code in (401, 403):
            message = "The location provider rejected the API key or permissions."
        elif response.status_code == 429:
            message = "The location provider request limit was reached. Try again later."
        else:
            message = "Location suggestions are temporarily unavailable. Check the Django terminal."
        raise RoutingProviderError(message) from exc
    except requests.RequestException as exc:
        logger.warning("ORS location suggestions request failed: %s", str(exc)[:300])
        raise RoutingProviderError(
            "Location suggestions are temporarily unavailable. Please try again."
        ) from exc
    except (ValueError, TypeError, AttributeError) as exc:
        raise RoutingProviderError(
            "The location search provider returned an invalid response."
        ) from exc
    suggestions = []
    for feature in features:
        properties = feature.get("properties", {})
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        label = properties.get("label")
        if not label or len(coordinates) < 2:
            continue
        try:
            longitude = float(coordinates[0])
            latitude = float(coordinates[1])
        except (TypeError, ValueError):
            continue
        suggestions.append({
            "label": label,
            "longitude": longitude,
            "latitude": latitude,
            "type": properties.get("layer", "location"),
        })
    return suggestions
def haversine_miles(point_a, point_b):
    """Calculate distance between [longitude, latitude] points."""
    lon1, lat1 = map(math.radians, point_a)
    lon2, lat2 = map(math.radians, point_b)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    a = min(1.0, max(0.0, a))
    return 3958.7613 * 2 * math.asin(math.sqrt(a))
def interpolate_point(start, end, fraction):
    """Interpolate a point between [longitude, latitude] coordinates."""
    return [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
    ]
def generate_checkpoints(coordinates, interval_miles):
    """Sample route geometry at 10, 25, or 50 mile intervals."""
    if interval_miles not in (10, 25, 50):
        raise ValueError("Interval must be 10, 25, or 50 miles.")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        raise ValueError("The route must contain at least two coordinates.")
    checkpoints = [{
        "distance_miles": 0.0,
        "longitude": coordinates[0][0],
        "latitude": coordinates[0][1],
    }]
    cumulative = 0.0
    next_distance = float(interval_miles)
    for start, end in zip(coordinates, coordinates[1:]):
        segment = haversine_miles(start, end)
        if segment <= 0:
            continue
        segment_end = cumulative + segment
        while next_distance < segment_end:
            fraction = (next_distance - cumulative) / segment
            point = interpolate_point(start, end, fraction)
            checkpoints.append({
                "distance_miles": round(next_distance, 2),
                "longitude": point[0],
                "latitude": point[1],
            })
            next_distance += interval_miles
        cumulative = segment_end
    last = coordinates[-1]
    checkpoints.append({
        "distance_miles": round(cumulative, 2),
        "longitude": last[0],
        "latitude": last[1],
    })
    return checkpoints
def _request_ors_routes(origin, destination, include_alternatives):
    payload = {"coordinates": [origin, destination]}
    if include_alternatives:
        payload["alternative_routes"] = {
            "target_count": 3,
            "weight_factor": 1.4,
            "share_factor": 0.6,
        }
    return requests.post(
        ORS_DIRECTIONS_URL,
        headers={
            "Authorization": _ors_api_key(),
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
    )
def get_routes(origin, destination):
    """Get genuine HGV routes, retrying without alternatives on the ORS distance limit."""
    try:
        response = _request_ors_routes(
            origin,
            destination,
            include_alternatives=True,
        )
    except requests.RequestException as exc:
        logger.exception("Could not connect to OpenRouteService")
        raise RoutingProviderError(
            "The truck-routing service could not be reached. Please try again."
        ) from exc
    if response.status_code >= 400:
        body = response.text[:3000].lower()
        alternative_distance_limit = (
            response.status_code == 400
            and (
                "approximated route distance must not be greater than 100000"
                in body
                or (
                    "alternative" in body
                    and ("distance" in body or "100000" in body)
                )
            )
        )
        if alternative_distance_limit:
            logger.info(
                "ORS alternative-route distance limit reached; "
                "retrying without alternatives."
            )
            try:
                response = _request_ors_routes(
                    origin,
                    destination,
                    include_alternatives=False,
                )
            except requests.RequestException as exc:
                logger.exception("ORS single-route fallback request failed")
                raise RoutingProviderError(
                    "The truck-routing service could not complete this trip. "
                    "Please try again."
                ) from exc
        if response.status_code >= 400:
            logger.error(
                "ORS directions failed: HTTP %s; response=%s",
                response.status_code,
                response.text[:1000],
            )
            if response.status_code in (401, 403):
                message = (
                    "The routing provider rejected the API key or its permissions. "
                    "Check your OpenRouteService key and enabled service."
                )
            elif response.status_code == 429:
                message = (
                    "The routing provider's request limit was reached. "
                    "Wait a little and try again."
                )
            else:
                message = (
                    "The routing provider could not calculate this trip. "
                    "Check the locations and try a shorter trip."
                )
            raise RoutingProviderError(message)
    try:
        data = response.json()
        features = data.get("features", [])
        routes = []
        for index, feature in enumerate(features, start=1):
            properties = feature.get("properties", {})
            summary = properties.get("summary", {})
            coordinates = feature.get("geometry", {}).get("coordinates", [])
            if len(coordinates) < 2 or not summary:
                logger.warning(
                    "Skipping ORS feature %s: missing summary or coordinates.",
                    index,
                )
                continue
            routes.append({
                "route_id": index,
                "distance_miles": float(summary["distance"]) / 1609.344,
                "duration_seconds": float(summary["duration"]),
                "coordinates": coordinates,
            })
        return routes
    except (ValueError, TypeError, KeyError) as exc:
        if isinstance(exc, RoutingProviderError):
            raise
        logger.exception("ORS returned an invalid directions response")
        raise RoutingProviderError(
            "The routing provider returned an invalid response. Please try again."
        ) from exc
def estimate_checkpoint_eta(
    departure_time,
    distance_miles,
    total_distance_miles,
    duration_seconds,
):
    """Estimate ETA using the route's overall average speed."""
    if total_distance_miles <= 0:
        return departure_time
    fraction = min(max(distance_miles / total_distance_miles, 0.0), 1.0)
    return departure_time + timedelta(seconds=duration_seconds * fraction)
def _get_weather_response(params):
    """Request Open-Meteo with bounded retries; never retry HTTP 429."""
    retryable_statuses = {500, 502, 503, 504}
    for attempt in range(3):
        try:
            response = requests.get(
                WEATHER_URL,
                params=params,
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
            )
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(0.5 * (2 ** attempt))
            continue
        # Retrying a rate-limited request adds load and delays every checkpoint.
        if response.status_code == 429:
            response.raise_for_status()
        if response.status_code in retryable_statuses and attempt < 2:
            logger.warning(
                "Open-Meteo returned HTTP %s; retrying attempt %s of 3.",
                response.status_code,
                attempt + 2,
            )
            time.sleep(0.5 * (2 ** attempt))
            continue
        response.raise_for_status()
        return response
    raise requests.RequestException("Open-Meteo request failed after retries.")

def get_checkpoint_weather(latitude, longitude, arrival_time, departure_time=None):
    """Return ETA weather and hourly forecast samples for trip hours 0–48."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "wind_speed_10m,rain,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "forecast_days": 3,
        "timezone": "UTC",
    }
    # Reuse forecasts for nearby checkpoints for 30 minutes.
    # A 0.1-degree grid is roughly 5-7 miles and cuts duplicate requests.
    cache_key = (
        "apexroute_weather_v2:"
        f"{round(float(latitude), 1)}:{round(float(longitude), 1)}"
    )
    rate_limit_key = "apexroute_open_meteo_rate_limited"
    data = cache.get(cache_key)
    if data is None:
        if cache.get(rate_limit_key):
            raise requests.RequestException(
                "Open-Meteo is temporarily rate-limiting requests."
            )
        try:
            response = _get_weather_response(params)
            data = response.json()
            cache.set(cache_key, data, timeout=1800)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 429:
                cache.set(rate_limit_key, True, timeout=60)
            raise
    hourly = data.get("hourly", {})
    units = data.get("hourly_units", {})
    times = hourly.get("time", [])
    if not times:
        return None
    forecast_times = []
    for value in times:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        forecast_times.append(parsed.astimezone(timezone.utc))
    def normalized_value(key, index):
        values = hourly.get(key, [])
        if index >= len(values) or values[index] is None:
            return None
        value = float(values[index])
        unit = str(units.get(key, "")).lower()
        # Open-Meteo snowfall is commonly returned in cm even when rain is
        # requested in inches. Normalize to inches for the risk thresholds.
        if key == "snowfall":
            if unit in ("cm", "cm/h"):
                value /= 2.54
            elif unit in ("mm", "mm/h"):
                value /= 25.4
        elif key == "rain":
            if unit in ("mm", "mm/h"):
                value /= 25.4
        elif key == "wind_speed_10m":
            if unit in ("km/h", "kmh"):
                value *= 0.621371
            elif unit == "m/s":
                value *= 2.236936
        return value
    def sample_at(index):
        wind = normalized_value("wind_speed_10m", index)
        rain = normalized_value("rain", index)
        snow = normalized_value("snowfall", index)
        if any(value is None for value in (wind, rain, snow)):
            return None
        return {
            "forecast_time": forecast_times[index].isoformat(),
            "wind_mph": wind,
            "rain_inches": rain,
            "snowfall_inches": snow,
        }
    if arrival_time.tzinfo is None:
        arrival_time = arrival_time.replace(tzinfo=timezone.utc)
    arrival_utc = arrival_time.astimezone(timezone.utc)
    nearest_index = min(
        range(len(forecast_times)),
        key=lambda i: abs((forecast_times[i] - arrival_utc).total_seconds()),
    )
    eta_weather = None
    if abs((forecast_times[nearest_index] - arrival_utc).total_seconds()) <= 3600:
        eta_weather = sample_at(nearest_index)
    forecast_hours = []
    if departure_time is not None:
        if departure_time.tzinfo is None:
            departure_time = departure_time.replace(tzinfo=timezone.utc)
        departure_utc = departure_time.astimezone(timezone.utc)
        for hour in range(49):
            target_time = departure_utc + timedelta(hours=hour)
            nearest = min(
                range(len(forecast_times)),
                key=lambda i: abs((forecast_times[i] - target_time).total_seconds()),
            )
            if abs((forecast_times[nearest] - target_time).total_seconds()) <= 3600:
                sample = sample_at(nearest)
                if sample is not None:
                    forecast_hours.append({"hour": hour, **sample})
    if eta_weather is None and not forecast_hours:
        return None
    result = eta_weather or {}
    result["forecast_hours"] = forecast_hours
    return result
def analyze_route(route, interval_miles, departure_time, load_lbs):
    """Attach ETA/weather/risk to checkpoints and calculate estimated risk miles."""
    checkpoints = generate_checkpoints(route["coordinates"], interval_miles)
    total_distance = route["distance_miles"]
    duration = route["duration_seconds"]
    analyzed = []
    for checkpoint in checkpoints:
        eta = estimate_checkpoint_eta(
            departure_time,
            checkpoint["distance_miles"],
            total_distance,
            duration,
        )
        result = {
            **checkpoint,
            "eta": eta.isoformat(),
            "weather": None,
            "risk": None,
            "data_available": False,
        }
        try:
            weather = get_checkpoint_weather(
                checkpoint["latitude"],
                checkpoint["longitude"],
                eta,
                departure_time=departure_time,
            )
        except (requests.RequestException, RoutingProviderError, ValueError, TypeError) as exc:
            logger.warning(
                "Weather unavailable at checkpoint mile %.2f: %s",
                checkpoint["distance_miles"],
                str(exc)[:300],
            )
            weather = None
        if weather is not None:
            forecast_hours = weather.pop("forecast_hours", [])
            risk = None
            if all(
                key in weather
                for key in ("wind_mph", "rain_inches", "snowfall_inches")
            ):
                risk = analyze_weather(
                    wind_mph=weather["wind_mph"],
                    rain_in_per_hour=weather["rain_inches"],
                    snow_in_per_hour=weather["snowfall_inches"],
                    load_lbs=load_lbs,
                )
            analyzed_forecast = []
            for sample in forecast_hours:
                forecast_risk = analyze_weather(
                    wind_mph=sample["wind_mph"],
                    rain_in_per_hour=sample["rain_inches"],
                    snow_in_per_hour=sample["snowfall_inches"],
                    load_lbs=load_lbs,
                )
                analyzed_forecast.append({
                    **sample,
                    "risk": forecast_risk,
                })
            result["weather"] = weather if risk is not None else None
            result["forecast_hours"] = analyzed_forecast
            result["risk"] = risk
            result["data_available"] = risk is not None
        else:
            result["forecast_hours"] = []
        analyzed.append(result)
    severe_miles = 0.0
    high_miles = 0.0
    no_travel_miles = 0.0
    risk_score_sum = 0.0
    scored_miles = 0.0
    unknown_miles = 0.0
    for current, following in zip(analyzed, analyzed[1:]):
        segment_miles = max(
            0.0,
            following["distance_miles"] - current["distance_miles"],
        )
        if not current["data_available"]:
            unknown_miles += segment_miles
            continue
        risk = current["risk"]
        score = risk["risk_score"]
        overall = risk["overall_risk"]
        risk_score_sum += score * segment_miles
        scored_miles += segment_miles
        if overall == "No Travel":
            no_travel_miles += segment_miles
            severe_miles += segment_miles
        elif overall == "Severe":
            severe_miles += segment_miles
        elif overall == "High":
            high_miles += segment_miles
    return {
        "route_id": route["route_id"],
        "distance_miles": total_distance,
        "duration_seconds": duration,
        "checkpoints": analyzed,
        "severe_miles": round(severe_miles, 2),
        "high_miles": round(high_miles, 2),
        "no_travel_miles": round(no_travel_miles, 2),
        "average_risk_score": (
            round(risk_score_sum / scored_miles, 2)
            if scored_miles > 0
            else None
        ),
        "unknown_miles": round(unknown_miles, 2),
        "weather_coverage_percent": (
            round(100 * scored_miles / total_distance, 1)
            if total_distance > 0
            else 0
        ),
    }
