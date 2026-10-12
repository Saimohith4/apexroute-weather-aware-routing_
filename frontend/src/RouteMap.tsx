import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Position, RouteCheckpoint, RouteResult } from "./App";
import "leaflet/dist/leaflet.css";
type Props = {
  routes: RouteResult[];
  selectedRouteId: number | null;
  onSelectRoute: (id: number) => void;
  forecastHour: number;
};
const ROUTE_COLORS = ["#5ce1ce", "#7da9ff", "#c29aff"];
function getRiskColor(risk?: string | null): string {
  switch (risk) {
    case "Low":
      return "#5ce1ce";
    case "Moderate":
      return "#f4cc70";
    case "High":
      return "#ff9d65";
    case "Severe":
      return "#ff6b7b";
    case "No Travel":
      return "#e14b69";
    default:
      return "#8a9bb0";
  }
}
function haversineMiles(
  first: Position,
  second: Position,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const [longitude1, latitude1] = first;
  const [longitude2, latitude2] = second;
  const latitudeDifference = toRadians(latitude2 - latitude1);
  const longitudeDifference = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(longitudeDifference / 2) ** 2;
  return (
    3958.8 *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  );
}
function getCheckpointMile(checkpoint: RouteCheckpoint): number {
  return checkpoint.distance_miles ?? checkpoint.mile ?? 0;
}
/**
 * Coordinates from OpenRouteService use [longitude, latitude].
 * Find an approximate position at a specified distance along the route.
 */
