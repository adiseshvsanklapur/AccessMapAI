"use client";

/**
 * Leaflet map wired to the AccessMap AI backend.
 * Renders real route GeoJSON, heatmap data, transit stops,
 * and supports click-to-set origin/destination.
 */
import "leaflet/dist/leaflet.css";
import "./map-leaflet.css";
import type { LatLngExpression, LeafletMouseEvent } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

import type { AccessibilityMapProps } from "./types";

const TILE_CACHE_REVISION = "v2026-voyager-1";
const BRAND = "#5c32a8";

/** UC Davis center */
const UC_DAVIS_CENTER = [38.5382, -121.7617] as LatLngExpression;

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> · <a href="https://carto.com/attributions" rel="noreferrer">CARTO</a>';

function cartoRaster(path: string) {
  return `https://{s}.basemaps.cartocdn.com${path}?_${TILE_CACHE_REVISION}`;
}

const TILE_VOYAGER = cartoRaster(`/rastertiles/voyager/{z}/{x}/{y}.png`);
const TILE_DARK_BASE = cartoRaster(`/dark_nolabels/{z}/{x}/{y}.png`);
const TILE_DARK_LABELS = cartoRaster(`/dark_only_labels/{z}/{x}/{y}.png`);

// Custom marker icons
const originIcon = L.divIcon({
  className: "accessmap-marker-origin",
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const destIcon = L.divIcon({
  className: "accessmap-marker-dest",
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// ---------------------------------------------------------------------------
// Heatmap color scale
// ---------------------------------------------------------------------------
function scoreToColor(value: number): string {
  // 0 = red (bad), 0.5 = yellow, 1.0 = green (good)
  if (value < 0.33) return `rgba(239, 68, 68, ${0.4 + value})`;
  if (value < 0.66) return `rgba(250, 204, 21, ${0.3 + value * 0.4})`;
  return `rgba(34, 197, 94, ${0.3 + value * 0.3})`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function useDocumentDarkClass() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return dark;
}

/** Fit map bounds to route when it changes */
function FitToRoute({ routeCoords }: { routeCoords?: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (routeCoords && routeCoords.length > 1) {
      const bounds = L.latLngBounds(
        routeCoords.map(([lon, lat]) => [lat, lon] as [number, number]),
      );
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    }
  }, [routeCoords, map]);

  return null;
}

/** Handle click events on map */
function MapClickHandler({ onClick }: { onClick?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function AccessibilityLeafletMap({
  layers,
  routeGeoJSON,
  heatmapPoints,
  transitStops,
  originLatLon,
  destLatLon,
  onMapClick,
}: AccessibilityMapProps) {
  const isDark = useDocumentDarkClass();

  // Convert GeoJSON coordinates to Leaflet LatLngExpression
  const routePositions = useMemo<LatLngExpression[]>(() => {
    if (!routeGeoJSON?.geometry?.coordinates) return [];
    return routeGeoJSON.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon] as LatLngExpression,
    );
  }, [routeGeoJSON]);

  return (
    <MapContainer
      key={`${TILE_CACHE_REVISION}-${isDark ? "dark" : "light"}`}
      attributionControl
      zoomControl
      dragging
      scrollWheelZoom
      doubleClickZoom={false}
      boxZoom
      keyboard
      center={UC_DAVIS_CENTER}
      zoom={15}
      className="accessmap-leaflet isolate z-0 h-full min-h-[22rem] w-full"
      style={{ isolation: "isolate" }}
    >
      {isDark ? (
        <>
          <TileLayer
            key="dark-base"
            url={TILE_DARK_BASE}
            maxZoom={20}
            maxNativeZoom={18}
            subdomains={["a", "b", "c", "d"]}
          />
          <TileLayer
            key="dark-labels"
            url={TILE_DARK_LABELS}
            attribution={ATTRIBUTION}
            maxZoom={20}
            maxNativeZoom={18}
            subdomains={["a", "b", "c", "d"]}
          />
        </>
      ) : (
        <TileLayer
          key="voyager"
          url={TILE_VOYAGER}
          attribution={ATTRIBUTION}
          maxZoom={20}
          maxNativeZoom={19}
          subdomains={["a", "b", "c", "d"]}
        />
      )}

      {/* Click handler for setting origin/destination */}
      <MapClickHandler onClick={onMapClick} />

      {/* Fit bounds to route */}
      <FitToRoute
        routeCoords={routeGeoJSON?.geometry?.coordinates as [number, number][] | undefined}
      />

      {/* Route polyline */}
      {layers.route && routePositions.length > 1 && (
        <Pane name="route" style={{ zIndex: 450 }}>
          {/* White outline for contrast */}
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#ffffff",
              weight: 13,
              opacity: 0.52,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          {/* Main route line */}
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: BRAND,
              weight: 6,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          {/* Animated dash overlay */}
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#f5f0ff",
              weight: 2,
              opacity: 0.95,
              dashArray: "1 16",
              lineCap: "round",
            }}
          />
        </Pane>
      )}

      {/* Heatmap layer */}
      {layers.heatmap && heatmapPoints && heatmapPoints.length > 0 && (
        <Pane name="heatmap" style={{ zIndex: 420 }}>
          {heatmapPoints.map((pt, idx) => (
            <CircleMarker
              key={`heat-${idx}`}
              center={[pt.lat, pt.lon]}
              radius={4}
              pathOptions={{
                color: "transparent",
                fillColor: scoreToColor(pt.value),
                fillOpacity: 0.7,
                weight: 0,
              }}
            />
          ))}
        </Pane>
      )}

      {/* Transit stops */}
      {layers.obstacles && transitStops && transitStops.length > 0 && (
        <Pane name="transit" style={{ zIndex: 440 }}>
          {transitStops.map((stop) => (
            <CircleMarker
              key={stop.stop_id}
              center={[stop.lat, stop.lon]}
              radius={5}
              pathOptions={{
                color: "#ffffff",
                fillColor: stop.wheelchair_boarding === "1" ? "#10b981" : "#f59e0b",
                fillOpacity: 0.9,
                weight: 1.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="text-xs font-medium">{stop.stop_name}</span>
                {stop.wheelchair_boarding === "1" && (
                  <span className="ml-1 text-green-600">♿</span>
                )}
              </Tooltip>
            </CircleMarker>
          ))}
        </Pane>
      )}

      {/* Origin marker */}
      {originLatLon && (
        <Marker position={originLatLon} icon={originIcon}>
          <Tooltip direction="top" offset={[0, -12]} permanent>
            <span className="font-semibold text-xs">Start</span>
          </Tooltip>
        </Marker>
      )}

      {/* Destination marker */}
      {destLatLon && (
        <Marker position={destLatLon} icon={destIcon}>
          <Tooltip direction="top" offset={[0, -12]} permanent>
            <span className="font-semibold text-xs">End</span>
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
