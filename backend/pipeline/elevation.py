"""
elevation.py — Fetch elevation data from Open-Meteo API and compute slope per edge.

Uses the free Open-Meteo Elevation API (no key needed, up to 100 coords per request).
Elevation is sampled on a ~150m grid once and cached in data/osm/elevation_grid.json.
"""

import json
import math
from pathlib import Path

import httpx
import networkx as nx
from typing import Optional


OPEN_METEO_URL = "https://api.open-meteo.com/v1/elevation"
BATCH_SIZE = 100  # max coordinates per request


GRID_STEP_DEG = 0.0014  # ~150m; the Open-Meteo DEM is ~90m, so finer adds only noise


def _fetch_elevation_grid(G: nx.Graph) -> dict:
    """Sample elevation on a regular grid over the graph's bounding box."""
    import time
    import numpy as np

    lats = [d["lat"] for _, d in G.nodes(data=True) if "lat" in d]
    lons = [d["lon"] for _, d in G.nodes(data=True) if "lon" in d]
    grid_lats = np.arange(min(lats) - GRID_STEP_DEG, max(lats) + 2 * GRID_STEP_DEG, GRID_STEP_DEG)
    grid_lons = np.arange(min(lons) - GRID_STEP_DEG, max(lons) + 2 * GRID_STEP_DEG, GRID_STEP_DEG)
    points = [(la, lo) for la in grid_lats for lo in grid_lons]
    print(f"  Fetching {len(points)} grid elevations in {math.ceil(len(points) / BATCH_SIZE)} requests...")

    elev = []
    with httpx.Client(timeout=30.0) as client:
        for i in range(0, len(points), BATCH_SIZE):
            batch = points[i:i + BATCH_SIZE]
            for attempt in range(5):
                resp = client.get(OPEN_METEO_URL, params={
                    "latitude": ",".join(f"{p[0]:.5f}" for p in batch),
                    "longitude": ",".join(f"{p[1]:.5f}" for p in batch),
                })
                if resp.status_code != 429:
                    break
                time.sleep(15 * (attempt + 1))
            resp.raise_for_status()
            elev.extend(resp.json()["elevation"])
            time.sleep(10)  # free tier counts each coordinate: ~600/min

    return {
        "lats": grid_lats.round(6).tolist(),
        "lons": grid_lons.round(6).tolist(),
        "elevation": np.array(elev).reshape(len(grid_lats), len(grid_lons)).tolist(),
    }


def _interpolate_nodes(G: nx.Graph, grid: dict) -> dict[int, float]:
    from scipy.interpolate import RegularGridInterpolator

    interp = RegularGridInterpolator(
        (grid["lats"], grid["lons"]), grid["elevation"], bounds_error=False, fill_value=None
    )
    ids = [n for n, d in G.nodes(data=True) if "lat" in d]
    values = interp([(G.nodes[n]["lat"], G.nodes[n]["lon"]) for n in ids])
    return {n: float(v) for n, v in zip(ids, values)}


def apply_elevations_to_graph(G: nx.Graph, elevations: dict[int, float]) -> None:
    """
    Store elevation on nodes and compute slope for each edge.
    Slope = (elevation_change / horizontal_distance) * 100  (percentage)
    """
    # Set node elevations
    for node_id, elev in elevations.items():
        if G.has_node(node_id):
            G.nodes[node_id]["elevation"] = elev

    # Compute slope for each edge
    slopes_computed = 0
    for u, v, data in G.edges(data=True):
        elev_u = G.nodes[u].get("elevation")
        elev_v = G.nodes[v].get("elevation")

        if elev_u is not None and elev_v is not None:
            dist = data.get("distance_m", 1.0)
            if dist > 0:
                elevation_change = elev_v - elev_u
                slope_pct = (elevation_change / dist) * 100
                data["slope"] = slope_pct
                data["elevation_change"] = elevation_change
                slopes_computed += 1

    print(f"  Computed slope for {slopes_computed} edges")


def enrich_with_elevation(G: nx.Graph, cache_path: Optional[Path] = None) -> None:
    """Main entry point: elevation grid (cached on disk) -> node elevations -> edge slopes."""
    print("\n[Elevation] Fetching elevation data...")

    try:
        if cache_path is not None and cache_path.exists():
            grid = json.loads(cache_path.read_text())
            print(f"  Loaded cached elevation grid from {cache_path.name}")
        else:
            grid = _fetch_elevation_grid(G)
            if cache_path is not None:
                cache_path.write_text(json.dumps(grid))
        apply_elevations_to_graph(G, _interpolate_nodes(G, grid))
    except Exception as e:
        print(f"  Warning: Elevation enrichment failed: {e}")
        print("  Continuing without elevation data (slopes will be None)")
