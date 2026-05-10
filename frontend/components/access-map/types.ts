import type { AccessibilityPoint, HeatmapPoint, RouteGeoJSON, TransitStop } from "@/lib/api";

export type MapLayerToggle = {
  route: boolean;
  heatmap: boolean;
  obstacles: boolean;
  dangerZones: boolean;
  accessibilityPoints: boolean;
};

export type AccessibilityMapProps = {
  layers: MapLayerToggle;
  routeGeoJSON?: RouteGeoJSON | null;
  heatmapPoints?: HeatmapPoint[];
  transitStops?: TransitStop[];
  accessibilityPoints?: AccessibilityPoint[];
  originLatLon?: [number, number] | null;
  destLatLon?: [number, number] | null;
  onMapClick?: (lat: number, lon: number) => void;
};
