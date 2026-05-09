"""
gtfs.py — Parse GTFS data for transit stop integration.

Reads Unitrans GTFS files to extract transit stops with
wheelchair boarding info for accessibility overlay.
"""

import csv
from pathlib import Path
from typing import Optional


def parse_stops(gtfs_dir: Path) -> list[dict]:
    """
    Parse stops.txt from a GTFS feed.
    Returns list of stop dicts with lat, lon, name, wheelchair_boarding.
    """
    stops_file = gtfs_dir / "stops.txt"
    if not stops_file.exists():
        print(f"  Warning: {stops_file} not found")
        return []

    stops = []
    with open(stops_file, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            stop = {
                "stop_id": row.get("stop_id", "").strip(),
                "stop_name": row.get("stop_name", "").strip(),
                "lat": float(row.get("stop_lat", 0)),
                "lon": float(row.get("stop_lon", 0)),
                "wheelchair_boarding": row.get("wheelchair_boarding", "0").strip(),
            }
            # wheelchair_boarding: 0=no info, 1=accessible, 2=not accessible
            stops.append(stop)

    print(f"  Loaded {len(stops)} transit stops")
    return stops


def parse_routes(gtfs_dir: Path) -> list[dict]:
    """Parse routes.txt for route info."""
    routes_file = gtfs_dir / "routes.txt"
    if not routes_file.exists():
        return []

    routes = []
    with open(routes_file, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            routes.append({
                "route_id": row.get("route_id", "").strip(),
                "route_short_name": row.get("route_short_name", "").strip(),
                "route_long_name": row.get("route_long_name", "").strip(),
                "route_color": row.get("route_color", "").strip(),
            })

    print(f"  Loaded {len(routes)} routes")
    return routes


def parse_shapes(gtfs_dir: Path) -> dict[str, list[dict]]:
    """
    Parse shapes.txt for route geometries.
    Returns {shape_id: [{lat, lon, sequence}, ...]}
    """
    shapes_file = gtfs_dir / "shapes.txt"
    if not shapes_file.exists():
        return {}

    shapes = {}
    with open(shapes_file, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sid = row.get("shape_id", "").strip()
            if sid not in shapes:
                shapes[sid] = []
            shapes[sid].append({
                "lat": float(row.get("shape_pt_lat", 0)),
                "lon": float(row.get("shape_pt_lon", 0)),
                "sequence": int(row.get("shape_pt_sequence", 0)),
            })

    # Sort each shape by sequence
    for sid in shapes:
        shapes[sid].sort(key=lambda p: p["sequence"])

    print(f"  Loaded {len(shapes)} route shapes")
    return shapes


def load_gtfs_data(data_dir: Path) -> dict:
    """
    Load all GTFS data from the unitrans directory.
    Returns dict with stops, routes, shapes.
    """
    gtfs_dir = data_dir / ".." / "gtfs" / "unitrans"
    gtfs_dir = gtfs_dir.resolve()

    if not gtfs_dir.exists():
        print(f"  Warning: GTFS directory not found: {gtfs_dir}")
        return {"stops": [], "routes": [], "shapes": {}}

    print(f"\n[GTFS] Loading transit data from {gtfs_dir}...")

    return {
        "stops": parse_stops(gtfs_dir),
        "routes": parse_routes(gtfs_dir),
        "shapes": parse_shapes(gtfs_dir),
    }
