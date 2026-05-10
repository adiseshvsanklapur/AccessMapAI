-- Disable RLS on all tables to allow the migration script to insert data using the anon key
alter table public.hazards disable row level security;
alter table public.osm_nodes disable row level security;
alter table public.osm_ways disable row level security;
alter table public.osm_buildings disable row level security;
alter table public.osm_roads disable row level security;
alter table public.osm_lighting disable row level security;
alter table public.accessibility_features disable row level security;
