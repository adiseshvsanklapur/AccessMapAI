"use client";

/**
 * Dedicated chunk for Leaflet tiles (don't rename lightly).
 * Bump TILE_CACHE_REVISION when swapping basemap or busting CDN/browser caches.
 */
import "leaflet/dist/leaflet.css";
import "./map-leaflet.css";
import type { LatLngExpression } from "leaflet";
import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Pane,
  Polyline,
  Rectangle,
  TileLayer,
} from "react-leaflet";

import type { AccessibilityMapProps } from "./types";

const TILE_CACHE_REVISION = "v2026-voyager-1";

const BRAND = "#5c32a8";

/** UC Davis-ish coordinates — static mock visuals only */
const ORIGIN = [38.53867, -121.74994] as LatLngExpression;
const ROUTE: LatLngExpression[] = [
  [38.53845, -121.75072],
  [38.53858, -121.7502],
  [38.53872, -121.7496],
  [38.53888, -121.7491],
  [38.53902, -121.74862],
];

const DANGER_BOUNDS: [[number, number], [number, number]] = [
  [38.53875, -121.74992],
  [38.53912, -121.74932],
];

const OBSTACLE_CENTERS: LatLngExpression[] = [
  [38.53862, -121.75042],
  [38.53895, -121.74955],
];

const HEAT_RECTANGLES: [[number, number], [number, number]][] = [
  [
    [38.5384, -121.751],
    [38.53855, -121.75035],
  ],
  [
    [38.53885, -121.7499],
    [38.53906, -121.74925],
  ],
];

/** Voyager: streets + labels/POIs. Query string busts stale tile HTTP caches. */
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> · <a href="https://carto.com/attributions" rel="noreferrer">CARTO</a>';

function cartoRaster(path: string) {
  return `https://{s}.basemaps.cartocdn.com${path}?_${TILE_CACHE_REVISION}`;
}

const TILE_VOYAGER = cartoRaster(`/rastertiles/voyager/{z}/{x}/{y}.png`);
const TILE_DARK_BASE = cartoRaster(`/dark_nolabels/{z}/{x}/{y}.png`);
const TILE_DARK_LABELS = cartoRaster(`/dark_only_labels/{z}/{x}/{y}.png`);

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

export function AccessibilityLeafletMap({ layers }: AccessibilityMapProps) {
  const isDark = useDocumentDarkClass();

  return (
    <MapContainer
      key={`${TILE_CACHE_REVISION}-${isDark ? "dark" : "light"}`}
      attributionControl
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      keyboard={false}
      center={ORIGIN}
      zoom={18}
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

      {layers.route && (
        <Pane name="route" style={{ zIndex: 450 }}>
          <Polyline
            positions={ROUTE}
            pathOptions={{
              color: "#ffffff",
              weight: 13,
              opacity: 0.52,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          <Polyline
            positions={ROUTE}
            pathOptions={{
              color: BRAND,
              weight: 6,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          <Polyline
            positions={ROUTE}
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

      {layers.heatmap && (
        <Pane name="heatmap" style={{ zIndex: 420 }}>
          {HEAT_RECTANGLES.map((bounds, idx) => (
            <Rectangle
              key={idx}
              bounds={bounds}
              pathOptions={{
                color: BRAND,
                fillColor: BRAND,
                fillOpacity: isDark ? 0.16 : 0.1,
                weight: 0,
              }}
            />
          ))}
        </Pane>
      )}

      {layers.dangerZones && (
        <Pane name="danger" style={{ zIndex: 430 }}>
          <Rectangle
            bounds={DANGER_BOUNDS}
            pathOptions={{
              color: "rgba(239,68,68,0.55)",
              fillColor: "rgba(239,68,68,0.16)",
              fillOpacity: 1,
              weight: 1.5,
              dashArray: "6 10",
              lineCap: "round",
            }}
          />
        </Pane>
      )}

      {layers.obstacles && (
        <Pane name="obstacles" style={{ zIndex: 440 }}>
          {OBSTACLE_CENTERS.map((c, i) => (
            <CircleMarker
              key={i}
              center={c}
              radius={7}
              pathOptions={{
                color: "#ffffff",
                fillColor: "rgba(250,204,21,0.85)",
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}
        </Pane>
      )}
    </MapContainer>
  );
}
