"""
scoring.py — Heuristic scoring functions for crowd density, noise, and lighting.

These functions compute per-edge accessibility scores using spatial heuristics
based on time of day, building density, road proximity, and lighting data.
No external APIs needed — all computed from downloaded OSM data.
"""

import math
import networkx as nx
from scipy.spatial import KDTree
import numpy as np
from typing import Optional


# ---------------------------------------------------------------------------
# Crowd Density Estimation
# ---------------------------------------------------------------------------
def crowd_score_time(hour: int, is_weekday: bool) -> float:
    """Returns crowd density score 0.0-1.0 based on time of day."""
    if not is_weekday:
        if 10 <= hour <= 14:
            return 0.4
        elif 8 <= hour <= 18:
            return 0.25
        else:
            return 0.1

    # Weekday campus patterns
    if 8 <= hour < 10:
        return 0.7
    elif 10 <= hour < 12:
        return 0.85
    elif 12 <= hour < 14:
        return 0.95
    elif 14 <= hour < 17:
        return 0.75
    elif 17 <= hour < 19:
        return 0.6
    elif 19 <= hour < 22:
        return 0.3
    else:
        return 0.1


def _build_kdtree(points: list[dict]) -> tuple[Optional[KDTree], list[dict]]:
    """Build a KDTree from a list of points with lat/lon."""
    if not points:
        return None, []

    valid = [p for p in points if p.get("lat") is not None and p.get("lon") is not None]
    if not valid:
        return None, []

    coords = np.array([[p["lat"], p["lon"]] for p in valid])
    return KDTree(coords), valid


def compute_building_density(
    lat: float, lon: float,
    building_tree: Optional[KDTree],
    radius_deg: float = 0.001,  # ~111 meters
) -> float:
    """Count buildings within radius and normalize to 0-1."""
    if building_tree is None:
        return 0.5  # default moderate

    count = building_tree.query_ball_point([lat, lon], r=radius_deg)
    n = len(count)
    # ~15+ buildings in ~100m = very dense campus core
    return min(n / 15.0, 1.0)


# ---------------------------------------------------------------------------
# Noise Estimation
# ---------------------------------------------------------------------------
ROAD_NOISE_DB = {
    "motorway": 75,
    "trunk": 72,
    "primary": 68,
    "secondary": 64,
    "tertiary": 60,
    "residential": 55,
    "service": 50,
    "living_street": 48,
    "footway": 35,
    "path": 30,
}


def estimate_noise_at_point(
    lat: float, lon: float,
    road_segments: list[dict],
    road_tree: Optional[KDTree],
    road_points_data: list[dict],
) -> float:
    """
    Estimate noise level (dB) at a point based on nearest road.
    Uses FHWA line-source attenuation heuristic.
    """
    if road_tree is None:
        return 45.0  # default moderate ambient

    # Find nearest road point
    dist_deg, idx = road_tree.query([lat, lon])
    dist_m = dist_deg * 111_000  # rough degree-to-meters

    if idx < len(road_points_data):
        road_type = road_points_data[idx].get("highway", "residential")
    else:
        road_type = "residential"

    ref_db = ROAD_NOISE_DB.get(road_type, 55)
    ref_distance = 15.0

    # Attenuation: ~3 dB per doubling of distance (hard surface)
    if dist_m > 1:
        doublings = math.log2(max(dist_m / ref_distance, 0.1))
        attenuation = doublings * 3.0
    else:
        attenuation = 0

    return max(ref_db - attenuation, 30)


def noise_to_score(noise_db: float) -> float:
    """Convert dB(A) to a 0-1 noise severity score."""
    if noise_db <= 45:
        return noise_db / 225
    elif noise_db <= 60:
        return 0.2 + (noise_db - 45) / 50
    elif noise_db <= 70:
        return 0.5 + (noise_db - 60) / 33.3
    else:
        return min(0.8 + (noise_db - 70) / 50, 1.0)


