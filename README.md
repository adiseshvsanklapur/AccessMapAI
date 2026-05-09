# AccessMap AI

AI-powered accessibility intelligence platform for urban and campus navigation.

Built for HackDavis 2026.

---

# Overview

AccessMap AI is a multimodal accessibility platform that creates a dynamic “digital twin” of urban and campus environments for people with different accessibility needs.

Unlike traditional navigation systems, AccessMap AI reasons about real-world accessibility conditions such as:

- sidewalk quality
- elevation and slope
- stairs and curb ramps
- lighting conditions
- crowd density
- noise levels
- crosswalk safety
- entrance accessibility

The system generates personalized routes and accessibility insights for users including:

- wheelchair users
- blind/low-vision users
- elderly individuals
- neurodivergent users
- temporarily injured users

AccessMap AI combines:

- AI reasoning
- computer vision
- GIS/routing systems
- accessibility research
- multimodal analysis

to create intelligent and explainable accessibility-aware navigation.

---

# Inspiration

Accessibility infrastructure is often incomplete, inconsistent, or difficult to evaluate in real time.

Most navigation tools only provide basic accessibility tags and fail to account for nuanced environmental factors such as:

- steep inclines
- cracked sidewalks
- crowded walkways
- poor lighting
- unsafe crossings
- sensory overload environments

We wanted to build a system that goes beyond static accessibility labels and instead reasons contextually about how different users experience physical spaces.

Our goal was to create an AI-powered platform that could eventually serve as real civic infrastructure for accessibility equity.

---

# Features

## Personalized Accessibility Routing

Generate routes optimized for different accessibility profiles:

- wheelchair users
- blind/low vision users
- elderly users
- neurodivergent users
- temporary injuries

The routing engine dynamically adjusts pathfinding weights based on user-specific mobility and sensory needs.

---

## AI Accessibility Reasoning

Routes are not only generated — they are explained.

Example:

> “This route avoids steep inclines near the Quad and prioritizes well-lit pathways with curb ramps.”

This creates transparency and explainability in accessibility decisions.

---

## Multimodal Image Analysis

Users can upload images of:

- sidewalks
- building entrances
- pathways
- intersections

Using the Gemini API, AccessMap AI analyzes accessibility barriers such as:

- missing ramps
- stairs
- narrow pathways
- obstacles
- poor lighting
- inaccessible entrances

---

## Accessibility Heatmaps

Visual overlays display:

- accessibility scores
- danger zones
- infrastructure gaps
- route confidence

---

## Infrastructure Recommendations

The system can suggest accessibility improvements such as:

- ramp installation
- sidewalk repairs
- safer crossings
- improved lighting

---

# Tech Stack

## Frontend

- Next.js 15
- TypeScript
- Tailwind CSS
- shadcn/ui
- Mapbox GL JS / Leaflet

---

## Backend

- FastAPI
- Python
- NetworkX
- OpenRouteService / OpenStreetMap

---

## AI / ML

- Gemini API
- OpenCV
- YOLOv8 (optional CV pipeline)

---

## Data Sources

All datasets are stored in `data/` and fetched from open, public APIs. No API keys required.

### OpenStreetMap (Overpass API)

| Dataset | File | Records | Source |
|---------|------|---------|--------|
| Sidewalks & Paths (UC Davis) | `data/osm/sidewalks_paths.json` | 13,832 elements (2,644 ways, 11,188 nodes) | Overpass API — `highway=footway\|path\|pedestrian\|cycleway` within UC Davis area |
| Sidewalks & Paths (Davis city) | `data/osm/davis_all_sidewalks.json` | 10,070 elements | Overpass API — `highway=footway\|path\|pedestrian` + `highway=steps` within Davis |
| Buildings | `data/osm/buildings.json` | 1,109 buildings | Overpass API — `building=*` within UC Davis (used for crowd density heuristic) |
| Roads | `data/osm/roads.json` | 24,301 elements (4,398 ways) | Overpass API — `highway=motorway\|trunk\|primary\|secondary\|tertiary\|residential\|service` (used for noise estimation) |
| Accessibility Features | `data/osm/accessibility_features.json` | 1,180 features | Overpass API — `kerb=*`, `tactile_paving=yes`, `highway=crossing`, `wheelchair=*` within Davis |
| Amenities / POIs | `data/osm/davis_amenities.json` | 1,177 POIs | Overpass API — `amenity=*`, `shop=*` within Davis |
| Street Lighting | `data/osm/davis_lighting.json` | 1,104 features | Overpass API — `highway=street_lamp`, `lit=yes` within Davis |

OSM tags used for edge scoring: `surface`, `width`, `incline`, `kerb`, `tactile_paving`, `lit`, `wheelchair`.

### Transit GTFS

| Dataset | File | Records | Source |
|---------|------|---------|--------|
| Unitrans (UC Davis bus) | `data/gtfs/unitrans/` (12 files) | 292 stops, 22 routes, 7,673 trips, 97,741 stop times, 97 route shapes | [unitrans.ucdavis.edu/media/gtfs/Unitrans_GTFS.zip](https://unitrans.ucdavis.edu/media/gtfs/Unitrans_GTFS.zip) |

### Elevation API

| API | Endpoint | Details |
|-----|----------|---------|
| Open-Meteo Elevation | `https://api.open-meteo.com/v1/elevation` | Free, no API key, supports batch queries (up to 100 coords per request). Used to compute slope percentage per graph edge. Davis elevation range: 16–20m. |

### Heuristic Models (computed from OSM data above)

These are not external datasets but derived scores computed at pipeline startup:

| Heuristic | Inputs | Method |
|-----------|--------|--------|
| **Crowd Density** | Time of day + building count within 100m radius | KDTree spatial index over building centroids; weekday/hour schedule weights |
| **Noise Level** | Distance to nearest road + road classification | FHWA line-source attenuation model; ~3 dB per distance doubling from reference road types |
| **Lighting Score** | Streetlamp proximity + `lit=yes` tags + hour | KDTree over streetlamp locations; daytime=1.0, nighttime varies by lamp density |
| **Surface Quality** | OSM `surface` tag on ways | Lookup table: asphalt=1.0, concrete=0.95, gravel=0.4, mud=0.1, etc. |
| **Curb Ramp Score** | Nearby `kerb` nodes + `tactile_paving` tags | KDTree over accessibility features; flush=1.0, lowered=0.9, raised=0.3 |

### Pipeline Summary

| Metric | Value |
|--------|-------|
| Total graph nodes | 19,709 |
| Total graph edges | 20,727 |
| Total data size | ~15 MB |
| Pipeline startup time | ~5 seconds |

---

# System Architecture

```text
Frontend (Next.js)
        ↓
FastAPI Backend
        ↓
Accessibility Routing Engine
        ↓
AI Reasoning Layer (Gemini)
        ↓
GIS + Accessibility Data Sources
