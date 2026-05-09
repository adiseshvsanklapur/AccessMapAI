"""
graph_builder.py — Parse downloaded OSM JSON into a NetworkX pedestrian graph.

Reads sidewalks_paths.json and accessibility_features.json to build a graph where:
  - Nodes = OSM nodes (lat, lng, tags)
  - Edges = OSM way segments between consecutive nodes (with surface, width, highway tags)
  - Edge weights = haversine distance in meters
"""

import json
import math
import networkx as nx
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Haversine distance (meters)
# ---------------------------------------------------------------------------
def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in meters."""
    R = 6_371_000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Parse OSM JSON elements
# ---------------------------------------------------------------------------
def _parse_osm_json(filepath: Path) -> tuple[dict, list]:
    """
    Parse an Overpass API JSON response.
    Returns (nodes_dict, ways_list).
    nodes_dict: {node_id: {"lat": ..., "lon": ..., "tags": {...}}}
    ways_list: [{"id": ..., "nodes": [...], "tags": {...}}, ...]
    """
    with open(filepath, "r") as f:
        data = json.load(f)

    nodes = {}
    ways = []

    for el in data.get("elements", []):
        if el["type"] == "node":
            nodes[el["id"]] = {
                "lat": el["lat"],
                "lon": el["lon"],
                "tags": el.get("tags", {}),
            }
        elif el["type"] == "way":
            ways.append({
                "id": el["id"],
                "nodes": el.get("nodes", []),
                "tags": el.get("tags", {}),
            })

    return nodes, ways


def _parse_osm_geom_json(filepath: Path) -> list[dict]:
    """
    Parse an Overpass API JSON response with `out geom` (geometry inline).
    Returns list of elements with geometry.
    """
    with open(filepath, "r") as f:
        data = json.load(f)
    return data.get("elements", [])


# ---------------------------------------------------------------------------
# Surface quality scoring
# ---------------------------------------------------------------------------
SURFACE_SCORES = {
    # 1.0 = excellent, 0.0 = impassable
    "asphalt": 1.0,
    "concrete": 0.95,
    "paved": 0.9,
    "paving_stones": 0.8,
    "sett": 0.6,
    "concrete:plates": 0.85,
    "concrete:lanes": 0.85,
    "cobblestone": 0.4,
    "unhewn_cobblestone": 0.3,
    "compacted": 0.7,
    "fine_gravel": 0.6,
    "gravel": 0.4,
    "pebblestone": 0.3,
    "dirt": 0.3,
    "earth": 0.25,
    "mud": 0.1,
    "sand": 0.15,
    "grass": 0.2,
    "wood": 0.7,
    "metal": 0.8,
}

HIGHWAY_TYPE_SCORES = {
    # How suitable is this highway type for pedestrians?
    "footway": 1.0,
    "pedestrian": 1.0,
    "path": 0.8,
    "cycleway": 0.5,
    "steps": 0.2,  # stairs — bad for wheelchair
    "residential": 0.6,
    "service": 0.5,
    "living_street": 0.8,
    "track": 0.4,
}


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------
def build_pedestrian_graph(
    data_dir: Path,
    sidewalks_file: str = "sidewalks_paths.json",
    davis_sidewalks_file: str = "davis_all_sidewalks.json",
) -> nx.Graph:
    """
    Build a NetworkX graph from downloaded OSM pedestrian data.

    Returns an undirected graph where:
      - Each node has: lat, lon, tags
      - Each edge has: distance_m, highway, surface, surface_score,
        highway_score, width, incline, way_id, has_stairs
    """
    G = nx.Graph()

    # Merge data from both UC Davis campus and wider Davis sidewalks
    all_nodes = {}
    all_ways = []

    for fname in [sidewalks_file, davis_sidewalks_file]:
        fpath = data_dir / fname
        if fpath.exists():
            nodes, ways = _parse_osm_json(fpath)
            all_nodes.update(nodes)
            all_ways.extend(ways)
            print(f"  Loaded {fname}: {len(nodes)} nodes, {len(ways)} ways")

    # Deduplicate ways by ID
    seen_way_ids = set()
    unique_ways = []
    for w in all_ways:
        if w["id"] not in seen_way_ids:
            seen_way_ids.add(w["id"])
            unique_ways.append(w)

    print(f"  Total unique: {len(all_nodes)} nodes, {len(unique_ways)} ways")

    # Add nodes to graph
    for node_id, node_data in all_nodes.items():
        G.add_node(
            node_id,
            lat=node_data["lat"],
            lon=node_data["lon"],
            tags=node_data["tags"],
        )

    # Add edges from ways
    edges_added = 0
    for way in unique_ways:
        tags = way["tags"]
        highway_type = tags.get("highway", "path")
        surface = tags.get("surface", "unknown")
        width_str = tags.get("width", "")
        incline_str = tags.get("incline", "")

        surface_score = SURFACE_SCORES.get(surface, 0.7)  # default moderate
        highway_score = HIGHWAY_TYPE_SCORES.get(highway_type, 0.5)
        has_stairs = highway_type == "steps"

        # Parse width (meters)
        width = None
        if width_str:
            try:
                width = float(width_str.replace("m", "").strip())
            except ValueError:
                pass

        # Parse incline (percentage)
        incline = None
        if incline_str:
            try:
                incline = float(incline_str.replace("%", "").strip())
            except ValueError:
                if incline_str == "up":
                    incline = 5.0
                elif incline_str == "down":
                    incline = -5.0

        node_ids = way["nodes"]
        for i in range(len(node_ids) - 1):
            n1, n2 = node_ids[i], node_ids[i + 1]

            # Both nodes must exist
            if n1 not in all_nodes or n2 not in all_nodes:
                continue

            d1 = all_nodes[n1]
            d2 = all_nodes[n2]
            dist = haversine(d1["lat"], d1["lon"], d2["lat"], d2["lon"])

            G.add_edge(
                n1, n2,
                distance_m=dist,
                highway=highway_type,
                surface=surface,
                surface_score=surface_score,
                highway_score=highway_score,
                has_stairs=has_stairs,
                width=width,
                incline=incline,
                way_id=way["id"],
                # These will be filled by enrichment
                slope=None,
                crowd_score=0.5,
                noise_score=0.5,
                lighting_score=0.5,
                kerb_score=1.0,
                accessibility_score=0.5,
            )
            edges_added += 1

    print(f"  Graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    # Remove isolated nodes (no edges)
    isolates = list(nx.isolates(G))
    G.remove_nodes_from(isolates)
    print(f"  After cleanup: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges (removed {len(isolates)} isolates)")

    return G


# ---------------------------------------------------------------------------
# Load auxiliary spatial data (buildings, roads, etc.)
# ---------------------------------------------------------------------------
def load_buildings(data_dir: Path) -> list[dict]:
    """Load building centroids from OSM buildings data."""
    fpath = data_dir / "buildings.json"
    if not fpath.exists():
        return []

    elements = _parse_osm_geom_json(fpath)
    buildings = []

    for el in elements:
        if el["type"] == "way" and "geometry" in el:
            # Calculate centroid from geometry
            lats = [p["lat"] for p in el["geometry"]]
            lons = [p["lon"] for p in el["geometry"]]
            buildings.append({
                "lat": sum(lats) / len(lats),
                "lon": sum(lons) / len(lons),
                "tags": el.get("tags", {}),
                "id": el["id"],
            })

    print(f"  Loaded {len(buildings)} buildings")
    return buildings


def load_roads(data_dir: Path) -> tuple[dict, list]:
    """Load roads for noise estimation."""
    fpath = data_dir / "roads.json"
    if not fpath.exists():
        return {}, []
    nodes, ways = _parse_osm_json(fpath)
    print(f"  Loaded {len(ways)} roads")
    return nodes, ways


def load_accessibility_features(data_dir: Path) -> list[dict]:
    """Load accessibility features (kerbs, crossings, wheelchair tags)."""
    fpath = data_dir / "accessibility_features.json"
    if not fpath.exists():
        return []

    elements = _parse_osm_geom_json(fpath)
    features = []

    for el in elements:
        if el["type"] == "node":
            features.append({
                "lat": el.get("lat"),
                "lon": el.get("lon"),
                "tags": el.get("tags", {}),
                "id": el["id"],
                "type": "node",
            })
        elif el["type"] == "way" and "geometry" in el:
            lats = [p["lat"] for p in el["geometry"]]
            lons = [p["lon"] for p in el["geometry"]]
            features.append({
                "lat": sum(lats) / len(lats),
                "lon": sum(lons) / len(lons),
                "tags": el.get("tags", {}),
                "id": el["id"],
                "type": "way",
            })

    print(f"  Loaded {len(features)} accessibility features")
    return features


def load_lighting(data_dir: Path) -> list[dict]:
    """Load street lighting data."""
    fpath = data_dir / "davis_lighting.json"
    if not fpath.exists():
        return []

    elements = _parse_osm_geom_json(fpath)
    lights = []

    for el in elements:
        if el["type"] == "node":
            lights.append({
                "lat": el.get("lat"),
                "lon": el.get("lon"),
                "id": el["id"],
            })
        elif el["type"] == "way" and "geometry" in el:
            # Lit roads — sample midpoints
            geom = el["geometry"]
            mid = len(geom) // 2
            lights.append({
                "lat": geom[mid]["lat"],
                "lon": geom[mid]["lon"],
                "id": el["id"],
            })

    print(f"  Loaded {len(lights)} lighting features")
    return lights