# ---------------------------------------------------------------------------
# Lighting Estimation
# ---------------------------------------------------------------------------
def compute_lighting_score(
    lat: float, lon: float,
    hour: int,
    light_tree: Optional[KDTree],
    edge_data: dict,
    radius_deg: float = 0.0005,  # ~55 meters
) -> float:
    """
    Estimate lighting quality at a point. 1.0 = well-lit, 0.0 = dark.
    """
    # Daytime is always well-lit
    if 7 <= hour <= 18:
        return 1.0

    # Dusk/dawn
    if hour in (6, 19):
        return 0.7

    # Nighttime — check for nearby lights
    base = 0.15

    if light_tree is not None:
        nearby = light_tree.query_ball_point([lat, lon], r=radius_deg)
        if len(nearby) > 0:
            base += min(len(nearby) * 0.2, 0.6)

    # Road type bonus (major roads tend to be lit)
    highway = edge_data.get("highway", "")
    if highway in ("primary", "secondary", "tertiary"):
        base += 0.1

    return min(base, 1.0)


# ---------------------------------------------------------------------------
# Kerb / Curb Ramp Scoring
# ---------------------------------------------------------------------------
def compute_kerb_score(
    lat: float, lon: float,
    accessibility_tree: Optional[KDTree],
    accessibility_data: list[dict],
    radius_deg: float = 0.0003,  # ~33 meters
) -> float:
    """
    Score based on nearby curb ramps / kerbs.
    1.0 = good (lowered/flush kerbs nearby)
    0.3 = bad (raised kerbs, no ramps)
    """
    if accessibility_tree is None:
        return 0.7  # unknown, assume moderate

    nearby_idx = accessibility_tree.query_ball_point([lat, lon], r=radius_deg)

    if not nearby_idx:
        return 0.7  # no data, assume moderate

    best_score = 0.5
    for idx in nearby_idx:
        if idx >= len(accessibility_data):
            continue
        tags = accessibility_data[idx].get("tags", {})
        kerb = tags.get("kerb", "")

        if kerb == "flush":
            best_score = max(best_score, 1.0)
        elif kerb == "lowered":
            best_score = max(best_score, 0.9)
        elif kerb == "raised":
            best_score = min(best_score, 0.3)

        # Tactile paving is good for blind users
        if tags.get("tactile_paving") == "yes":
            best_score = max(best_score, 0.85)

    return best_score


# ---------------------------------------------------------------------------
# Crossing Signal Score (for blind / low-vision users)
# ---------------------------------------------------------------------------
def compute_crossing_signal_score(
    lat: float, lon: float,
    acc_tree: Optional[KDTree],
    acc_data: list[dict],
    radius_deg: float = 0.0005,  # ~55 meters
) -> float:
    """
    Score based on proximity to signalized crossings.
    Higher = closer to an audible/signalized crossing.
    Important for blind users who rely on audio cues.
    """
    if acc_tree is None:
        return 0.5

    nearby_idx = acc_tree.query_ball_point([lat, lon], r=radius_deg)
    if not nearby_idx:
        return 0.3  # no crossings nearby

    best = 0.3
    for idx in nearby_idx:
        if idx >= len(acc_data):
            continue
        tags = acc_data[idx].get("tags", {})
        crossing = tags.get("crossing", "")
        has_signals = (
            crossing == "traffic_signals"
            or tags.get("crossing:signals") == "yes"
        )
        if has_signals:
            best = max(best, 1.0)  # signalized = best
        elif crossing in ("marked", "zebra"):
            best = max(best, 0.7)  # marked but no signal
        elif crossing == "uncontrolled":
            best = max(best, 0.5)

    return best


# ---------------------------------------------------------------------------
# Tactile Paving Score (for blind / low-vision users)
# ---------------------------------------------------------------------------
def compute_tactile_score(
    lat: float, lon: float,
    acc_tree: Optional[KDTree],
    acc_data: list[dict],
    radius_deg: float = 0.0004,  # ~44 meters
) -> float:
    """
    Score based on proximity to tactile paving features.
    Higher = tactile guidance strips nearby (good for blind navigation).
    """
    if acc_tree is None:
        return 0.5

    nearby_idx = acc_tree.query_ball_point([lat, lon], r=radius_deg)
    if not nearby_idx:
        return 0.3  # no tactile features

    tactile_count = 0
    for idx in nearby_idx:
        if idx >= len(acc_data):
            continue
        tags = acc_data[idx].get("tags", {})
        if tags.get("tactile_paving") == "yes":
            tactile_count += 1

    if tactile_count >= 2:
        return 1.0
    elif tactile_count == 1:
        return 0.8
    return 0.4


