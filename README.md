# AccessMap AI

**Accessibility-first navigation for the 1 in 4 the city forgot.**

> Most navigation apps optimize for speed — not accessibility.
> A missing curb ramp can make an entire route impossible.

AccessMap AI builds a personalized, explainable map of the city for people with different accessibility needs. It combines OpenStreetMap, transit feeds, elevation data, live user-reported hazards, and Gemini-powered image analysis to route around the things other maps pretend aren't there.

Built for **HackDavis 2026**.

---

## Why

- **1 in 4** US adults lives with a disability — 70M+ people navigating environments not designed for them.
- Most routing engines optimize for "shortest path" over "passable path."
- Static accessibility tags (e.g. `wheelchair=yes`) don't capture the real environment: slope, surface, lighting, crowd density, missing ramps, broken sidewalks, or live obstructions.

AccessMap AI replaces "shortest" with **per-profile, hazard-aware, explainable** routing.

---

## Features

| Feature                    | What it does                                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Profile-aware routing**  | 5 accessibility profiles with distinct cost functions over slope, surface, stairs, curb ramps, tactile paving, audible crossings, lighting, noise, and crowd density. Profiles can be combined.                                                             |
| **Live community hazards** | Users drop pins for construction, broken ramps, blocked sidewalks, etc. Hazards are stored in Supabase, tagged with the profiles they affect, and used to **steer routes around them** and **lower the route score** when a relevant hazard is on the path. |
| **AI sidewalk analysis**   | Upload a photo of a sidewalk/entrance/crosswalk → Gemini returns surface type, slope estimate, hazards, a 0–100 accessibility score, and a wheelchair verdict, with sanity-checked post-processing.                                                         |
| **Explainable routes**     | Every route comes back with a per-factor score breakdown (slope, surface, lighting, hazards, etc.) and a plain-English "Why this route" paragraph.                                                                                                          |
| **Spoken directions**      | The Directions card has Read aloud / Pause / Stop controls powered by the browser's Web Speech API. Each turn is queued as its own utterance, the currently-spoken step is highlighted in the list, and speech auto-cancels when the route changes.        |
| **Heatmaps & overlays**    | Configurable heatmaps for `accessibility_score`, `noise_score`, `crowd_score`, `lighting_score`, `surface_score`, `kerb_score`. Accessibility-feature points (curb ramps, tactile paving, crossings) are queryable per bounds.                              |
| **Authenticated profiles** | Supabase auth with a per-user accessibility profile (routing preference + free-form notes).                                                                                                                                                                 |

---

## Repository layout

```
AccessMapAI/
├── frontend/                Next.js 15 app (landing + dashboard + auth)
│   ├── app/
│   │   ├── page.tsx                Landing page  (route: /)
│   │   ├── app/page.tsx            Map dashboard (route: /app)
│   │   ├── login/                  Email/password sign-in
│   │   ├── signup/                 Sign-up + email confirmation
│   │   ├── auth/callback/          PKCE callback for email links
│   │   ├── profile/                Profile view
│   │   └── profile/setup/          Onboarding (routing profile + notes)
│   ├── components/
│   │   ├── access-dashboard.tsx    Main map UI, profile picker, hazards, AI panel
│   │   ├── access-map/             Mapbox map + layer types
│   │   └── auth-provider.tsx       Supabase client + session/profile state
│   └── lib/                        api.ts, supabase/, hazard-labels, profile-types
│
├── backend/                 FastAPI + accessibility pipeline
│   ├── main.py                     App entry, lifespan pipeline boot, routes
│   ├── api/
│   │   ├── vision.py               POST /analyze-sidewalk (Gemini)
│   │   └── hazards.py              GET/POST /hazards (Supabase-backed)
│   ├── pipeline/
│   │   ├── enrichment.py           run_pipeline(): builds the enriched graph
│   │   ├── graph_builder.py        OSM ways → NetworkX nodes/edges
│   │   ├── elevation.py            Open-Meteo batch → slope per edge
│   │   ├── gtfs.py                 Loads Unitrans GTFS → stops/routes
│   │   └── scoring.py              Heuristic scores (crowd, noise, lighting, …)
│   ├── routing/
│   │   ├── engine.py               Dijkstra w/ profile + hazard cost function
│   │   └── profiles.py             5 profiles + combined-profile builder
│   └── scripts/                    DB migration / RLS scripts
│
├── data/                    OSM extracts + GTFS for UC Davis / Davis, CA
│   ├── osm/                        sidewalks, buildings, roads, accessibility, lighting
│   └── gtfs/unitrans/              292 stops · 22 routes · 7,673 trips
│
├── supabase/                Auth + tables
│   ├── README.md                   Project setup steps
│   └── migrations/                 profiles table + RLS policies + triggers
│
└── README.md                You are here.
```

