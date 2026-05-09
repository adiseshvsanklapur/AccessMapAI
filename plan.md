# AccessMap AI — Project Plan & Progress

> HackDavis 2026 — AI-powered accessibility navigation platform

---

## Phase 1: Research & Data Sourcing ✅

Investigated and validated all data sources needed for campus-scale accessibility routing.

### What was researched

| Domain | Source | Outcome |
|--------|--------|---------|
| Campus map data | UC Davis GIS / ArcGIS REST | Identified endpoints, but OSM proved more complete |
| Pedestrian infrastructure | OpenStreetMap Overpass API | Built 7 custom Overpass QL queries for sidewalks, buildings, roads, accessibility features, amenities, and lighting |
| Elevation data | Open-Elevation, Open-Meteo | Selected **Open-Meteo** — free, no key, batch support (100 coords/request) |
| Transit data | Unitrans GTFS, Yolobus GTFS | Unitrans downloaded successfully; Yolobus endpoint down |
| Crowd/noise estimation | No public APIs exist | Designed custom heuristic models using time-of-day + spatial proximity |
| Sidewalk schema | OpenSidewalks project | Used as reference for pedestrian data modeling |

---

## Phase 2: Data Acquisition ✅

Downloaded ~15 MB of datasets into `data/`.

### OpenStreetMap Data (`data/osm/`)

| File | Elements | Purpose |
|------|----------|---------|
| `sidewalks_paths.json` | 13,832 (2,644 ways, 11,188 nodes) | UC Davis campus pedestrian network |
| `davis_all_sidewalks.json` | 10,070 | City of Davis sidewalks, paths, stairs |
| `buildings.json` | 1,109 buildings | Building centroids for crowd density heuristic |
| `roads.json` | 24,301 (4,398 ways) | Road network for noise estimation |
| `accessibility_features.json` | 1,180 features | Kerbs, crossings, tactile paving, wheelchair tags |
| `davis_amenities.json` | 1,177 POIs | Amenities and shops |
| `davis_lighting.json` | 1,104 features | Street lamps and lit ways |

### Transit Data (`data/gtfs/unitrans/`)

| File | Records |
|------|---------|
| `stops.txt` | 292 stops |
| `routes.txt` | 22 routes (A through W) |
| `trips.txt` | 7,673 trips |
| `stop_times.txt` | 97,741 stop times |
| `shapes.txt` | 97 route shapes |

### Elevation Data (`data/elevation/`)

| File | Content |
|------|---------|
| `davis_sample_elevations.json` | 10 sample points (16–20m range) — API validated |

---

## Phase 3: Backend Data Pipeline ✅

Built a complete Python backend that processes raw data into an accessibility-enriched routing graph.

### Architecture

```
Raw OSM JSON files
      │
      ├── graph_builder.py ──→ NetworkX Graph (19,709 nodes, 20,727 edges)
      │                              │
      ├── elevation.py ─────────→ Slope per edge (Open-Meteo API)
      │                              │
      ├── scoring.py ───────────→ Crowd + Noise + Lighting + Kerb scores
      │                              │
      ├── gtfs.py ──────────────→ Transit stop overlay
      │                              │
      └── enrichment.py ────────→ Orchestrates all 4 stages
                                     │
                                     ▼
                              Weighted Graph (in memory)
                                     │
                              routing/engine.py
                                     │
                                     ▼
                              FastAPI (main.py)
```

### Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `backend/pipeline/graph_builder.py` | Parse OSM JSON → NetworkX graph with haversine distances, surface/highway scores | ~250 |
| `backend/pipeline/elevation.py` | Async batch elevation API calls → slope per edge | ~100 |
| `backend/pipeline/scoring.py` | Crowd, noise, lighting, kerb heuristics using KDTree spatial indexing | ~230 |
| `backend/pipeline/gtfs.py` | Parse Unitrans GTFS stops, routes, shapes | ~110 |
| `backend/pipeline/enrichment.py` | Pipeline orchestrator — runs all 4 stages at startup | ~90 |
| `backend/routing/profiles.py` | 6 accessibility profiles with weighted cost functions | ~130 |
| `backend/routing/engine.py` | Profile-weighted Dijkstra pathfinding, GeoJSON output, route explanations | ~250 |
| `backend/main.py` | FastAPI server with 7 endpoints, CORS, startup lifecycle | ~200 |
| `backend/requirements.txt` | Python dependencies | 15 |

### Accessibility Profiles