function positionAtDistance(
  coordinates: Position[],
  targetMiles: number,
): Position | null {
  if (coordinates.length === 0) {
    return null;
  }
  if (coordinates.length === 1 || targetMiles <= 0) {
    return coordinates[0];
  }
  let travelledMiles = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start: Position = coordinates[index - 1];
    const end: Position = coordinates[index];
    const segmentMiles = haversineMiles(start, end);
    if (travelledMiles + segmentMiles >= targetMiles) {
      const fraction =
        segmentMiles === 0
          ? 0
          : (targetMiles - travelledMiles) / segmentMiles;
      const longitude =
        start[0] + (end[0] - start[0]) * fraction;
      const latitude =
        start[1] + (end[1] - start[1]) * fraction;
      return [longitude, latitude];
    }
    travelledMiles += segmentMiles;
  }
  return coordinates[coordinates.length - 1];
}
function getCheckpointPosition(
  checkpoint: RouteCheckpoint,
  route: RouteResult,
): Position | null {
  if (
    typeof checkpoint.longitude === "number" &&
    Number.isFinite(checkpoint.longitude) &&
    typeof checkpoint.latitude === "number" &&
    Number.isFinite(checkpoint.latitude)
  ) {
    return [checkpoint.longitude, checkpoint.latitude];
  }
  return positionAtDistance(
    route.coordinates,
    getCheckpointMile(checkpoint),
  );
}
function FitRoutes({ routes }: { routes: RouteResult[] }) {
  const map = useMap();
  useEffect(() => {
    const points: L.LatLng[] = routes.flatMap(
      (route): L.LatLng[] =>
        route.coordinates
          .filter(
            (coordinate: Position): boolean =>
              Array.isArray(coordinate) &&
              Number.isFinite(coordinate[0]) &&
              Number.isFinite(coordinate[1]),
          )
          .map(
            ([longitude, latitude]: Position): L.LatLng =>
              L.latLng(latitude, longitude),
          ),
    );
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), {
        padding: [30, 30],
        maxZoom: 13,
      });
    }
  }, [map, routes]);
  return null;
}
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export default function RouteMap({
  routes,
  selectedRouteId,
  onSelectRoute,
  forecastHour,
}: Props) {
  const validRoutes = useMemo(
    () =>
      routes.filter(
        (route) =>
          Array.isArray(route.coordinates) &&
          route.coordinates.length > 0,
      ),
    [routes],
  );
  const selectedRoute =
    validRoutes.find((route) => route.route_id === selectedRouteId) ??
    validRoutes[0];
  if (!selectedRoute) {
    return (
      <section className="map-frame">
        <div className="map-topbar">
          <div>
            <span className="map-kicker">ROUTE GEOMETRY</span>
            <h3>Route intelligence map</h3>
          </div>
        </div>
        <div className="map-empty">
          No route geometry was returned. Try analyzing another trip.
        </div>
      </section>
    );
  }
  const firstCoordinate: Position = selectedRoute.coordinates[0];
  const [firstLongitude, firstLatitude] = firstCoordinate;
  return (
    <section className="map-frame">
      <div className="map-topbar">
        <div>
          <span className="map-kicker">ROUTE GEOMETRY</span>
          <h3>Route intelligence map</h3>
        </div>
        <span className="map-live">
          <span />
          {validRoutes.length} ROUTES
        </span>
      </div>
      <MapContainer
        key={selectedRoute.route_id}
        center={[firstLatitude, firstLongitude]}
        zoom={11}
        scrollWheelZoom
        className="route-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www\.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoutes routes={validRoutes} />
        {validRoutes.map((route) => {
          const routeIndex = routes.findIndex(
            (item) => item.route_id === route.route_id,
          );
          const isSelected = route.route_id === selectedRoute.route_id;
          const routeColor =
            ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
          return (
            <Polyline
              key={route.route_id}
              positions={route.coordinates.map(
                ([longitude, latitude]: Position): [number, number] => [
                  latitude,
                  longitude,
                ],
              )}
              pathOptions={{
                color: routeColor,
                weight: isSelected ? 6 : 3,
                opacity: isSelected ? 0.95 : 0.55,
              }}
              eventHandlers={{
                click: () => onSelectRoute(route.route_id),
              }}
            >
              <Popup>
                <div className="checkpoint-popup">
                  <strong>Route {route.route_id}</strong>
                  <p>{route.distance_miles.toFixed(1)} miles</p>
                  <p>
                    {Math.round(route.duration_seconds / 60)} minutes
                  </p>
                  <button
                    type="button"
                    onClick={() => onSelectRoute(route.route_id)}
                  >
                    Select this route
                  </button>
                </div>
              </Popup>
            </Polyline>
          );
        })}
        {selectedRoute.checkpoints?.map(
          (checkpoint: RouteCheckpoint, index: number) => {
            const position = getCheckpointPosition(
              checkpoint,
              selectedRoute,
            );
            if (!position) {
              return null;
            }
            const [longitude, latitude] = position;
            const forecastSample = checkpoint.forecast_hours?.find(
              (sample) => sample.hour === forecastHour,
            );
            const weather = forecastSample;
            const risk = forecastSample?.risk?.overall_risk;
            const markerColor = forecastSample
              ? getRiskColor(risk)
              : "#8a9bb0";
            return (
              <CircleMarker
                key={`${selectedRoute.route_id}-checkpoint-${index}`}
                center={[latitude, longitude]}
                radius={7}
                pathOptions={{
                  color: "#0b1523",
                  weight: 2,
                  fillColor: markerColor,
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <div className="checkpoint-popup">
                    <strong>
                      Checkpoint · Mile{" "}
                      {getCheckpointMile(checkpoint).toFixed(1)}
                    </strong>
                    <p>ETA: {formatDate(checkpoint.eta)}</p>
                    {weather ? (
                      <>
                        <p>Forecast hour: +{forecastHour}h</p>
                        <p>Overall risk: {risk ?? "Unknown"}</p>
                        <p>Wind: {weather.wind_mph} mph</p>
                        <p>Rain: {weather.rain_inches} in/hr</p>
                        <p>Snowfall: {weather.snowfall_inches} in/hr</p>
                        <p>Forecast: {formatDate(weather.forecast_time)}</p>
                      </>
                    ) : (
                      <p>Forecast data unavailable for +{forecastHour}h at this checkpoint.</p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          },
        )}
      </MapContainer>
      <div className="map-legend">
        {[
          ["#5ce1ce", "Low"],
          ["#f4cc70", "Moderate"],
          ["#ff9d65", "High"],
          ["#ff6b7b", "Severe"],
          ["#8a9bb0", "Unknown"],
        ].map(([color, label]) => (
          <span key={label}>
            <i style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
