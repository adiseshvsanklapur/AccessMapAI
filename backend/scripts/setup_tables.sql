-- 1. Create Hazards Table
create table public.hazards (
    id uuid primary key default gen_random_uuid(),
    lat double precision not null,
    lon double precision not null,
    type text not null,
    description text,
    affected_profiles text[] not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create OSM Nodes Table
create table public.osm_nodes (
    id bigint primary key,
    lat double precision not null,
    lon double precision not null,
    tags jsonb not null
);

-- 3. Create OSM Ways Table
create table public.osm_ways (
    id bigint primary key,
    tags jsonb not null,
    nodes bigint[] not null
);

-- 4. Create Buildings Table
create table public.osm_buildings (
    id bigint primary key,
    lat double precision not null,
    lon double precision not null,
    tags jsonb not null
);

-- 5. Create Roads Table
create table public.osm_roads (
    id bigint primary key,
    tags jsonb not null,
    nodes bigint[] not null
);

-- 6. Create Lighting Table
create table public.osm_lighting (
    id bigint primary key,
    lat double precision not null,
    lon double precision not null,
    tags jsonb not null
);

-- 7. Create Accessibility Features Table
create table public.accessibility_features (
    id bigint primary key,
    lat double precision not null,
    lon double precision not null,
    tags jsonb not null,
    element_type text not null
);
