"""
main.py — FastAPI application for AccessMap AI.

Serves accessibility-aware routing, heatmap data, and image analysis endpoints.
Runs the data pipeline at startup to build the enriched pedestrian graph.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from pipeline.enrichment import run_pipeline, AccessibilityData
from routing.engine import RoutingEngine
from routing.profiles import list_profiles, get_profile
from api import vision, route_explanation
from dotenv import load_dotenv

# Load backend/.env into os.environ (Python does not read .env files automatically)
load_dotenv(Path(__file__).resolve().parent / ".env")

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
app_data: Optional[AccessibilityData] = None
router: Optional[RoutingEngine] = None


# ---------------------------------------------------------------------------
# Startup / Shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run data pipeline at startup."""
    global app_data, router

    now = datetime.now()
    print(f"\n🚀 Starting AccessMap AI server at {now.strftime('%H:%M:%S')}...")

    # Resolve data path relative to project root (one level up from backend/)
    project_root = Path(__file__).parent.parent
    data_dir = str(project_root / "data" / "osm")

    app_data = run_pipeline(
        data_dir=data_dir,
        hour=now.hour,
        is_weekday=now.weekday() < 5,
        skip_elevation=os.getenv("SKIP_ELEVATION", "false").lower() == "true",
    )

    router = RoutingEngine(app_data.graph)
    print("\n✅ Server ready!")

    yield

    print("\n👋 Shutting down AccessMap AI server...")


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AccessMap AI",
    description="AI-powered accessibility intelligence platform for urban and campus navigation.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vision.router)
app.include_router(route_explanation.router)

# ---------------------------------------------------------------------------
# Request/Response models
# ---------------------------------------------------------------------------
class RouteRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    profile: str = "default"


class HeatmapRequest(BaseModel):
    bounds: Optional[dict] = None  # {"north": ..., "south": ..., "east": ..., "west": ...}
    metric: str = "accessibility_score"  # or "noise_score", "crowd_score", etc.


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    """Health check and API info."""
    stats = app_data.get_stats() if app_data else {"ready": False}
    return {
        "name": "AccessMap AI",
        "version": "1.0.0",
        "status": "ready" if stats.get("ready") else "loading",
        "stats": stats,
    }


@app.get("/profiles")
async def get_profiles():
    """List available accessibility profiles."""
    return {"profiles": list_profiles()}


@app.post("/route")
async def compute_route(req: RouteRequest):
    """
    Compute an accessibility-optimized route.

    Accepts origin/destination lat/lon and an accessibility profile name.
    Returns the route path, scores, GeoJSON, and AI explanation.
    """
    if router is None:
        raise HTTPException(status_code=503, detail="Server still loading data")

    result = router.route(
        origin_lat=req.origin_lat,
        origin_lon=req.origin_lon,
        dest_lat=req.dest_lat,
        dest_lon=req.dest_lon,
        profile_name=req.profile,
    )

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    # Strip raw edge data for response size (keep scores, not raw dicts)
    result.pop("edges", None)

    return result


@app.get("/route")
async def compute_route_get(
    origin_lat: float = Query(...),
    origin_lon: float = Query(...),
    dest_lat: float = Query(...),
    dest_lon: float = Query(...),
    profile: str = Query("default"),
):
    """GET version of /route for easy browser testing."""
    req = RouteRequest(
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        profile=profile,
    )
    return await compute_route(req)


@app.get("/heatmap")
async def get_heatmap(
    metric: str = Query("accessibility_score"),
    north: float = Query(38.55),
    south: float = Query(38.53),
    east: float = Query(-121.73),
    west: float = Query(-121.77),
):
    """
    Return heatmap data for a given bounding box and metric.

    Metrics: accessibility_score, noise_score, crowd_score,
             lighting_score, surface_score, kerb_score
    """
    if app_data is None:
        raise HTTPException(status_code=503, detail="Server still loading data")

    valid_metrics = [
        "accessibility_score", "noise_score", "crowd_score",
        "lighting_score", "surface_score", "kerb_score",
    ]
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric. Choose from: {valid_metrics}"
        )

    points = []
    for u, v, data in app_data.graph.edges(data=True):
        # Edge midpoint
        lat_u = app_data.graph.nodes[u].get("lat", 0)
        lon_u = app_data.graph.nodes[u].get("lon", 0)
        lat_v = app_data.graph.nodes[v].get("lat", 0)
        lon_v = app_data.graph.nodes[v].get("lon", 0)
        mid_lat = (lat_u + lat_v) / 2
        mid_lon = (lon_u + lon_v) / 2

        # Filter by bounds
        if south <= mid_lat <= north and west <= mid_lon <= east:
            points.append({
                "lat": round(mid_lat, 6),
                "lon": round(mid_lon, 6),
                "value": round(data.get(metric, 0.5), 3),
            })

    return {
        "metric": metric,
        "bounds": {"north": north, "south": south, "east": east, "west": west},
        "count": len(points),
        "points": points,
    }


