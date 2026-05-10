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
  Popup,
  Source,
} from "react-map-gl/mapbox";
import type { MapMouseEvent, MapRef } from "react-map-gl/mapbox";

import { formatAffectedProfilesList, formatHazardType } from "@/lib/hazard-labels";

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

export function AccessibilityMapboxMap({
  layers,
  routeGeoJSON,
  heatmapPoints,
  transitStops,
  accessibilityPoints,
  hazards,
  draftHazardLatLon,
  draftHazardPopup,
  onDraftHazardClose,
  originLatLon,
  destLatLon,
  onMapClick,
}: AccessibilityMapProps) {
  const isDark = useDocumentDarkClass();
  const mapRef = useRef<MapRef>(null);
  const [hoverHazardId, setHoverHazardId] = useState<string | null>(null);
  const [styleUrl, setStyleUrl] = useState<string>(() =>
    "mapbox://styles/mapbox/standard"
  );

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

  // When a hazard pin is dropped, pan so it sits ~75% down the viewport,
  // leaving room above for the popup form.
  useEffect(() => {
    if (!draftHazardLatLon || !mapRef.current) return;
    const t = window.setTimeout(() => {
      const m = mapRef.current;
      if (!m) return;
      const containerH = m.getContainer().clientHeight;
      // Use panBy so we don't fight with the user's current zoom level: project
      // the pin to a screen point, then pan so it lands at ~75% from the top.
      const pt = m.project([draftHazardLatLon[1], draftHazardLatLon[0]]);
      const targetY = containerH * 0.75;
      const dy = pt.y - targetY; // positive => pin currently below target → pan up
      if (Math.abs(dy) > 24) {
        m.panBy([0, dy], { duration: 420 });
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [draftHazardLatLon]);

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
          color: stop.wheelchair_boarding === "1" ? "#10b981" : "#f59e0b",
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

  // navigation-night-v1: sleek, minimal-chrome dark style preferred for the app.
  useEffect(() => {
    setStyleUrl(
      isDark
        ? "mapbox://styles/mapbox/navigation-night-v1"
        : "mapbox://styles/mapbox/streets-v12"
    );
  }, [isDark]);

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(evt) => setViewState(evt.viewState)}
      mapStyle={styleUrl}
      mapboxAccessToken={MAPBOX_TOKEN}
      onClick={handleClick}
      doubleClickZoom={false}
      style={{ width: "100%", height: "100%", minHeight: "22rem" }}
      reuseMaps
      onError={() => {
        // If Mapbox Standard is unavailable, switch to dark-v11.
        if (styleUrl.includes("/navigation-night")) setStyleUrl("mapbox://styles/mapbox/dark-v11");
      }}
    >
      <NavigationControl position="top-right" />

      {/* Route line */}
      {layers.route && routeSourceData && (
        <Source id="route" type="geojson" data={routeSourceData}>
          <Layer
            id="route-outline"
            type="line"
            paint={{ "line-color": "#ffffff", "line-width": 13, "line-opacity": 0.52 }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
          <Layer
            id="route-main"
            type="line"
            paint={{ "line-color": BRAND, "line-width": 6, "line-opacity": 1 }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
          <Layer
            id="route-dash"
            type="line"
            paint={{
              "line-color": "#f5f0ff",
              "line-width": 2,
              "line-opacity": 0.95,
              "line-dasharray": [1, 16],
            }}
            layout={{ "line-cap": "round" }}
          />
        </Source>
      )}

      {/* Heatmap */}
      {layers.heatmap && heatmapSourceData && (
        <Source id="heatmap" type="geojson" data={heatmapSourceData}>
          <Layer
            id="heatmap-circles"
            type="circle"
            paint={{ "circle-radius": 4, "circle-color": ["get", "color"], "circle-opacity": 0.7 }}
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
        <Source id="accessibility-pts" type="geojson" data={accessibilitySourceData}>
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

      {/* Hazards layer */}
      {layers.hazards && hazards && hazards.length > 0 && (
        <>
          {hazards.map((hazard) => {
            const active = hoverHazardId === hazard.id;
            return (
              <Marker key={hazard.id} latitude={hazard.lat} longitude={hazard.lon} anchor="bottom">
                <div
                  className="grid size-4 place-content-center rounded-full border-2 border-white bg-red-500"
                  style={{
                    boxShadow:
                      "0 10px 26px rgba(239,68,68,0.18), 0 1px 2px rgba(0,0,0,0.18)",
                  }}
                  title={formatHazardType(hazard.type)}
                  role="img"
                  aria-label={formatHazardType(hazard.type)}
                  onMouseEnter={() => setHoverHazardId(hazard.id)}
                  onMouseLeave={() => setHoverHazardId((cur) => (cur === hazard.id ? null : cur))}
                />
                {active ? (
                  <Popup
                    latitude={hazard.lat}
                    longitude={hazard.lon}
                    anchor="top"
                    closeButton={false}
                    closeOnClick={false}
                    onClose={() => setHoverHazardId(null)}
                    offset={14}
                    className="[&_.mapboxgl-popup-content]:rounded-xl [&_.mapboxgl-popup-content]:border [&_.mapboxgl-popup-content]:border-border/70 [&_.mapboxgl-popup-content]:bg-background/95 [&_.mapboxgl-popup-content]:p-3 [&_.mapboxgl-popup-content]:shadow-[0_16px_40px_-28px_rgba(0,0,0,0.45)]"
                  >
                    <div className="flex max-w-[240px] flex-col gap-1">
                      <div className="text-xs font-semibold leading-snug text-foreground">
                        {formatHazardType(hazard.type)}
                      </div>
                      {hazard.description ? (
                        <div className="whitespace-normal text-[11px] leading-snug text-muted-foreground">
                          {hazard.description}
                        </div>
                      ) : null}
                      <div className="text-[11px] leading-snug text-destructive">
                        <span className="font-medium text-foreground/80">Affects: </span>
                        {formatAffectedProfilesList(hazard.affected_profiles)}
                      </div>
                    </div>
                  </Popup>
                ) : null}
              </Marker>
            );
          })}
        </>
      )}

      {/* Draft hazard marker + form popup anchored to the dropped pin */}
      {draftHazardLatLon && (
        <>
          <Marker latitude={draftHazardLatLon[0]} longitude={draftHazardLatLon[1]} anchor="bottom">
            <div
              className="grid size-5 place-content-center rounded-full border-2 border-white bg-amber-500"
              style={{
                boxShadow:
                  "0 12px 30px rgba(245,158,11,0.30), 0 1px 2px rgba(0,0,0,0.25)",
              }}
              title="New hazard"
              aria-label="New hazard"
              role="img"
            />
          </Marker>
          {draftHazardPopup && (
            <Popup
              latitude={draftHazardLatLon[0]}
              longitude={draftHazardLatLon[1]}
              anchor="bottom"
              offset={28}
              closeButton={false}
              closeOnClick={false}
              onClose={onDraftHazardClose}
              maxWidth="none"
              className="z-50 [&_.mapboxgl-popup-content]:overflow-visible [&_.mapboxgl-popup-content]:rounded-2xl [&_.mapboxgl-popup-content]:border [&_.mapboxgl-popup-content]:border-amber-500/30 [&_.mapboxgl-popup-content]:bg-card [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] [&_.mapboxgl-popup-tip]:!border-t-card"
            >
              {draftHazardPopup}
            </Popup>
          )}
        </>
      )}
    </Map>
  );
}