| Profile | Key Weights | Hard Constraints |
|---------|------------|------------------|
| **Wheelchair** | Slope 0.95, Surface 0.9, Kerb 0.9 | Avoid stairs, avoid unpaved, min width 1.2m, max slope 8.33% |
| **Blind / Low Vision** | Noise 0.8, Crowd 0.7, Surface 0.7 | Avoid unpaved |
| **Elderly** | Slope 0.8, Lighting 0.7, Surface 0.7 | Max slope 10% |
| **Neurodivergent** | Noise 0.95, Crowd 0.95 | — |
| **Temporary Injury** | Slope 0.7, Surface 0.6 | Avoid stairs, max slope 12% |
| **Default** | Balanced (0.3–0.4 all) | — |

### Heuristic Scoring Models

| Heuristic | Method |
|-----------|--------|
| **Crowd density** | `0.6 × time_factor(hour, weekday) + 0.4 × building_density(100m radius)` |
| **Noise level** | FHWA line-source model: `ref_dB - 3 × log2(distance / 15m)`, road type lookup |
| **Lighting** | Daytime=1.0; night: `0.15 + 0.2 × nearby_lamps(55m radius)` |
| **Surface quality** | Lookup table: asphalt=1.0, concrete=0.95, gravel=0.4, mud=0.1 |
| **Curb ramps** | KDTree search: flush=1.0, lowered=0.9, raised=0.3, tactile_paving bonus |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check + pipeline stats |
| `GET` | `/profiles` | List all 6 accessibility profiles |
| `GET/POST` | `/route` | Compute accessibility-optimized route with GeoJSON + explanation |
| `GET` | `/heatmap` | Accessibility score heatmap for a bounding box |
| `GET` | `/transit` | Transit stops and routes from GTFS |
| `GET` | `/stats` | Score distributions across all edges |
| `GET` | `/edge/{u}/{v}` | Detailed data for a specific graph edge |

### Pipeline Performance

| Metric | Value |
|--------|-------|
| Startup time | ~5 seconds |
| Graph nodes | 19,709 |
| Graph edges | 20,727 |
| Route computation | < 100ms |
| Memory usage | ~50 MB |

---

## Phase 4: Frontend-Backend Integration ✅

Wired the existing Next.js UI shell (built by teammate) to the live backend API.

### What was the frontend before

- Static mock data everywhere
- Hardcoded route coordinates (5 points)
- Hardcoded score of 84
- Hardcoded explanation text
- Map locked (no pan/zoom/click)
- Badge: "No backend wired"

### What it is now

- **Live route computation** — profile change triggers real API call
- **Interactive map** — pan, zoom, click to set origin/destination
- **Real GeoJSON routes** — rendered from backend Dijkstra output (43+ nodes per route)
- **Live score breakdown** — overall, slope, surface, noise, crowd, lighting, kerbs
- **Real explanation** — generated by the routing engine
- **Heatmap overlay** — colored dots from real accessibility scores
- **Transit stops** — 292 Unitrans bus stops with wheelchair indicators
- **Origin/destination markers** — green (start) and red (end) pins

### Files Created/Modified

| File | Change |
|------|--------|
| `frontend/lib/api.ts` | **NEW** — Typed API client with interfaces for all backend responses |
| `frontend/components/access-map/types.ts` | **MODIFIED** — Added routeGeoJSON, heatmapPoints, transitStops, onMapClick props |
| `frontend/components/access-map/leaflet-map.tsx` | **REWRITTEN** — Interactive map with real data rendering |
| `frontend/components/access-dashboard.tsx` | **REWRITTEN** — Live data fetching, score breakdowns, click-to-route |
| `frontend/components/access-map/map-view.tsx` | **UPDATED** — Pass-through of new props |

---

## Current State

### What works end-to-end

1. Start backend → pipeline loads 15 MB of OSM/GTFS data → builds graph in ~5s
2. Start frontend → connects to backend on `localhost:8000`
3. Select accessibility profile → route recomputes with profile-specific weights
4. Click map → set origin/destination → new route appears with scores
5. Toggle heatmap → see accessibility score overlay across Davis
6. Toggle transit → see 292 bus stops with wheelchair indicators
7. Score breakdown shows slope, surface, noise, crowd, lighting, curb ramps

### What's not yet built

- [ ] Gemini image analysis endpoint (image upload → CV accessibility assessment)
- [ ] Real-time elevation enrichment (currently skipped via `SKIP_ELEVATION=true` for fast startup)
- [ ] Yolobus GTFS integration (endpoint currently down)
- [ ] User authentication / route saving
- [ ] Mobile-responsive fine-tuning

---

## How to Run

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
SKIP_ELEVATION=true python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` — the frontend auto-connects to `http://localhost:8000`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4, shadcn/ui, Leaflet, react-leaflet |
| Backend | FastAPI, Python 3.13, uvicorn |
| Routing | NetworkX (Dijkstra), scipy KDTree |
| Data | OpenStreetMap Overpass API, Open-Meteo Elevation API, Unitrans GTFS |
| AI | Gemini API (planned) |
| Spatial | Shapely, scipy.spatial.KDTree |
