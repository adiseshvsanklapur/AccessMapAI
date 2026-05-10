"""
engine.py — Accessibility-aware routing engine.

Uses NetworkX Dijkstra shortest path with profile-specific edge cost functions.
Returns routes with geometry, accessibility breakdown, and AI-style explanations.
"""

import math
import networkx as nx
from scipy.spatial import KDTree
import numpy as np
from typing import Optional

from .profiles import AccessibilityProfile, get_profile


# ---------------------------------------------------------------------------
# Edge cost function
# ---------------------------------------------------------------------------
def compute_edge_cost(
    u: int, v: int, data: dict,
    profile: AccessibilityProfile,
    G: nx.Graph,
) -> float:
    """
    Compute the traversal cost of an edge based on the user's accessibility profile.

    The cost is:  distance * (1 + penalty_sum)

    Where penalty_sum is a weighted combination of accessibility factors.
    Higher penalties make the edge less desirable.
    """
    distance = data.get("distance_m", 1.0)
    if distance <= 0:
        distance = 1.0

    # --- Hard constraints: make edge effectively impassable ---

    # Stairs avoidance
    if profile.avoid_stairs and data.get("has_stairs", False):
        return distance * 1000  # effectively infinite

    # Width constraint
    if profile.requires_width and data.get("width") is not None:
        if data["width"] < profile.requires_width:
            return distance * 50  # very high penalty

    # Max slope constraint
    slope = data.get("slope")
    if profile.max_slope is not None and slope is not None:
        if abs(slope) > profile.max_slope:
            return distance * 20  # high penalty

    # Unpaved avoidance
    if profile.avoid_unpaved:
        surface_score = data.get("surface_score", 0.7)
        if surface_score < 0.4:  # gravel, dirt, mud, etc.
            return distance * 15

    # --- Soft penalties ---
    penalty = 0.0

    # Slope penalty
    if slope is not None:
        slope_severity = min(abs(slope) / 15.0, 1.0)
        penalty += profile.slope_weight * slope_severity

    # Surface penalty (invert: bad surface = high penalty)
    surface_score = data.get("surface_score", 0.7)
    penalty += profile.surface_weight * (1 - surface_score)

    # Noise penalty
    noise_score = data.get("noise_score", 0.5)
    penalty += profile.noise_weight * noise_score

    # Crowd penalty
    crowd_score = data.get("crowd_score", 0.5)
    penalty += profile.crowd_weight * crowd_score

    # Lighting penalty (invert: bad lighting = high penalty)
    lighting_score = data.get("lighting_score", 0.5)
    penalty += profile.lighting_weight * (1 - lighting_score)

    # Kerb penalty (invert: bad kerbs = high penalty)
    kerb_score = data.get("kerb_score", 0.7)
    penalty += profile.kerb_weight * (1 - kerb_score)

    # Stairs soft penalty (if not avoiding entirely)
    if data.get("has_stairs", False):
        penalty += profile.stairs_penalty

    # Crossing signal bonus (negative penalty = lower cost for signalized crossings)
    crossing_signal = data.get("crossing_signal_score", 0.5)
    penalty -= profile.crossing_signal_weight * crossing_signal * 0.3

    # Tactile paving bonus (negative penalty = lower cost for tactile paving routes)
    tactile = data.get("tactile_score", 0.5)
    penalty -= profile.tactile_weight * tactile * 0.3

    # Ensure penalty doesn't go below -0.5 (route shouldn't be "free")
    penalty = max(penalty, -0.5)

    # Final cost: distance scaled by (1 + penalty)
    return distance * (1 + penalty)


# ---------------------------------------------------------------------------
# Find nearest graph node to a lat/lon
# ---------------------------------------------------------------------------
def find_nearest_node(
    G: nx.Graph,
    lat: float, lon: float,
    node_tree: Optional[KDTree] = None,
    node_ids: Optional[list] = None,
) -> Optional[int]:
    """Find the nearest graph node to a given lat/lon coordinate."""
    if node_tree is not None and node_ids is not None:
        dist, idx = node_tree.query([lat, lon])
        return node_ids[idx]

    # Fallback: brute force
    best_node = None
    best_dist = float("inf")
    for nid, data in G.nodes(data=True):
        nlat = data.get("lat", 0)
        nlon = data.get("lon", 0)
        d = (nlat - lat) ** 2 + (nlon - lon) ** 2
        if d < best_dist:
            best_dist = d
            best_node = nid
    return best_node


