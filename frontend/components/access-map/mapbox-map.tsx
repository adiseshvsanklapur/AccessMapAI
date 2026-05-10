"use client";

/**
 * Mapbox GL map wired to the AccessMap AI backend.
 * Drop-in replacement for the Leaflet implementation.
 * Renders real route GeoJSON, heatmap data, transit stops,
 * and supports click-to-set origin/destination.
 */
import "mapbox-gl/dist/mapbox-gl.css";
import { Plus, Minus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
} from "react-map-gl/mapbox";
import type { MapMouseEvent, MapRef } from "react-map-gl/mapbox";

import { formatAffectedProfile, formatHazardType } from "@/lib/hazard-labels";

import type { AccessibilityMapProps } from "./types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
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

type LngLatTuple = [number, number];
type LatLngTuple = [number, number];

function scoreToColor(value: number): string {
  if (value > 0.66) return `rgba(239, 68, 68, ${0.4 + value * 0.4})`;
  if (value > 0.33) return `rgba(250, 204, 21, ${0.3 + value * 0.4})`;
  return `rgba(34, 197, 94, ${0.3 + value * 0.3})`;
}

function sanitizeLineCoords(input: unknown): LngLatTuple[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is LngLatTuple => {
    if (!Array.isArray(item) || item.length < 2) return false;
    const [lon, lat] = item;
    return typeof lon === "number" && Number.isFinite(lon) && typeof lat === "number" && Number.isFinite(lat);
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toValidLatLng(input: unknown): LatLngTuple | null {
  if (!Array.isArray(input) || input.length < 2) return null;
  const [lat, lng] = input;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return [lat, lng];
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
  const hasMapboxToken = Boolean(MAPBOX_TOKEN?.trim());
  const isDark = useDocumentDarkClass();
  const mapRef = useRef<MapRef>(null);
  const [hoverHazardId, setHoverHazardId] = useState<string | null>(null);
  const safeOriginLatLon = toValidLatLng(originLatLon);
  const safeDestLatLon = toValidLatLng(destLatLon);
  const safeDraftHazardLatLon = toValidLatLng(draftHazardLatLon);
  const safeHazards = useMemo(
    () =>
      (hazards ?? []).filter(
        (hazard) => isFiniteNumber(hazard.lat) && isFiniteNumber(hazard.lon),
      ),
    [hazards],
  );

  // Fit bounds when route changes
  useEffect(() => {
    const coords = sanitizeLineCoords(routeGeoJSON?.geometry?.coordinates);
    if (!coords || coords.length < 2 || !mapRef.current) return;

    const lngs = coords.map(([lon]) => lon);
    const lats = coords.map(([, lat]) => lat);

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
    if (!safeDraftHazardLatLon || !mapRef.current) return;
    const t = window.setTimeout(() => {
      const m = mapRef.current;
      if (!m) return;
      const containerH = m.getContainer().clientHeight;
      // Use panBy so we don't fight with the user's current zoom level: project
      // the pin to a screen point, then pan so it lands at ~75% from the top.
      const pt = m.project([safeDraftHazardLatLon[1], safeDraftHazardLatLon[0]]);
      const targetY = containerH * 0.75;
      const dy = pt.y - targetY; // positive => pin currently below target → pan up
      if (Math.abs(dy) > 24) {
        m.panBy([0, dy], { duration: 420 });
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [safeDraftHazardLatLon]);

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      onMapClick?.(e.lngLat.lat, e.lngLat.lng);
    },
    [onMapClick]
  );

  // Build route GeoJSON for the Source
  const routeSourceData = useMemo(() => {
    const coords = sanitizeLineCoords(routeGeoJSON?.geometry?.coordinates);
    if (coords.length < 2) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: coords,
      },
    };
  }, [routeGeoJSON]);

  // Build heatmap GeoJSON
  const heatmapSourceData = useMemo(() => {
    const safePoints = (heatmapPoints ?? []).filter(
      (pt) => isFiniteNumber(pt.lat) && isFiniteNumber(pt.lon) && isFiniteNumber(pt.value),
    );
    if (safePoints.length === 0) return null;
    return {
      type: "FeatureCollection" as const,
      features: safePoints.map((pt) => ({
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
    const safeStops = (transitStops ?? []).filter(
      (stop) => isFiniteNumber(stop.lat) && isFiniteNumber(stop.lon),
    );
    if (safeStops.length === 0) return null;
    return {
      type: "FeatureCollection" as const,
      features: safeStops.map((stop) => ({
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
    const safePoints = (accessibilityPoints ?? []).filter(
      (pt) => isFiniteNumber(pt.lat) && isFiniteNumber(pt.lon),
    );
    if (safePoints.length === 0) return null;
    return {
      type: "FeatureCollection" as const,
      features: safePoints.map((pt) => ({
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

  const styleUrl = isDark
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/streets-v12";

  if (!hasMapboxToken) {
    return (
      <div className="flex h-full min-h-[22rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
        <p className="font-medium text-foreground text-sm">Mapbox token missing</p>
        <p className="max-w-md text-muted-foreground text-xs leading-relaxed">
          Add <code className="rounded bg-muted px-1.5 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN=...</code> to{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">frontend/.env.local</code>, then restart{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={{ ...UC_DAVIS_CENTER, zoom: 15 }}
      mapStyle={styleUrl}
      mapboxAccessToken={MAPBOX_TOKEN}
      onClick={handleClick}
      doubleClickZoom={false}
      scrollZoom
      touchZoomRotate
      style={{ width: "100%", height: "100%", minHeight: "22rem" }}
    >
      <NavigationControl position="top-right" />
      <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            mapRef.current?.getMap().zoomIn({ duration: 250 });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="grid h-9 w-9 place-items-center rounded-md border border-border/70 bg-background/95 text-foreground shadow-md transition hover:bg-muted"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            mapRef.current?.getMap().zoomOut({ duration: 250 });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="grid h-9 w-9 place-items-center rounded-md border border-border/70 bg-background/95 text-foreground shadow-md transition hover:bg-muted"
        >
          <Minus className="size-4" />
        </button>
      </div>

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
            paint={{ "circle-radius": 2.6, "circle-color": ["get", "color"], "circle-opacity": 0.33 }}
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
      {safeOriginLatLon && (
        <Marker latitude={safeOriginLatLon[0]} longitude={safeOriginLatLon[1]}>
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
      {safeDestLatLon && (
        <Marker latitude={safeDestLatLon[0]} longitude={safeDestLatLon[1]}>
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
      {layers.hazards && safeHazards.length > 0 && (
        <>
          {safeHazards.map((hazard) => {
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
                    className="[&_.mapboxgl-popup-content]:overflow-hidden [&_.mapboxgl-popup-content]:rounded-2xl [&_.mapboxgl-popup-content]:border [&_.mapboxgl-popup-content]:border-border/70 [&_.mapboxgl-popup-content]:bg-card/95 [&_.mapboxgl-popup-content]:backdrop-blur-md [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:shadow-[0_24px_60px_-36px_rgba(0,0,0,0.75)] [&_.mapboxgl-popup-tip]:!border-t-card/95"
                  >
                    <div className="w-[260px]">
                      <div className="flex items-start gap-2 border-border/60 border-b bg-background/40 px-3 py-2.5">
                        <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-lg bg-destructive/15 text-destructive ring-1 ring-destructive/30">
                          <span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-sm leading-snug text-foreground">
                            {formatHazardType(hazard.type)}
                          </div>
                          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                            Reported hazard
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 px-3 py-2.5">
                        {hazard.description ? (
                          <div className="whitespace-normal text-xs leading-relaxed text-foreground/85">
                            {hazard.description}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">No description provided.</div>
                        )}

                        {hazard.affected_profiles?.length ? (
                          <div className="space-y-1">
                            <div className="text-[11px] font-medium text-muted-foreground">Affects</div>
                            <div className="flex flex-wrap gap-1.5">
                              {hazard.affected_profiles.slice(0, 6).map((p) => (
                                <span
                                  key={p}
                                  className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/85"
                                >
                                  {formatAffectedProfile(p)}
                                </span>
                              ))}
                              {hazard.affected_profiles.length > 6 ? (
                                <span className="text-[11px] text-muted-foreground">+{hazard.affected_profiles.length - 6}</span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
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
      {safeDraftHazardLatLon && (
        <>
          <Marker latitude={safeDraftHazardLatLon[0]} longitude={safeDraftHazardLatLon[1]} anchor="bottom">
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
              latitude={safeDraftHazardLatLon[0]}
              longitude={safeDraftHazardLatLon[1]}
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

