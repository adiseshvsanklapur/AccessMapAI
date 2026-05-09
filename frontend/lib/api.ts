/**
 * api.ts — Typed API client for the AccessMap AI backend.
 *
 * All functions hit the FastAPI server running on localhost:8000.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface RouteScores {
  overall: number;
  slope: number;
  surface: number;
  noise: number;
  crowd: number;
  lighting: number;
  kerb: number;
}

export interface RoutePathPoint {
  lat: number;
  lon: number;
  node_id: number;
}

export interface RouteGeoJSON {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  properties: {
    profile: string;
    distance_m: number;
    scores: RouteScores;
  };
}

export interface RouteResponse {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  profile: string;
  profile_display: string;
  distance_m: number;
  path: RoutePathPoint[];
  explanation: string;
  scores: RouteScores;
  geojson: RouteGeoJSON;
  error?: string;
}

export interface HeatmapPoint {
  lat: number;
  lon: number;
  value: number;
}

export interface HeatmapResponse {
  metric: string;
  bounds: { north: number; south: number; east: number; west: number };
  count: number;
  points: HeatmapPoint[];
}

export interface TransitStop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
  wheelchair_boarding: string;
}

export interface TransitRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
}

export interface TransitResponse {
  stops: TransitStop[];
  routes: TransitRoute[];
}

export interface Profile {
  name: string;
  display_name: string;
  description: string;
}

export interface ServerStats {
  nodes: number;
  edges: number;
  transit_stops: number;
  transit_routes: number;
  buildings: number;
  ready: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------
export async function fetchRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  profile: string = "default",
): Promise<RouteResponse> {
  return apiFetch<RouteResponse>(
    `/route?origin_lat=${originLat}&origin_lon=${originLon}&dest_lat=${destLat}&dest_lon=${destLon}&profile=${profile}`,
  );
}

export async function fetchHeatmap(
  metric: string = "accessibility_score",
  bounds?: { north: number; south: number; east: number; west: number },
): Promise<HeatmapResponse> {
  const b = bounds ?? { north: 38.55, south: 38.53, east: -121.73, west: -121.77 };
  return apiFetch<HeatmapResponse>(
    `/heatmap?metric=${metric}&north=${b.north}&south=${b.south}&east=${b.east}&west=${b.west}`,
  );
}

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await apiFetch<{ profiles: Profile[] }>("/profiles");
  return res.profiles;
}

export async function fetchTransit(): Promise<TransitResponse> {
  return apiFetch<TransitResponse>("/transit");
}

export async function fetchStats(): Promise<ServerStats> {
  return apiFetch<ServerStats>("/stats");
}

export async function checkHealth(): Promise<{ status: string; stats: ServerStats }> {
  return apiFetch<{ status: string; stats: ServerStats }>("/");
}