def _build_node_kdtree(G: nx.Graph) -> tuple[KDTree, list]:
    """Build a KDTree from graph nodes for fast nearest-node lookups."""
    node_ids = []
    coords = []
    for nid, data in G.nodes(data=True):
        if "lat" in data and "lon" in data:
            node_ids.append(nid)
            coords.append([data["lat"], data["lon"]])

    tree = KDTree(np.array(coords))
    return tree, node_ids


# ---------------------------------------------------------------------------
# Route explanation generator
# ---------------------------------------------------------------------------
def _generate_explanation(
    path_edges: list[dict],
    profile: AccessibilityProfile,
) -> str:
    """Generate a human-readable explanation of why this route was chosen."""
    reasons = []

    # Analyze path characteristics
    total_dist = sum(e.get("distance_m", 0) for e in path_edges)
    avg_slope = 0
    max_slope = 0
    has_stairs = any(e.get("has_stairs", False) for e in path_edges)
    avg_noise = sum(e.get("noise_score", 0.5) for e in path_edges) / max(len(path_edges), 1)
    avg_crowd = sum(e.get("crowd_score", 0.5) for e in path_edges) / max(len(path_edges), 1)
    avg_surface = sum(e.get("surface_score", 0.7) for e in path_edges) / max(len(path_edges), 1)
    avg_lighting = sum(e.get("lighting_score", 0.5) for e in path_edges) / max(len(path_edges), 1)

    slopes = [abs(e.get("slope", 0) or 0) for e in path_edges]
    if slopes:
        avg_slope = sum(slopes) / len(slopes)
        max_slope = max(slopes)

    reasons.append(f"This route is {total_dist:.0f} meters long")

    # Profile-specific insights
    if profile.name == "wheelchair":
        if max_slope <= 5:
            reasons.append("with gentle slopes throughout")
        elif max_slope <= 8.33:
            reasons.append("staying within ADA slope guidelines")
        if avg_surface > 0.8:
            reasons.append("on smooth, paved surfaces")
        if not has_stairs:
            reasons.append("with no stairs")

    elif profile.name == "blind":
        if avg_noise < 0.4:
            reasons.append("through quieter areas for easier orientation")
        if avg_crowd < 0.5:
            reasons.append("avoiding crowded walkways")

        # Crossing signal info
        avg_crossing = sum(e.get("crossing_signal_score", 0.5) for e in path_edges) / max(len(path_edges), 1)
        if avg_crossing > 0.7:
            reasons.append("preferring signalized crossings with audio cues")
        elif avg_crossing > 0.5:
            reasons.append("using marked crossings where available")

        # Tactile paving info
        avg_tactile = sum(e.get("tactile_score", 0.5) for e in path_edges) / max(len(path_edges), 1)
        if avg_tactile > 0.7:
            reasons.append("along paths with tactile paving guidance")
        elif avg_tactile > 0.5:
            reasons.append("with some tactile paving coverage")

        if avg_surface > 0.7:
            reasons.append("on consistent, predictable surfaces")

    elif profile.name == "neurodivergent":
        if avg_noise < 0.4:
            reasons.append("minimizing noise exposure")
        if avg_crowd < 0.5:
            reasons.append("through calmer, less crowded paths")

    elif profile.name == "elderly":
        if max_slope <= 8:
            reasons.append("with manageable slopes")
        if avg_lighting > 0.6:
            reasons.append("along well-lit paths")

    elif profile.name == "temporary_injury":
        if not has_stairs:
            reasons.append("avoiding all stairs")
        if avg_surface > 0.7:
            reasons.append("on stable, paved surfaces")

    if avg_lighting > 0.7:
        reasons.append("with good lighting coverage")
    elif avg_lighting < 0.3:
        reasons.append("(note: some sections have limited lighting)")

    return ", ".join(reasons) + "."