---

## Quick start

You need three things running: **Supabase project**, **backend**, **frontend**.

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → URL configuration**: site URL `http://localhost:3000`, redirect URL `http://localhost:3000/auth/callback`.
3. **SQL Editor** → paste `supabase/migrations/20260209120000_profiles.sql` → Run.
4. Create a `hazards` table (or run `backend/scripts/setup_tables.sql`):
   ```sql
   create table public.hazards (
     id uuid default gen_random_uuid() primary key,
     lat double precision not null,
     lon double precision not null,
     type text not null,
     description text default '',
     affected_profiles text[] default '{}',
     created_at timestamptz default now()
   );
   ```
5. Note your `Project URL` and `anon`/`service_role` keys from **Project Settings → API**.

### 2. Backend (`backend/`)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_key_here       # or "mock" to use the canned demo response
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<service_role_key>           # used server-side for hazard inserts
```

Run:

```bash
uvicorn main:app --reload --port 8000
```

The pipeline boots once at startup (~5s) and builds the enriched pedestrian graph (~20k nodes, ~21k edges).

### 3. Frontend (`frontend/`)

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
# Optional build label shown next to the logo
NEXT_PUBLIC_BUILD_LABEL=dev
```

Run:

```bash
npm run dev
```

Open:

- `http://localhost:3000/` — landing page
- `http://localhost:3000/app` — interactive map dashboard
- `http://localhost:8000/docs` — FastAPI auto docs

---

## Environment variables

### Backend (`backend/.env`)

| Var              | Required           | Notes                                                                     |
| ---------------- | ------------------ | ------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | for image analysis | Set to `mock` to return a canned response (handy without burning credits) |
| `SUPABASE_URL`   | yes                | For hazard CRUD                                                           |
| `SUPABASE_KEY`   | yes                | `service_role` key, server-only                                           |
| `SKIP_ELEVATION` | optional           | `true` to skip Open-Meteo elevation calls (faster boot, slope=0)          |

### Frontend (`frontend/.env.local`)

| Var                                                         | Required | Notes                             |
| ----------------------------------------------------------- | -------- | --------------------------------- |
| `NEXT_PUBLIC_API_URL`                                       | yes      | e.g. `http://localhost:8000`      |
| `NEXT_PUBLIC_MAPBOX_TOKEN`                                  | yes      | Mapbox public token               |
| `NEXT_PUBLIC_SUPABASE_URL`                                  | yes      | Same project as backend           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                             | yes      | The `anon` key (browser-safe)     |
| `NEXT_PUBLIC_BUILD_LABEL`                                   | optional | Shown next to the logo            |
| `NEXT_PUBLIC_GIT_SHA` / `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | optional | Auto-shortened on the build badge |

> Next.js does not load `.env.local.example`. Always copy to `.env.local`.

---

## System architecture

```
┌──────────────────────┐      HTTPS       ┌────────────────────────────┐
│  Next.js (App Router)│ ───────────────► │  FastAPI (uvicorn :8000)   │
│  /, /app, auth, profile                  │                            │
│  Mapbox GL · shadcn  │ ◄─── JSON ─────  │  /route /heatmap /hazards  │
└──────────┬───────────┘                  │  /analyze-sidewalk /stats  │
           │                              └─────────────┬──────────────┘
           │ Supabase (auth + profiles +                │
           │            hazard table)                   │
           ▼                                            ▼
   ┌──────────────────┐                       ┌────────────────────┐
   │   Supabase       │                       │ Routing Engine     │
   │   • auth.users   │                       │ NetworkX + KDTree  │
   │   • profiles     │                       │ Dijkstra w/ profile│
   │   • hazards      │ ◄─── 30s cache ──────►│ + hazard cost fn   │
   └──────────────────┘                       └─────────┬──────────┘
                                                        │
                                              ┌─────────▼──────────┐
                                              │  Data Pipeline     │
                                              │  OSM • GTFS •      │
                                              │  Open-Meteo • Heuristics
                                              └────────────────────┘
                                                        ▲
                                                        │ Gemini API
                                              ┌─────────┴──────────┐
                                              │  Vision endpoint   │
                                              │  /analyze-sidewalk │
                                              └────────────────────┘
