"""
enrichment.py — Orchestrate the full data pipeline.

This module ties together:
  1. Graph construction from OSM data
  2. Elevation fetching and slope computation
  3. Heuristic scoring (crowd, noise, lighting, kerbs)
  4. GTFS transit data loading

Call `run_pipeline()` at server startup.
"""

from pathlib import Path
import networkx as nx

from .graph_builder import (
    build_pedestrian_graph,
    load_buildings,
    load_roads,
    load_accessibility_features,
    load_lighting,
)
from .elevation import enrich_with_elevation
from .scoring import enrich_graph_with_scores
from .gtfs import load_gtfs_data


class AccessibilityData:
    """Container for all processed accessibility data."""

    def __init__(self):
        self.graph: nx.Graph = nx.Graph()
        self.gtfs: dict = {"stops": [], "routes": [], "shapes": {}}
        self.buildings: list[dict] = []
        self.accessibility_features: list[dict] = []
        self.ready: bool = False

    def get_stats(self) -> dict:
        return {
            "nodes": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
            "transit_stops": len(self.gtfs["stops"]),
            "transit_routes": len(self.gtfs["routes"]),
            "buildings": len(self.buildings),
            "ready": self.ready,
        }


def run_pipeline(
    data_dir: str = "data/osm",
    hour: int = 12,
    is_weekday: bool = True,
    skip_elevation: bool = False,
) -> AccessibilityData:
    """
    Run the full data pipeline:
      1. Build pedestrian graph from OSM
      2. Enrich with elevation/slope
      3. Add crowd/noise/lighting/kerb scores
      4. Load GTFS transit data

    Args:
        data_dir: Path to the OSM data directory
        hour: Current hour (0-23) for time-based heuristics
        is_weekday: Whether it's a weekday
        skip_elevation: Skip elevation API calls (faster startup)

    Returns:
        AccessibilityData container with the enriched graph
    """
    result = AccessibilityData()
    osm_dir = Path(data_dir)

    print("=" * 60)
    print("AccessMap AI — Data Pipeline")
    print("=" * 60)

    # Step 1: Build graph
    print("\n[1/4] Building pedestrian graph...")
    result.graph = build_pedestrian_graph(osm_dir)

    if result.graph.number_of_edges() == 0:
        print("ERROR: No edges in graph. Check data files.")
        return result

    # Step 2: Elevation
    if not skip_elevation:
        print("\n[2/4] Enriching with elevation data...")
        enrich_with_elevation(result.graph)
    else:
        print("\n[2/4] Skipping elevation (skip_elevation=True)")

    # Step 3: Scoring
    print("\n[3/4] Computing accessibility scores...")
    result.buildings = load_buildings(osm_dir)
    road_nodes, road_ways = load_roads(osm_dir)
    acc_features = load_accessibility_features(osm_dir)
    result.accessibility_features = acc_features
    lighting = load_lighting(osm_dir)

    enrich_graph_with_scores(
        G=result.graph,
        buildings=result.buildings,
        road_nodes=road_nodes,
        road_ways=road_ways,
        accessibility_features=acc_features,
        lighting=lighting,
        hour=hour,
        is_weekday=is_weekday,
    )

    # Step 4: GTFS
    print("\n[4/4] Loading transit data...")
    result.gtfs = load_gtfs_data(osm_dir)

    result.ready = True

    print("\n" + "=" * 60)
    print("Pipeline complete!")
    stats = result.get_stats()
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print("=" * 60)

    return result