def _compute_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute bearing in degrees from point 1 to point 2."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def _bearing_to_direction(bearing: float) -> str:
    """Convert bearing to cardinal direction."""
    dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]
    idx = round(bearing / 45) % 8
    return dirs[idx]


def _turn_instruction(angle_change: float) -> str:
    """Convert bearing change to turn instruction."""
    if abs(angle_change) < 20:
        return "continue straight"
    elif angle_change > 0:
        if angle_change > 120:
            return "make a sharp right"
        elif angle_change > 60:
            return "turn right"
        else:
            return "bear right"
    else:
        if angle_change < -120:
            return "make a sharp left"
        elif angle_change < -60:
            return "turn left"
        else:
            return "bear left"


def _generate_directions(
    path_coords: list[dict],
    path_edges: list[dict],
) -> list[dict]:
    """Generate step-by-step text directions from a route path."""
    if len(path_coords) < 2:
        return []

    steps = []

    # First step: head in initial direction
    p0, p1 = path_coords[0], path_coords[1]
    bearing = _compute_bearing(p0["lat"], p0["lon"], p1["lat"], p1["lon"])
    direction = _bearing_to_direction(bearing)

    steps.append({
        "step": 1,
        "instruction": f"Head {direction}",
        "distance_m": round(path_edges[0].get("distance_m", 0), 1) if path_edges else 0,
        "surface": path_edges[0].get("surface", "paved") if path_edges else "unknown",
    })

    # Subsequent steps: detect turns
    prev_bearing = bearing
    cumulative_dist = path_edges[0].get("distance_m", 0) if path_edges else 0

    for i in range(1, len(path_coords) - 1):
        p_prev, p_curr, p_next = path_coords[i-1], path_coords[i], path_coords[i+1]
        new_bearing = _compute_bearing(p_curr["lat"], p_curr["lon"], p_next["lat"], p_next["lon"])

        # Calculate turn angle (-180 to 180)
        angle_change = new_bearing - prev_bearing
        if angle_change > 180:
            angle_change -= 360
        elif angle_change < -180:
            angle_change += 360

        edge_dist = path_edges[i].get("distance_m", 0) if i < len(path_edges) else 0

        # Only report significant turns (> 20 degrees)
        if abs(angle_change) > 20:
            turn = _turn_instruction(angle_change)
            surface = path_edges[i].get("surface", "paved") if i < len(path_edges) else "unknown"

            steps.append({
                "step": len(steps) + 1,
                "instruction": f"In {round(cumulative_dist)}m, {turn}",
                "distance_m": round(edge_dist, 1),
                "surface": surface,
            })
            cumulative_dist = edge_dist
        else:
            cumulative_dist += edge_dist

        prev_bearing = new_bearing

    # Final step: arrive
    steps.append({
        "step": len(steps) + 1,
        "instruction": f"Continue {round(cumulative_dist)}m to your destination",
        "distance_m": round(cumulative_dist, 1),
        "surface": "paved",
    })

    return steps