```

---

## Accessibility profiles

Defined in `backend/routing/profiles.py`. Each profile sets weights for the cost function below.

| Profile              | Hard constraints                                                          | What it strongly prefers                                                                                        |
| -------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **wheelchair**       | avoid stairs · `max_slope=8.33%` (ADA) · `min_width=1.2m` · avoid unpaved | smooth surfaces (0.9), gentle slopes (0.95), curb ramps (0.9), explicit sidewalks (0.8)                         |
| **blind**            | —                                                                         | tactile paving (0.8), signalized crossings (0.85), low noise (0.8), low crowds (0.7), consistent surfaces (0.7) |
| **elderly**          | `max_slope=10%`                                                           | gentle slope (0.8), good lighting (0.7), surface quality (0.7), low crowds (0.5)                                |
| **neurodivergent**   | —                                                                         | low noise (0.95), low crowds (0.95), some lighting (0.4)                                                        |
| **temporary_injury** | avoid stairs · `max_slope=12%`                                            | smooth surfaces (0.6), low slope (0.7), strong stairs aversion (`stairs_penalty=10`)                            |
| **default**          | —                                                                         | balanced 0.3–0.4 across factors                                                                                 |

**Combining profiles**: when multiple are selected, weights take the `max` (most demanding factor wins) and hard constraints become the most restrictive (e.g. wheelchair + temporary*injury → stairs avoided, slope cap min). Combined name becomes `combined*<a>\_<b>`.

---

## Routing engine

Dijkstra over a NetworkX graph using a per-profile cost function:

```
edge_cost = distance_m * (1 + penalty_sum)
```

### Hard constraints (return `distance * very_large`)

- `avoid_stairs` & edge has stairs → ×1000 (effectively impassable)
- `requires_width` & edge width below it → ×50
- `max_slope` exceeded → ×20
- `avoid_unpaved` & poor surface (gravel/dirt/mud) → ×15
- **Hazard within 25 m of the edge** that affects the user's profile → ×50

### Soft penalties (sum into `penalty_sum`)

`slope`, `surface`, `noise`, `crowd`, `lighting`, `kerb`, `stairs`, `crossing_signal_score` (bonus), `tactile_score` (bonus), `is_sidewalk` (bonus). Each weighted by the profile.

### Hazard scoring on the final path

After Dijkstra, every reported hazard whose `affected_profiles` overlaps the user's selected profiles is checked against every node on the path:

| Distance to nearest path node | Penalty       |
| ----------------------------- | ------------- |
| < 15 m                        | 0.40 (high)   |
| < 30 m                        | 0.25 (medium) |
| < 60 m                        | 0.10 (low)    |
| ≥ 60 m                        | ignored       |

Penalties cap at 0.7. Output:

- New `scores.hazards` bucket = `1 - hazard_penalty`
- `scores.overall` is reduced by `0.4 * hazard_penalty`
- `hazards_on_route` array surfaced in the response (id, type, distance, severity, …)
- Explanation appends a heads-up sentence like _"Heads up: 2 reported hazard(s) for your profile lie close to this route (1 within 30m, 1 within 60m) — score adjusted accordingly."_

### Why this route

`_generate_explanation()` aggregates path stats (avg slope, surface, lighting, noise, crowd, crossing-signal, tactile, sidewalk ratio) and emits a profile-aware paragraph in plain English.

### Spoken directions

The Directions card in `/app` can read each turn out loud — useful for blind / low-vision users, or anyone who can't keep their eyes on the screen.

- Implemented as a `useDirectionsSpeech` hook in `frontend/components/access-dashboard.tsx` over the browser's [`window.speechSynthesis`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) API — no extra deps, no server round-trip.
- Each direction step is queued as its own `SpeechSynthesisUtterance`, formatted as `"Step N. <instruction>. <distance> meters."`.
- `onstart` / `onend` callbacks update a `currentStep` state, which highlights the active step in the list (primary tint + filled badge) so visual users can follow along.
- Controls: **Read aloud** (or **Resume** when paused) · **Pause** · **Stop**. Buttons only render when `speechSynthesis` is supported, so older browsers degrade gracefully.
- Speech is automatically cancelled when `routeData.directions` changes (new route) and on component unmount, so old utterances never bleed into a freshly-computed route.
- All controls have explicit `aria-label`s for screen-reader users.

> Note: the Web Speech API uses voices already installed on the user's OS; quality varies by platform.

---

## Data pipeline

`backend/pipeline/enrichment.py` runs once at server startup (`lifespan`).

1. **`graph_builder.py`** — Loads OSM JSON (sidewalks, paths, steps), de-dupes nodes, builds a NetworkX graph with edges tagged `surface`, `width`, `incline`, `kerb`, `tactile_paving`, `lit`, `wheelchair`, `has_stairs`, `is_sidewalk`.
2. **`elevation.py`** — Batches edge midpoints to **Open-Meteo Elevation** (free, no key) → computes `slope` (%) per edge from rise/run.
3. **`gtfs.py`** — Loads Unitrans GTFS → `stops`, `routes`.
4. **`scoring.py`** — Computes derived per-edge scores:
   | Score | Method |
   |---|---|
   | `surface_score` | OSM `surface` lookup table (`asphalt=1.0`, `gravel=0.4`, `mud=0.1`, …) |
   | `kerb_score` | KDTree over `kerb=*` features (`flush=1.0`, `lowered=0.9`, `raised=0.3`) |
   | `tactile_score` | KDTree over `tactile_paving=yes` |
   | `crossing_signal_score` | KDTree over `highway=crossing` with `crossing=traffic_signals` |
   | `lighting_score` | KDTree over street lamps + `lit=yes`; daytime=1.0, night ∝ lamp density |
   | `noise_score` | FHWA line-source attenuation: distance to nearest road weighted by class |
   | `crowd_score` | Time-of-day curve × building density × campus hotspot proximity (Memorial Union / Silo / ARC) |
   | `accessibility_score` | Weighted combination of the above |

### UC Davis / Davis dataset

| Dataset                      | File                                   | Records                             |
| ---------------------------- | -------------------------------------- | ----------------------------------- |
| Sidewalks & paths (UC Davis) | `data/osm/sidewalks_paths.json`        | 13,832 elements                     |
| Sidewalks & paths (Davis)    | `data/osm/davis_all_sidewalks.json`    | 10,070 elements                     |
| Buildings                    | `data/osm/buildings.json`              | 1,109                               |
| Roads                        | `data/osm/roads.json`                  | 24,301 elements                     |
| Accessibility features       | `data/osm/accessibility_features.json` | 1,180                               |
| POIs / amenities             | `data/osm/davis_amenities.json`        | 1,177                               |
| Street lighting              | `data/osm/davis_lighting.json`         | 1,104                               |
| Unitrans GTFS                | `data/gtfs/unitrans/`                  | 292 stops · 22 routes · 7,673 trips |

Built graph: **~19,700 nodes · ~20,700 edges**, ~5 s pipeline boot.

---

## Hazards (live, community-reported)

`backend/api/hazards.py` is a thin layer over a Supabase `hazards` table.

- **`POST /hazards`** — payload `{lat, lon, type, description, affected_profiles[]}`. Inserts a row, busts the in-memory cache.
- **`GET /hazards`** — returns all current hazards (used by the map markers).
- **30-second in-process cache** so `/route` doesn't hammer Supabase on every call.

Frontend flow: in `/app`, click "Report hazard" → click on the map → fill out type, description, and affected profiles → submit. The pin appears immediately on the map and starts affecting routes.

---

## Gemini sidewalk analysis

`backend/api/vision.py` exposes `POST /analyze-sidewalk` (multipart form, single `image` file).

Prompted output schema (validated by Pydantic):

```json
{
  "overall_score": 78, // 0-100, HIGHER = BETTER
  "surface_type": "concrete",
  "slope_estimate": "gentle (2-4%)",
  "hazards": [
    { "type": "Obstruction", "description": "...", "severity": "medium" }
  ],
  "wheelchair_accessible": true,
  "explanation": "..."
}
```

### Sanity-check post-processing

Gemini occasionally inverts the score axis (treating 0 as "best"). `_postprocess_result` re-anchors:

- `wheelchair_accessible=true` and no high-severity hazards but score < 35 → score is lifted to 65–85.
- `wheelchair_accessible=false` and any high-severity hazard but score > 55 → score is capped at 35.

If `GEMINI_API_KEY` is unset or `mock`, the endpoint returns a canned demo response (with a 2.5 s artificial delay) so the UI can be demoed without burning credits.

---

## Auth & user profiles

- **Supabase Auth** with email/password + PKCE callback at `/auth/callback`.
- A `profiles` row is auto-created on signup via the `on_auth_user_created` trigger.
- Onboarding (`/profile/setup`) collects routing profile + free-text notes (`mobility_notes`, `sensory_notes`, `additional_needs`) and flips `onboarding_completed`.
- `AuthProvider` (`frontend/components/auth-provider.tsx`) gates the dashboard: if `user && !profile.onboarding_completed`, it forces `/profile/setup`.
- Sign-out drops back to the landing page (`/`).

RLS policies ensure each user only sees/edits their own profile row.

---

## Frontend routes

| Route            | Purpose                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `/`              | Marketing landing page                                                              |
| `/app`           | Map dashboard (origin/dest pinning, profile picker, hazards, route panel, AI panel) |
| `/login`         | Email/password sign-in (`?next=` supported, defaults to `/app`)                     |
| `/signup`        | Email/password sign-up (sends confirmation email)                                   |
| `/auth/callback` | PKCE callback (server fallback at `app/api/auth/callback`)                          |
| `/profile`       | Profile view + edit                                                                 |
| `/profile/setup` | Onboarding flow (forced after first signup)                                         |

---

## API reference

All endpoints are FastAPI auto-documented at `http://localhost:8000/docs`.