# ---------------------------------------------------------------------------
# Main enrichment function
# ---------------------------------------------------------------------------
def enrich_graph_with_scores(
    G: nx.Graph,
    buildings: list[dict],
    road_nodes: dict,
    road_ways: list[dict],
    accessibility_features: list[dict],
    lighting: list[dict],
    hour: int = 12,
    is_weekday: bool = True,
) -> None:
    """
    Enrich all edges in the graph with crowd, noise, lighting, and kerb scores.
    """
    print(f"\n[Scoring] Enriching graph edges (hour={hour}, weekday={is_weekday})...")

    # Build spatial indices
    print("  Building spatial indices...")
    building_tree, building_data = _build_kdtree(buildings)

    # Build road points KDTree from road way nodes
    road_points = []
    for way in road_ways:
        highway_type = way["tags"].get("highway", "residential")
        for nid in way["nodes"]:
            if nid in road_nodes:
                nd = road_nodes[nid]
                road_points.append({
                    "lat": nd["lat"],
                    "lon": nd["lon"],
                    "highway": highway_type,
                })

    road_tree, road_points_data = _build_kdtree(road_points)
    acc_tree, acc_data = _build_kdtree(accessibility_features)
    light_tree, light_data = _build_kdtree(lighting)

    print(f"  Spatial indices: buildings={building_tree is not None}, "
          f"roads={road_tree is not None}, "
          f"accessibility={acc_tree is not None}, "
          f"lighting={light_tree is not None}")

    # Time-based crowd score (constant for all edges)
    time_crowd = crowd_score_time(hour, is_weekday)

    # Enrich each edge
    enriched = 0
    for u, v, data in G.edges(data=True):
        # Edge midpoint
        lat_u = G.nodes[u].get("lat", 0)
        lon_u = G.nodes[u].get("lon", 0)
        lat_v = G.nodes[v].get("lat", 0)
        lon_v = G.nodes[v].get("lon", 0)
        mid_lat = (lat_u + lat_v) / 2
        mid_lon = (lon_u + lon_v) / 2

        # Crowd score (time + building density)
        bldg_density = compute_building_density(mid_lat, mid_lon, building_tree)
        data["crowd_score"] = 0.6 * time_crowd + 0.4 * bldg_density

        # Noise score
        noise_db = estimate_noise_at_point(
            mid_lat, mid_lon, road_ways, road_tree, road_points_data
        )
        data["noise_db"] = noise_db
        data["noise_score"] = noise_to_score(noise_db)

        # Lighting score
        data["lighting_score"] = compute_lighting_score(
            mid_lat, mid_lon, hour, light_tree, data
        )

        # Kerb score
        data["kerb_score"] = compute_kerb_score(
            mid_lat, mid_lon, acc_tree, acc_data
        )

        # Crossing signal score (for blind users)
        data["crossing_signal_score"] = compute_crossing_signal_score(
            mid_lat, mid_lon, acc_tree, acc_data
        )

        # Tactile paving score (for blind users)
        data["tactile_score"] = compute_tactile_score(
            mid_lat, mid_lon, acc_tree, acc_data
        )

        # Combined accessibility score (unweighted average — profiles will re-weight)
        slope_penalty = 0.0
        if data.get("slope") is not None:
            slope_penalty = min(abs(data["slope"]) / 15.0, 1.0)  # 15% = max penalty

        data["accessibility_score"] = (
            0.2 * data["surface_score"]
            + 0.2 * data["highway_score"]
            + 0.15 * (1 - data["crowd_score"])
            + 0.15 * (1 - data["noise_score"])
            + 0.1 * data["lighting_score"]
            + 0.1 * data["kerb_score"]
            + 0.1 * (1 - slope_penalty)
        )

        enriched += 1

    print(f"  Enriched {enriched} edges with accessibility scores")
