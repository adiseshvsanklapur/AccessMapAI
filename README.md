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

- OpenStreetMap
- Elevation APIs
- ADA accessibility datasets
- Transit GTFS feeds
- Campus accessibility data

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