| Method     | Path                    | Purpose                                                                                        |
| ---------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| GET        | `/`                     | Health/version + pipeline stats                                                                |
| GET        | `/profiles`             | List accessibility profiles                                                                    |
| POST       | `/route`                | Compute a profile-aware route (body: `origin_lat, origin_lon, dest_lat, dest_lon, profiles[]`) |
| GET        | `/route`                | Same as POST, query-string version                                                             |
| GET        | `/heatmap`              | Heatmap for a metric within bounds (`metric`, `north/south/east/west`)                         |
| GET        | `/transit`              | Unitrans stops & routes                                                                        |
| GET        | `/edge/{u}/{v}`         | Inspect raw edge data                                                                          |
| GET        | `/stats`                | Pipeline stats (counts + score distributions)                                                  |
| GET        | `/accessibility-points` | Categorized accessibility features in bounds                                                   |
| GET / POST | `/hazards`              | List or create hazards                                                                         |
| POST       | `/analyze-sidewalk`     | Gemini image analysis (multipart)                                                              |

### Sample `POST /route` response

```jsonc
{
  "origin": { "lat": 38.5382, "lon": -121.7541 },
  "destination": { "lat": 38.5421, "lon": -121.7493 },
  "profiles": ["wheelchair"],
  "profile_display": "Wheelchair User",
  "distance_m": 612.4,
  "path": [{ "lat": ..., "lon": ..., "node_id": ... }, ...],
  "explanation": "This route is 612 meters long, avoiding all stairs, ...",
  "directions": [...],
  "scores": {
    "overall": 0.83, "slope": 0.94, "surface": 0.91, "noise": 0.71,
    "crowd": 0.62, "lighting": 0.55, "kerb": 0.88,
    "crossing_signals": 0.42, "tactile": 0.30, "hazards": 0.90
  },
  "geojson": { "type": "Feature", "geometry": { "type": "LineString", ... } },
  "hazards_on_route": [
    {
      "id": "...", "type": "broken_ramp", "distance_m": 22.0,
      "severity": "medium", "affected_profiles": ["wheelchair"]
    }
  ]
}
```