@app.get("/transit")
async def get_transit():
    """Return transit stop and route data."""
    if app_data is None:
        raise HTTPException(status_code=503, detail="Server still loading data")

    return {
        "stops": app_data.gtfs["stops"],
        "routes": app_data.gtfs["routes"],
    }


@app.get("/edge/{node_u}/{node_v}")
async def get_edge_detail(node_u: int, node_v: int):
    """Get detailed accessibility data for a specific graph edge."""
    if app_data is None:
        raise HTTPException(status_code=503, detail="Server still loading data")

    if not app_data.graph.has_edge(node_u, node_v):
        raise HTTPException(status_code=404, detail="Edge not found")

    data = dict(app_data.graph.edges[node_u, node_v])
    # Add node coordinates
    data["from"] = {
        "lat": app_data.graph.nodes[node_u].get("lat"),
        "lon": app_data.graph.nodes[node_u].get("lon"),
    }
    data["to"] = {
        "lat": app_data.graph.nodes[node_v].get("lat"),
        "lon": app_data.graph.nodes[node_v].get("lon"),
    }

    return data


@app.get("/stats")
async def get_stats():
    """Return pipeline statistics."""
    if app_data is None:
        return {"ready": False}

    # Sample score distributions
    scores = {
        "accessibility": [],
        "noise": [],
        "crowd": [],
        "lighting": [],
        "surface": [],
    }
    for _, _, data in app_data.graph.edges(data=True):
        scores["accessibility"].append(data.get("accessibility_score", 0))
        scores["noise"].append(data.get("noise_score", 0))
        scores["crowd"].append(data.get("crowd_score", 0))
        scores["lighting"].append(data.get("lighting_score", 0))
        scores["surface"].append(data.get("surface_score", 0))

    stats = app_data.get_stats()

    # Add score summaries
    for key, vals in scores.items():
        if vals:
            stats[f"{key}_avg"] = round(sum(vals) / len(vals), 3)
            stats[f"{key}_min"] = round(min(vals), 3)
            stats[f"{key}_max"] = round(max(vals), 3)

    return stats


@app.get("/accessibility-points")
async def get_accessibility_points(
    north: float = Query(38.56),
    south: float = Query(38.52),
    east: float = Query(-121.71),
    west: float = Query(-121.78),
):
    """
    Return categorized accessibility infrastructure points for map display.

    Categories: crossing, kerb_lowered, kerb_raised, tactile_paving,
                wheelchair_yes, wheelchair_limited, wheelchair_no
    """
    if app_data is None:
        raise HTTPException(status_code=503, detail="Server still loading data")

    points = []
    for feat in app_data.accessibility_features:
        lat = feat.get("lat")
        lon = feat.get("lon")
        if lat is None or lon is None:
            continue

        # Filter by bounds
        if not (south <= lat <= north and west <= lon <= east):
            continue

        tags = feat.get("tags", {})

        # Categorize
        if "kerb" in tags:
            kerb_val = tags["kerb"]
            if kerb_val in ("lowered", "flush"):
                category = "kerb_lowered"
                label = f"Lowered Kerb ({kerb_val})"
            elif kerb_val == "raised":
                category = "kerb_raised"
                label = "Raised Kerb"
            else:
                category = "kerb_lowered"
                label = f"Kerb ({kerb_val})"
        elif tags.get("tactile_paving") == "yes":
            category = "tactile_paving"
            label = "Tactile Paving"
        elif tags.get("highway") == "crossing":
            crossing_type = tags.get("crossing", "unmarked")
            category = "crossing"
            label = f"Crossing ({crossing_type})"
        elif "wheelchair" in tags:
            wc = tags["wheelchair"]
            if wc == "yes":
                category = "wheelchair_yes"
                label = "Wheelchair Accessible"
            elif wc == "limited":
                category = "wheelchair_limited"
                label = "Wheelchair Limited"
            else:
                category = "wheelchair_no"
                label = "Not Wheelchair Accessible"
        else:
            category = "crossing"
            label = "Accessibility Feature"

        # Add tactile paving info if present alongside other tags
        extra = ""
        if category != "tactile_paving" and tags.get("tactile_paving") == "yes":
            extra = " · Tactile Paving"

        points.append({
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "category": category,
            "label": label + extra,
        })

    return {
        "count": len(points),
        "points": points,
    }


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