# ---------------------------------------------------------------------------
# Main routing function
# ---------------------------------------------------------------------------
class RoutingEngine:
    """Accessibility-aware routing engine."""

    def __init__(self, G: nx.Graph):
        self.G = G
        if G.number_of_nodes() == 0:
            self.node_tree = None
            self.node_ids = []
            print("  Warning: Routing engine initialized with empty graph")
            return
        self.node_tree, self.node_ids = _build_node_kdtree(G)
        print(f"  Routing engine initialized ({G.number_of_nodes()} nodes, {G.number_of_edges()} edges)")

    def route(
        self,
        origin_lat: float,
        origin_lon: float,
        dest_lat: float,
        dest_lon: float,
        profile_name: str = "default",
    ) -> dict:
        """
        Compute an accessibility-optimized route.

        Returns:
            {
                "origin": {"lat": ..., "lon": ...},
                "destination": {"lat": ..., "lon": ...},
                "profile": "wheelchair",
                "distance_m": 450.2,
                "path": [{"lat": ..., "lon": ..., "node_id": ...}, ...],
                "edges": [{edge_data}, ...],
                "explanation": "This route avoids stairs and...",
                "scores": {
                    "overall": 0.85,
                    "slope": 0.9,
                    "surface": 0.95,
                    ...
                },
                "geojson": {GeoJSON LineString},
            }
        """
        profile = get_profile(profile_name)

        # Find nearest graph nodes
        origin_node = find_nearest_node(
            self.G, origin_lat, origin_lon, self.node_tree, self.node_ids
        )
        dest_node = find_nearest_node(
            self.G, dest_lat, dest_lon, self.node_tree, self.node_ids
        )

        if origin_node is None or dest_node is None:
            return {"error": "Could not find graph nodes near the given coordinates"}

        if origin_node == dest_node:
            return {"error": "Origin and destination are the same node"}

        # Define cost function for this profile
        def cost_func(u, v, data):
            return compute_edge_cost(u, v, data, profile, self.G)

        # Run Dijkstra
        try:
            path_nodes = nx.dijkstra_path(self.G, origin_node, dest_node, weight=cost_func)
        except nx.NetworkXNoPath:
            return {"error": "No accessible path found between these locations"}
        except nx.NodeNotFound as e:
            return {"error": f"Node not found in graph: {e}"}

        # Build result
        path_coords = []
        path_edges = []
        total_distance = 0.0

        for nid in path_nodes:
            nd = self.G.nodes[nid]
            path_coords.append({
                "lat": nd.get("lat"),
                "lon": nd.get("lon"),
                "node_id": int(nid),
            })

        for i in range(len(path_nodes) - 1):
            u, v = path_nodes[i], path_nodes[i + 1]
            edata = dict(self.G.edges[u, v])
            edata["from_node"] = int(u)
            edata["to_node"] = int(v)
            total_distance += edata.get("distance_m", 0)
            path_edges.append(edata)

        # Compute average scores
        n_edges = max(len(path_edges), 1)
        scores = {
            "overall": sum(e.get("accessibility_score", 0.5) for e in path_edges) / n_edges,
            "slope": 1.0 - (sum(min(abs(e.get("slope", 0) or 0) / 15, 1) for e in path_edges) / n_edges),
            "surface": sum(e.get("surface_score", 0.7) for e in path_edges) / n_edges,
            "noise": 1.0 - (sum(e.get("noise_score", 0.5) for e in path_edges) / n_edges),
            "crowd": 1.0 - (sum(e.get("crowd_score", 0.5) for e in path_edges) / n_edges),
            "lighting": sum(e.get("lighting_score", 0.5) for e in path_edges) / n_edges,
            "kerb": sum(e.get("kerb_score", 0.7) for e in path_edges) / n_edges,
            "crossing_signals": sum(e.get("crossing_signal_score", 0.5) for e in path_edges) / n_edges,
            "tactile": sum(e.get("tactile_score", 0.5) for e in path_edges) / n_edges,
        }

        # GeoJSON LineString
        geojson = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [p["lon"], p["lat"]] for p in path_coords
                ],
            },
            "properties": {
                "profile": profile.name,
                "distance_m": round(total_distance, 1),
                "scores": {k: round(v, 3) for k, v in scores.items()},
            },
        }

        explanation = _generate_explanation(path_edges, profile)
        directions = _generate_directions(path_coords, path_edges)

        return {
            "origin": {"lat": origin_lat, "lon": origin_lon},
            "destination": {"lat": dest_lat, "lon": dest_lon},
            "profile": profile.name,
            "profile_display": profile.display_name,
            "distance_m": round(total_distance, 1),
            "path": path_coords,
            "edges": path_edges,
            "explanation": explanation,
            "directions": directions,
            "scores": {k: round(v, 3) for k, v in scores.items()},
            "geojson": geojson,
        }