---

## Tech stack

**Frontend** — Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · `react-map-gl` (Mapbox GL JS v3) · `lucide-react` · `@supabase/ssr`

**Backend** — FastAPI · Uvicorn · NetworkX · SciPy KDTree · NumPy · Pandas · Shapely · httpx · `google-genai` · `supabase` (python) · `python-dotenv`

**Data** — OpenStreetMap (Overpass API) · Unitrans GTFS · Open-Meteo Elevation · Mapbox basemap (`navigation-night-v1`)

**Infra** — Supabase (Postgres + auth + RLS)

---

## Limitations & honest notes

- **Geographic scope**: dataset is currently Davis, CA + UC Davis. Adding a new city = drop fresh OSM extracts in `data/osm/` and re-boot.
- **Elevation**: Open-Meteo is free but rate-limited; `SKIP_ELEVATION=true` is supported for fast iteration.
- **Heuristics**: noise/crowd/lighting are derived (not measured). They're calibrated to Davis hotspots; they will need recalibration for other cities.
- **Image analysis**: Gemini is a probabilistic model. The post-processor handles the most common score-inversion failure mode but cannot catch subtle errors.
- **Hazard table**: the schema is intentionally simple. There's no expiry/voting system yet — all reported hazards are treated as currently active.

---

## Roadmap

- Hazard expiry / community confirmation flow
- Multi-city onboarding (city picker + dataset hot-swap)
- Indoor accessibility (entrances, elevators) via OSM `indoor=*`
- ML-driven sidewalk segmentation from street imagery
- Aggregated heatmap of "missing infrastructure" (places where the routing engine routinely refuses paths)

---

## Credits

Built for **HackDavis 2026**. Open data: OpenStreetMap contributors · Unitrans GTFS · Open-Meteo. AI: Google Gemini. Map: Mapbox.
