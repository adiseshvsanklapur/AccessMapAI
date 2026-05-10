"use client";

/**
 * Mapbox GL map wired to the AccessMap AI backend.
 * Drop-in replacement for the Leaflet implementation.
 * Renders real route GeoJSON, heatmap data, transit stops,
 * and supports click-to-set origin/destination.
 */
import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
} from "react-map-gl/mapbox";
import type { MapMouseEvent, MapRef } from "react-map-gl/mapbox";
import type { AccessibilityMapProps } from "./types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const BRAND = "#5c32a8";

/** UC Davis center */
const UC_DAVIS_CENTER = { longitude: -121.7617, latitude: 38.5382 };

// Accessibility point category colors
const CATEGORY_COLORS: Record<string, string> = {
  crossing: "#3b82f6",
  kerb_lowered: "#10b981",
  kerb_raised: "#ef4444",
  tactile_paving: "#8b5cf6",
  wheelchair_yes: "#10b981",
  wheelchair_limited: "#f59e0b",
  wheelchair_no: "#ef4444",
};

function scoreToColor(value: number): string {
  if (value > 0.66) return `rgba(239, 68, 68, ${0.4 + value * 0.4})`;
  if (value > 0.33) return `rgba(250, 204, 21, ${0.3 + value * 0.4})`;
  return `rgba(34, 197, 94, ${0.3 + value * 0.3})`;
}

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

export function AccessibilityLeafletMap({
  layers,
  routeGeoJSON,
  heatmapPoints,
  transitStops,
  accessibilityPoints,
  originLatLon,
  destLatLon,
  onMapClick,
}: AccessibilityMapProps) {
  const isDark = useDocumentDarkClass();
  const mapRef = useRef<MapRef>(null);

  const [viewState, setViewState] = useState({
    ...UC_DAVIS_CENTER,
    zoom: 15,
  });

  // Fit bounds when route changes
  useEffect(() => {
    const coords = routeGeoJSON?.geometry?.coordinates;
    if (!coords || coords.length < 2 || !mapRef.current) return;

    const lngs = coords.map(([lon]: number[]) => lon);
    const lats = coords.map(([, lat]: number[]) => lat);

    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, maxZoom: 17, duration: 800 }
    );
  }, [routeGeoJSON]);

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      onMapClick?.(e.lngLat.lat, e.lngLat.lng);
    },
    [onMapClick]
  );

  // Build route GeoJSON for the Source
  const routeSourceData = useMemo(() => {
    if (!routeGeoJSON?.geometry?.coordinates) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: routeGeoJSON.geometry,
    };
  }, [routeGeoJSON]);

  // Build heatmap GeoJSON
  const heatmapSourceData = useMemo(() => {
    if (!heatmapPoints || heatmapPoints.length === 0) return null;
    return {
      type: "FeatureCollection" as const,
      features: heatmapPoints.map((pt) => ({
        type: "Feature" as const,
        properties: {
          value: pt.value,
          color: scoreToColor(pt.value),
        },
        geometry: {
          type: "Point" as const,
          coordinates: [pt.lon, pt.lat],
        },
      })),
    };
  }, [heatmapPoints]);

  // Build transit stops GeoJSON
  const transitSourceData = useMemo(() => {
    if (!transitStops || transitStops.length === 0) return null;
    return {
      type: "FeatureCollection" as const,
      features: transitStops.map((stop) => ({
        type: "Feature" as const,
        properties: {
          name: stop.stop_name,
          wheelchair: stop.wheelchair_boarding,
          color:
            stop.wheelchair_boarding === "1" ? "#10b981" : "#f59e0b",
        },
        geometry: {
          type: "Point" as const,
          coordinates: [stop.lon, stop.lat],
        },
      })),
    };
  }, [transitStops]);

  // Build accessibility points GeoJSON
  const accessibilitySourceData = useMemo(() => {
    if (!accessibilityPoints || accessibilityPoints.length === 0) return null;
    return {
      type: "FeatureCollection" as const,
      features: accessibilityPoints.map((pt) => ({
        type: "Feature" as const,
        properties: {
          label: pt.label,
          color: CATEGORY_COLORS[pt.category] ?? "#6b7280",
        },
        geometry: {
          type: "Point" as const,
          coordinates: [pt.lon, pt.lat],
        },
      })),
    };
  }, [accessibilityPoints]);

  const mapStyle = isDark
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/streets-v12";

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(evt) => setViewState(evt.viewState)}
      mapStyle={mapStyle}
      mapboxAccessToken={MAPBOX_TOKEN}
      onClick={handleClick}
      doubleClickZoom={false}
      style={{ width: "100%", height: "100%", minHeight: "22rem" }}
      reuseMaps
    >
      <NavigationControl position="top-right" />

      {/* Route line */}
      {layers.route && routeSourceData && (
        <Source id="route" type="geojson" data={routeSourceData}>
          {/* White outline */}
          <Layer
            id="route-outline"
            type="line"
            paint={{
              "line-color": "#ffffff",
              "line-width": 13,
              "line-opacity": 0.52,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
          {/* Main route */}
          <Layer
            id="route-main"
            type="line"
            paint={{
              "line-color": BRAND,
              "line-width": 6,
              "line-opacity": 1,
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
          />
          {/* Animated dash */}
          <Layer
            id="route-dash"
            type="line"
            paint={{
              "line-color": "#f5f0ff",
              "line-width": 2,
              "line-opacity": 0.95,
              "line-dasharray": [1, 16],
            }}
            layout={{
              "line-cap": "round",
            }}
          />
        </Source>
      )}

      {/* Heatmap */}
      {layers.heatmap && heatmapSourceData && (
        <Source id="heatmap" type="geojson" data={heatmapSourceData}>
          <Layer
            id="heatmap-circles"
            type="circle"
            paint={{
              "circle-radius": 4,
              "circle-color": ["get", "color"],
              "circle-opacity": 0.7,
            }}
          />
        </Source>
      )}

      {/* Transit stops */}
      {layers.obstacles && transitSourceData && (
        <Source id="transit" type="geojson" data={transitSourceData}>
          <Layer
            id="transit-circles"
            type="circle"
            paint={{
              "circle-radius": 5,
              "circle-color": ["get", "color"],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
              "circle-opacity": 0.9,
            }}
          />
        </Source>
      )}

      {/* Accessibility infrastructure points */}
      {layers.accessibilityPoints && accessibilitySourceData && (
        <Source
          id="accessibility-pts"
          type="geojson"
          data={accessibilitySourceData}
        >
          <Layer
            id="accessibility-circles"
            type="circle"
            paint={{
              "circle-radius": 5,
              "circle-color": ["get", "color"],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
              "circle-opacity": 0.85,
            }}
          />
        </Source>
      )}

      {/* Origin marker */}
      {originLatLon && (
        <Marker latitude={originLatLon[0]} longitude={originLatLon[1]}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#10b981",
              border: "3px solid #fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
            title="Start"
          />
        </Marker>
      )}

      {/* Destination marker */}
      {destLatLon && (
        <Marker latitude={destLatLon[0]} longitude={destLatLon[1]}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#ef4444",
              border: "3px solid #fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
            title="End"
          />
        </Marker>
      )}
    </Map>
  );
}
