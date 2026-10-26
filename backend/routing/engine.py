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

from pipeline.scoring import NO_FEATURE_NEARBY
from .profiles import AccessibilityProfile, get_profile, get_combined_profile


def _num(value, default: float) -> float:
    """Coerce optional numeric values (including None) into safe floats."""
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters between two lat/lon pairs."""
    rlat1, rlon1 = math.radians(lat1), math.radians(lon1)
    rlat2, rlon2 = math.radians(lat2), math.radians(lon2)
    dlat, dlon = rlat2 - rlat1, rlon2 - rlon1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return 6371000.0 * c


def _hazard_applies(hazard, profile_names: Optional[list]) -> bool:
    """True iff the hazard's affected_profiles overlaps any of the user's
    selected profile names. If a hazard has no declared affected profiles,
    treat it as universally applicable."""
    affected = getattr(hazard, "affected_profiles", None) or []
    if not affected:
        return True
    if profile_names:
        return any(p in affected for p in profile_names)
    return False


# ---------------------------------------------------------------------------
# Edge cost function
# ---------------------------------------------------------------------------
def compute_edge_cost(
    u: int, v: int, data: dict,
    profile: AccessibilityProfile,
    G: nx.Graph,
    active_hazards: Optional[list] = None,
    profile_names: Optional[list] = None,
) -> float:
    """
    Compute the traversal cost of an edge based on the user's accessibility profile.

    The cost is:  distance * (1 + penalty_sum)

    Where penalty_sum is a weighted combination of accessibility factors.
    Higher penalties make the edge less desirable.
    """
    distance = _num(data.get("distance_m"), 1.0)
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
    slope = _num(data.get("slope"), 0.0)
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
    slope_severity = min(abs(slope) / 15.0, 1.0)
    penalty += profile.slope_weight * slope_severity

    # Surface penalty (invert: bad surface = high penalty)
    surface_score = _num(data.get("surface_score"), 0.7)
    penalty += profile.surface_weight * (1 - surface_score)

    # Noise penalty
    noise_score = _num(data.get("noise_score"), 0.5)
    penalty += profile.noise_weight * noise_score

    # Crowd penalty
    crowd_score = _num(data.get("crowd_score"), 0.5)
    penalty += profile.crowd_weight * crowd_score

    # Lighting penalty (invert: bad lighting = high penalty)
    lighting_score = _num(data.get("lighting_score"), 0.5)
    penalty += profile.lighting_weight * (1 - lighting_score)

    # Kerb penalty (invert: bad kerbs = high penalty)
    kerb_score = _num(data.get("kerb_score"), 0.7)
    penalty += profile.kerb_weight * (1 - kerb_score)

    # Stairs soft penalty (if not avoiding entirely)
    if data.get("has_stairs", False):
        penalty += profile.stairs_penalty

    # Crossing signal bonus (negative penalty = lower cost for signalized crossings)
    crossing_signal = _num(data.get("crossing_signal_score"), 0.5)
    penalty -= profile.crossing_signal_weight * crossing_signal * 0.3

    # Tactile paving bonus (negative penalty = lower cost for tactile paving routes)
    tactile = _num(data.get("tactile_score"), 0.5)
    penalty -= profile.tactile_weight * tactile * 0.3

    # Off-path connectors (gap bridges, open-area hops) are a last resort
    if data.get("is_shortcut", False):
        penalty += 0.6

    # Explicit sidewalk bonus
    if data.get("is_sidewalk", False):
        penalty -= profile.sidewalk_weight * 0.4

    # Apply dynamic hazard penalties — match against the user's original
    # profile selections, not the synthetic "combined_*" profile name.
    if active_hazards and (profile.name != "default"):
        u_data = G.nodes.get(u, {})
        edge_lat = u_data.get("lat")
        edge_lon = u_data.get("lon")

        if edge_lat is not None and edge_lon is not None:
            for hazard in active_hazards:
                if not _hazard_applies(hazard, profile_names):
                    continue
                dist_to_hazard = _haversine_m(edge_lat, edge_lon, hazard.lat, hazard.lon)
                if dist_to_hazard < 25:
                    return distance * 50  # within 25m → effectively avoid
    
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
    profile_names: list[str],
) -> str:
    """Generate a human-readable explanation of why this route was chosen."""
    reasons = []
    # Analyze path characteristics
    total_dist = sum(_num(e.get("distance_m"), 0) for e in path_edges)
    avg_slope = 0
    max_slope = 0
    has_stairs = any(e.get("has_stairs", False) for e in path_edges)
    avg_surface = np.mean([_num(e.get("surface_score"), 0.7) for e in path_edges]) if path_edges else 0.7
    avg_noise = np.mean([_num(e.get("noise_score"), 0.5) for e in path_edges]) if path_edges else 0.5
    avg_crowd = np.mean([_num(e.get("crowd_score"), 0.5) for e in path_edges]) if path_edges else 0.5
    avg_lighting = np.mean([_num(e.get("lighting_score"), 0.5) for e in path_edges]) if path_edges else 0.5
    max_slope = max([abs(_num(e.get("slope"), 0)) for e in path_edges]) if path_edges else 0
    avg_tactile = np.mean([_num(e.get("tactile_score"), 0.5) for e in path_edges]) if path_edges else 0.5
    avg_crossing = np.mean([_num(e.get("crossing_signal_score"), 0.5) for e in path_edges]) if path_edges else 0.5
    sidewalk_ratio = sum(1 for e in path_edges if e.get("is_sidewalk")) / len(path_edges) if path_edges else 0
    reasons.append(f"This route is {total_dist:.0f} meters long")

    if "wheelchair" in profile_names:
        if not has_stairs:
            reasons.append("avoiding all stairs")
        if max_slope <= 5:
            reasons.append("keeping slopes gentle")
        if avg_surface > 0.8:
            reasons.append("prioritizing smooth surfaces")
        if sidewalk_ratio > 0.6:
            reasons.append("sticking to designated sidewalks")
        if avg_tactile > 0.6:
            reasons.append("utilizing paths with ADA-compliant tactile paving")

    if "blind" in profile_names:
        if avg_noise < 0.4:
            reasons.append("through quieter areas for easier orientation")
        if avg_crowd < 0.5:
            reasons.append("avoiding crowded walkways")

        # Crossing signal info
        avg_crossing = sum(_num(e.get("crossing_signal_score"), 0.5) for e in path_edges) / max(len(path_edges), 1)
        if avg_crossing > 0.7:
            reasons.append("preferring signalized crossings with audio cues")
        elif avg_crossing > 0.5:
            reasons.append("using marked crossings where available")

        # Tactile paving info
        avg_tactile = sum(_num(e.get("tactile_score"), 0.5) for e in path_edges) / max(len(path_edges), 1)
        if avg_tactile > 0.7:
            reasons.append("along paths with tactile paving guidance")
        elif avg_tactile > 0.5:
            reasons.append("with some tactile paving coverage")

        if avg_surface > 0.7:
            reasons.append("on consistent, predictable surfaces")

    if "neurodivergent" in profile_names:
        if avg_noise < 0.4:
            reasons.append("minimizing noise exposure")
        if avg_crowd < 0.5:
            reasons.append("through calmer, less crowded paths")

    if "elderly" in profile_names:
        if max_slope <= 8:
            reasons.append("with manageable slopes")
        if avg_lighting > 0.6:
            reasons.append("along well-lit paths")

    if "temporary_injury" in profile_names:
        if not has_stairs:
            reasons.append("avoiding all stairs")
        if avg_surface > 0.7:
            reasons.append("on stable, paved surfaces")

    if avg_lighting > 0.7:
        reasons.append("with good lighting coverage")
    elif avg_lighting < 0.3:
        reasons.append("(note: some sections have limited lighting)")

    return ", ".join(dict.fromkeys(reasons)) + "."  # dedupe phrases shared by combined profiles


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
    min_leg_m: float = 12.0,
    turn_deg: float = 30.0,
) -> list[dict]:
    """
    Turn a path into steps. Each step is a manoeuvre followed by the distance
    walked until the next one.

    Turns are measured against the bearing the current leg started on, so a
    corner drawn as several small bends still adds up to a turn. A leg shorter
    than `min_leg_m` is merged with the next manoeuvre (its turn is recomputed
    from the leg before it) instead of being dropped.
    """
    if len(path_coords) < 2 or not path_edges:
        return []

    def bearing(i: int) -> float:
        a, b = path_coords[i], path_coords[i + 1]
        return _compute_bearing(a["lat"], a["lon"], b["lat"], b["lon"])

    def delta(to: float, frm: float) -> float:
        return (to - frm + 180) % 360 - 180

    def surface(e: dict) -> str:
        return "off-path" if e.get("is_shortcut") else (e.get("surface") or "unknown")

    def new_leg(instruction: str, ref: float) -> dict:
        return {"instruction": instruction, "ref": ref, "distance_m": 0.0, "surfaces": {}}

    def add(leg: dict, e: dict) -> None:
        d = _num(e.get("distance_m"), 0)
        leg["distance_m"] += d
        leg["surfaces"][surface(e)] = leg["surfaces"].get(surface(e), 0) + d

    legs: list[dict] = []
    for i, e in enumerate(path_edges):
        b = bearing(i)
        if not legs:
            legs.append(new_leg(f"Head {_bearing_to_direction(b)}", b))
        elif _num(e.get("distance_m"), 0) >= 1 and abs(delta(b, legs[-1]["ref"])) > turn_deg:
            cur = legs[-1]
            if cur["distance_m"] >= min_leg_m:
                legs.append(new_leg(_turn_instruction(delta(b, cur["ref"])).capitalize(), b))
            elif len(legs) == 1:
                # Short first hop: just head the way the route really goes
                cur["instruction"], cur["ref"] = f"Head {_bearing_to_direction(b)}", b
            else:
                # Short jog: fold it into the previous leg and re-judge the turn from there
                prev = legs[-2]
                for k, v in cur["surfaces"].items():
                    prev["surfaces"][k] = prev["surfaces"].get(k, 0) + v
                prev["distance_m"] += cur["distance_m"]
                legs.pop()
                angle = delta(b, prev["ref"])
                if abs(angle) > turn_deg:
                    legs.append(new_leg(_turn_instruction(angle).capitalize(), b))
        add(legs[-1], e)

    steps = [
        {
            "step": i + 1,
            "instruction": leg["instruction"],
            "distance_m": round(leg["distance_m"]),
            # Label each leg by the surface covering most of its length
            "surface": max(leg["surfaces"], key=leg["surfaces"].get) if leg["surfaces"] else "unknown",
        }
        for i, leg in enumerate(legs)
    ]
    steps.append({
        "step": len(steps) + 1,
        "instruction": "Arrive at your destination",
        "distance_m": 0,
        "surface": "",
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
        profile_names: list[str] = None,
        active_hazards: Optional[list] = None,
    ) -> dict:
        """
        Compute an accessibility-optimized route.

        Compute an accessibility-optimized route.

        Returns:
            {
                "origin": {"lat": ..., "lon": ...},
                "destination": {"lat": ..., "lon": ...},
                "profiles": ["wheelchair", "blind"],
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
        if profile_names is None:
            profile_names = ["default"]
            
        profile = get_combined_profile(profile_names)

                # Find nearest graph nodes
        origin_node = find_nearest_node(
            self.G, origin_lat, origin_lon, self.node_tree, self.node_ids
        )
        dest_node = find_nearest_node(
            self.G, dest_lat, dest_lon, self.node_tree, self.node_ids
        )

        # If clicked point is far from nearest node, insert temporary nodes
        # so routes can start/end in open areas (fields, plazas, etc.)
        temp_nodes = []

        for label, node_var, lat, lon in [
            ("origin", origin_node, origin_lat, origin_lon),
            ("dest", dest_node, dest_lat, dest_lon),
        ]:
            nd = self.G.nodes[node_var]
            nlat, nlon = nd.get("lat", 0), nd.get("lon", 0)
            dlat = (nlat - lat) * 111_000
            dlon = (nlon - lon) * 111_000 * math.cos(math.radians(lat))
            snap_dist = math.sqrt(dlat**2 + dlon**2)

            if snap_dist > 30:  # more than 30m away — insert a virtual node
                temp_id = hash(f"temp_{label}_{lat}_{lon}") % (10**9) + 10**9
                self.G.add_node(temp_id, lat=lat, lon=lon)
                temp_nodes.append(temp_id)

                # Connect to nearby real nodes
                nearby = self.node_tree.query_ball_point([lat, lon], 150 / 111_000)
                for idx in nearby:
                    real_node = self.node_ids[idx]
                    rnd = self.G.nodes[real_node]
                    rlat, rlon = rnd.get("lat", 0), rnd.get("lon", 0)
                    d_lat = (rlat - lat) * 111_000
                    d_lon = (rlon - lon) * 111_000 * math.cos(math.radians(lat))
                    dist = math.sqrt(d_lat**2 + d_lon**2)
                    if dist < 150:
                        self.G.add_edge(temp_id, real_node,
                            distance_m=round(dist, 1),
                            surface="grass", surface_score=0.5,
                            has_stairs=False, is_sidewalk=False,
                            is_shortcut=True,
                        )

                if label == "origin":
                    origin_node = temp_id
                else:
                    dest_node = temp_id

        # If both origin and dest are temp nodes, connect them directly
        if len(temp_nodes) == 2:
            n1, n2 = temp_nodes
            nd1 = self.G.nodes[n1]
            nd2 = self.G.nodes[n2]
            dlat = (nd1["lat"] - nd2["lat"]) * 111_000
            dlon = (nd1["lon"] - nd2["lon"]) * 111_000 * math.cos(math.radians(nd1["lat"]))
            dist = math.sqrt(dlat**2 + dlon**2)
            if dist < 500:  # within 500m, allow direct walk
                self.G.add_edge(n1, n2,
                    distance_m=round(dist, 1),
                    surface="grass", surface_score=0.5,
                    has_stairs=False, is_sidewalk=False,
                    is_shortcut=True,
                )

        if origin_node is None or dest_node is None:
            return {"error": "Could not find graph nodes near the given coordinates"}

        if origin_node == dest_node:
            return {"error": "Origin and destination are the same node"}

        # Define cost function for this profile
        def cost_func(u, v, data):
            return compute_edge_cost(
                u, v, data, profile, self.G, active_hazards, profile_names=profile_names
            )

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
            total_distance += _num(edata.get("distance_m"), 0)
            path_edges.append(edata)

        # Compute average scores
        n_edges = max(len(path_edges), 1)
        scores = {
            "overall": sum(_num(e.get("accessibility_score"), 0.5) for e in path_edges) / n_edges,
            "slope": 1.0 - (sum(min(abs(_num(e.get("slope"), 0)) / 15, 1) for e in path_edges) / n_edges),
            "surface": sum(_num(e.get("surface_score"), 0.7) for e in path_edges) / n_edges,
            "noise": 1.0 - (sum(_num(e.get("noise_score"), 0.5) for e in path_edges) / n_edges),
            "crowd": 1.0 - (sum(_num(e.get("crowd_score"), 0.5) for e in path_edges) / n_edges),
            "lighting": sum(_num(e.get("lighting_score"), 0.5) for e in path_edges) / n_edges,
            "kerb": sum(_num(e.get("kerb_score"), 0.7) for e in path_edges) / n_edges,
        }
        # Crossing / tactile only where something is mapped nearby; with no data at all
        # the factor is omitted rather than scored as bad.
        for key, attr in (("crossing_signals", "crossing_signal_score"), ("tactile", "tactile_score")):
            known = [_num(e.get(attr), 0.5) for e in path_edges if e.get(attr) not in (None, NO_FEATURE_NEARBY)]
            if known:
                scores[key] = sum(known) / len(known)

        # Overall = the route's factor scores weighted by what *this* profile cares about,
        # so the same path scores differently for a wheelchair user vs. a blind user.
        weights = {
            "slope": profile.slope_weight, "surface": profile.surface_weight,
            "noise": profile.noise_weight, "crowd": profile.crowd_weight,
            "lighting": profile.lighting_weight, "kerb": profile.kerb_weight,
            "crossing_signals": profile.crossing_signal_weight, "tactile": profile.tactile_weight,
        }
        weights = {k: w for k, w in weights.items() if k in scores}
        total_w = sum(weights.values())
        if total_w > 0:
            scores["overall"] = sum(scores[k] * w for k, w in weights.items()) / total_w

        # ---- Hazards on the way -------------------------------------------------
        # Scan path nodes vs. reported hazards that apply to the user's profile.
        # Hazards within 60m of the path produce a penalty (closer = bigger).
        hazards_on_route: list[dict] = []
        hazard_penalty = 0.0
        if active_hazards:
            for hz in active_hazards:
                if not _hazard_applies(hz, profile_names):
                    continue
                min_d = float("inf")
                for p in path_coords:
                    plat = p.get("lat")
                    plon = p.get("lon")
                    if plat is None or plon is None:
                        continue
                    d = _haversine_m(plat, plon, hz.lat, hz.lon)
                    if d < min_d:
                        min_d = d
                if min_d == float("inf"):
                    continue
                if min_d < 60:
                    if min_d < 15:
                        penalty, severity = 0.40, "high"
                    elif min_d < 30:
                        penalty, severity = 0.25, "medium"
                    else:
                        penalty, severity = 0.10, "low"
                    hazard_penalty += penalty
                    hazards_on_route.append({
                        "id": str(getattr(hz, "id", "")),
                        "type": getattr(hz, "type", "unknown"),
                        "description": getattr(hz, "description", ""),
                        "lat": float(hz.lat),
                        "lon": float(hz.lon),
                        "distance_m": round(min_d, 1),
                        "severity": severity,
                        "affected_profiles": list(getattr(hz, "affected_profiles", []) or []),
                    })

        hazard_penalty = min(hazard_penalty, 0.7)
        scores["hazards"] = max(0.0, 1.0 - hazard_penalty)
        # Reflect hazards in the "overall" score so a high-scoring route can't
        # sit next to a relevant hazard and still claim the same number.
        scores["overall"] = max(0.0, scores["overall"] - 0.4 * hazard_penalty)

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
                "profiles": profile_names,
                "distance_m": round(total_distance, 1),
                "scores": {k: round(v, 3) for k, v in scores.items()},
            },
        }

        explanation = _generate_explanation(path_edges, profile_names)
        if hazards_on_route:
            sev_high = sum(1 for h in hazards_on_route if h["severity"] == "high")
            sev_med = sum(1 for h in hazards_on_route if h["severity"] == "medium")
            sev_low = sum(1 for h in hazards_on_route if h["severity"] == "low")
            parts = []
            if sev_high:
                parts.append(f"{sev_high} within 15m")
            if sev_med:
                parts.append(f"{sev_med} within 30m")
            if sev_low:
                parts.append(f"{sev_low} within 60m")
            explanation = (
                explanation.rstrip(".")
                + f". Heads up: {len(hazards_on_route)} reported hazard(s) for your profile lie close to this route "
                + f"({', '.join(parts)}) — the score has been adjusted accordingly."
            )

        directions = _generate_directions(path_coords, path_edges)

        # Clean up temporary nodes
        for tn in temp_nodes:
            self.G.remove_node(tn)

        return {
            "origin": {"lat": origin_lat, "lon": origin_lon},
            "destination": {"lat": dest_lat, "lon": dest_lon},
            "profiles": profile_names,
            "profile_display": profile.display_name,
            "distance_m": round(total_distance, 1),
            "path": path_coords,
            "edges": path_edges,
            "explanation": explanation,
            "directions": directions,
            "scores": {k: round(v, 3) for k, v in scores.items()},
            "geojson": geojson,
            "hazards_on_route": hazards_on_route,
        }
