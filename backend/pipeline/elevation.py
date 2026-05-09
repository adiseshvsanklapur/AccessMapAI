"""
elevation.py — Fetch elevation data from Open-Meteo API and compute slope per edge.

Uses the free Open-Meteo Elevation API (no key needed, up to 100 coords per request).
"""

import asyncio
import math
import httpx
import networkx as nx
from typing import Optional


OPEN_METEO_URL = "https://api.open-meteo.com/v1/elevation"
BATCH_SIZE = 100  # max coordinates per request


async def _fetch_elevations_batch(
    client: httpx.AsyncClient,
    coords: list[tuple[int, float, float]],  # (node_id, lat, lon)
) -> dict[int, float]:
    """Fetch elevations for a batch of coordinates."""
    lats = ",".join(str(c[1]) for c in coords)
    lons = ",".join(str(c[2]) for c in coords)

    try:
        resp = await client.get(
            OPEN_METEO_URL,
            params={"latitude": lats, "longitude": lons},
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        elevations = data.get("elevation", [])

        result = {}
        for i, (node_id, _, _) in enumerate(coords):
            if i < len(elevations):
                result[node_id] = elevations[i]
        return result

    except Exception as e:
        print(f"  Warning: Elevation batch failed: {e}")
        return {}


async def fetch_all_elevations(G: nx.Graph) -> dict[int, float]:
    """
    Fetch elevations for all nodes in the graph.
    Returns {node_id: elevation_meters}.
    """
    # Collect all node coordinates
    coords = []
    for node_id, data in G.nodes(data=True):
        if "lat" in data and "lon" in data:
            coords.append((node_id, data["lat"], data["lon"]))

    print(f"  Fetching elevations for {len(coords)} nodes...")

    # Split into batches
    batches = [coords[i:i + BATCH_SIZE] for i in range(0, len(coords), BATCH_SIZE)]
    print(f"  {len(batches)} API batches needed")

    elevations = {}
    async with httpx.AsyncClient() as client:
        # Process batches with rate limiting (max 5 concurrent)
        semaphore = asyncio.Semaphore(5)

        async def fetch_with_limit(batch):
            async with semaphore:
                result = await _fetch_elevations_batch(client, batch)
                await asyncio.sleep(0.1)  # small delay to be polite
                return result

        tasks = [fetch_with_limit(batch) for batch in batches]
        results = await asyncio.gather(*tasks)

        for result in results:
            elevations.update(result)

    print(f"  Got elevations for {len(elevations)}/{len(coords)} nodes")
    return elevations


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


def enrich_with_elevation(G: nx.Graph) -> None:
    """Main entry point: fetch elevations and compute slopes."""
    print("\n[Elevation] Fetching elevation data...")

    try:
        elevations = asyncio.run(fetch_all_elevations(G))
        apply_elevations_to_graph(G, elevations)
    except Exception as e:
        print(f"  Warning: Elevation enrichment failed: {e}")
        print("  Continuing without elevation data (slopes will be None)")
