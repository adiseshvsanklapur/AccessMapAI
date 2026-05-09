export type MapLayerToggle = {
  route: boolean;
  heatmap: boolean;
  obstacles: boolean;
  dangerZones: boolean;
};

export type AccessibilityMapProps = {
  layers: MapLayerToggle;
};
