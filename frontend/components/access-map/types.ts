import type { ReactNode } from "react";

import type { AccessibilityPoint, HeatmapPoint, RouteGeoJSON, TransitStop, HazardReport } from "@/lib/api";

export type MapLayerToggle = {
  route: boolean;
  heatmap: boolean;
  obstacles: boolean;
  accessibilityPoints: boolean;
  hazards: boolean;
};

export type AccessibilityMapProps = {
  layers: MapLayerToggle;
  routeGeoJSON?: RouteGeoJSON | null;
  heatmapPoints?: HeatmapPoint[];
  transitStops?: TransitStop[];
  accessibilityPoints?: AccessibilityPoint[];
  hazards?: HazardReport[];
  draftHazardLatLon?: [number, number] | null;
  draftHazardPopup?: ReactNode;
  onDraftHazardClose?: () => void;
  originLatLon?: [number, number] | null;
  destLatLon?: [number, number] | null;
  onMapClick?: (lat: number, lon: number) => void;
};
