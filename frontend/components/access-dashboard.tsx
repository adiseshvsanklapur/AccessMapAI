"use client";

import {
  Accessibility, Camera, Ear, Footprints, Info, MapPinned, Moon,
  Route, Sparkles, Upload, UserRound,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

import { MapView } from "@/components/access-map/map-view";
import type { MapLayerToggle } from "@/components/access-map/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchRoute, fetchHeatmap, fetchTransit,
  type RouteResponse, type HeatmapPoint, type TransitStop,
} from "@/lib/api";

const PROFILES = [
  { value: "wheelchair", title: "Wheelchair", description: "Ramps & slope constraints", icon: Accessibility },
  { value: "blind", title: "Blind / low vision", description: "Tactile cues & crossings", icon: Moon },
  { value: "elderly", title: "Elderly", description: "Rest stops & glare", icon: Footprints },
  { value: "neurodivergent", title: "Neurodivergent", description: "Noise & sensory load", icon: Ear },
  { value: "temporary_injury", title: "Temporary injury", description: "Shorter distances", icon: UserRound },
] as const;

type ProfileValue = (typeof PROFILES)[number]["value"];

const defaultLayers: MapLayerToggle = { route: true, heatmap: true, obstacles: true, dangerZones: true };

// Default locations: Memorial Union → Shields Library
const DEFAULT_ORIGIN: [number, number] = [38.5422, -121.7494];
const DEFAULT_DEST: [number, number] = [38.5396, -121.7490];

const SCORE_LABELS: Record<string, string> = {
  slope: "Slope", surface: "Surface", noise: "Noise", crowd: "Crowd",
  lighting: "Lighting", kerb: "Curb Ramps",
};

export function AccessDashboard() {
  const scoringId = useId();
  const [profile, setProfile] = useState<ProfileValue>("wheelchair");
  const [layers, setLayers] = useState<MapLayerToggle>(defaultLayers);
  const [consentGeminiTerms, setConsentGeminiTerms] = useState(true);

  // Live data state
  const [origin, setOrigin] = useState<[number, number] | null>(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState<[number, number] | null>(DEFAULT_DEST);
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendReady, setBackendReady] = useState(false);
  const [clickMode, setClickMode] = useState<"origin" | "dest">("origin");

  // Fetch route when origin, destination, or profile changes
  useEffect(() => {
    if (!origin || !destination) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRoute(origin[0], origin[1], destination[0], destination[1], profile)
      .then((data) => { if (!cancelled) { setRouteData(data); setBackendReady(true); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [origin, destination, profile]);

  // Fetch heatmap & transit on mount
  useEffect(() => {
    fetchHeatmap("accessibility_score")
      .then((r) => setHeatmapPoints(r.points))
      .catch(() => {});
    fetchTransit()
      .then((r) => setTransitStops(r.stops))
      .catch(() => {});
  }, []);

  // Map click handler — alternate between setting origin and destination
  const handleMapClick = useCallback((lat: number, lon: number) => {
    if (clickMode === "origin") {
      setOrigin([lat, lon]);
      setClickMode("dest");
    } else {
      setDestination([lat, lon]);
      setClickMode("origin");
    }
  }, [clickMode]);

  const overallScore = routeData ? Math.round(routeData.scores.overall * 100) : 0;

  return (
    <div className="flex min-h-svh flex-col bg-white dark:bg-background">
      <header className="sticky top-0 z-40 border-border/80 border-b bg-white/90 px-4 py-[1.125rem] shadow-[inset_0_-1px_0_0_rgba(92,50,168,0.09)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/75 dark:bg-background/90 md:px-8">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 ring-2 ring-black/[0.04] dark:shadow-primary/20 dark:ring-white/[0.08]">
                <MapPinned className="relative z-10 size-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]" aria-hidden />
                <span aria-hidden className="pointer-events-none absolute inset-x-[-40%] top-[-60%] h-[140%] bg-white/30 blur-xl dark:bg-white/10" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground text-lg tracking-tighter">
                  AccessMap AI
                  <Badge variant="secondary" className="ml-2 align-middle font-mono text-[10px] tracking-wide uppercase">
                    {backendReady ? "Live" : "Connecting…"}
                  </Badge>
                </p>
                <p className="text-muted-foreground text-[0.813rem] leading-snug md:max-w-lg">
                  Explainable accessibility routing powered by real OSM data.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Badge variant="outline" className="gap-1.5 rounded-full border-border/80 bg-background/60 px-3 py-0.5 font-medium">
              <Sparkles className="size-3.5 opacity-70" aria-hidden />
              Gemini storyboard
            </Badge>
            <Badge variant="outline" className="gap-1.5 rounded-full border-border/80 bg-background/60 px-3 py-0.5 font-medium">
              OSM tiles
            </Badge>
            {backendReady && (
              <Badge className="gap-1.5 rounded-full bg-emerald-500/90 px-3 py-0.5 font-medium text-white">
                Backend connected
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col lg:flex-row lg:overflow-hidden">
        <aside className="flex max-h-none w-full flex-col gap-4 border-border/80 border-b bg-white px-4 py-5 lg:max-h-full lg:w-[min(396px,100%)] lg:shrink-0 lg:border-r lg:border-b-0 lg:bg-gradient-to-b lg:from-white lg:to-[#faf8fc] lg:px-7 dark:border-border dark:from-transparent dark:to-transparent dark:bg-transparent">
          {/* Profile selector */}
          <Card className="shadow-md shadow-black/[0.02] ring-1 ring-black/[0.03] dark:shadow-black/35 dark:ring-white/[0.06]">
            <CardHeader className="pb-3">
              <CardTitle className="font-semibold text-base">Disability profile</CardTitle>
              <CardDescription>Select a profile to remap routing weights.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <RadioGroup value={profile} onValueChange={(v) => setProfile(v as ProfileValue)} className="gap-2.5">
                {PROFILES.map(({ value, title, description, icon: Icon }) => {
                  const id = `profile-${value}`;
                  return (
                    <Label key={value} htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-card/80 px-3.5 py-3 shadow-none transition-colors hover:border-primary/20 hover:bg-muted/45 dark:border-border dark:hover:border-primary/30">
                      <RadioGroupItem value={value} id={id} className="mt-1 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 text-muted-foreground" aria-hidden />
                          <span className="font-medium text-sm">{title}</span>
                        </div>
                        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
                      </div>
                    </Label>
                  );
                })}
              </RadioGroup>
              <Separator className="my-4" />
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-3.5 font-mono text-muted-foreground text-[11px] leading-relaxed">
                <span className="flex items-start gap-2 font-medium text-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
                  Click the map to set origin (green) then destination (red).
                  Next click sets: <strong className="text-primary">{clickMode === "origin" ? "Origin" : "Destination"}</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Why this route */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-primary/[0.07] via-card to-muted/40 shadow-[0_16px_40px_-32px_color-mix(in_oklab,var(--primary)_52%,transparent)] ring-2 ring-primary/15 dark:from-primary/[0.13] dark:via-card dark:to-muted/28 dark:ring-primary/25">
            <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/[0.08] blur-3xl dark:bg-primary/[0.12]" />
            <CardHeader className="relative pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base tracking-tight">Why this route?</CardTitle>
                  <CardDescription>
                    {routeData ? `${routeData.distance_m}m via ${routeData.profile_display}` : "Select origin & destination"}
                  </CardDescription>
                </div>
                <Route className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="relative space-y-3 pb-6 pt-0">
              {loading && <p className="text-sm text-muted-foreground animate-pulse">Computing route…</p>}
              {error && <p className="text-sm text-red-500">Error: {error}</p>}
              {routeData && !loading && (
                <>
                  <p className="text-[0.875rem] leading-snug tracking-tight text-foreground/90 md:text-[0.894rem]">
                    This route was selected <span className="font-semibold text-primary">because</span> it:
                  </p>
                  <p className="text-[0.875rem] leading-relaxed text-foreground/90">
                    {routeData.explanation}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Accessibility score */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle id={scoringId} className="font-semibold text-base">
                Accessibility score
              </CardTitle>
              <CardDescription>
                {routeData ? "Live composite from routing engine" : "Waiting for route…"}
              </CardDescription>
            </CardHeader>
            <CardContent aria-labelledby={scoringId}>
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <span className="font-semibold text-3xl tabular-nums tracking-tight">
                  {routeData ? overallScore : "—"}
                </span>
                {routeData && (
                  <Badge variant="secondary" className="font-medium">
                    {overallScore >= 80 ? "Excellent" : overallScore >= 60 ? "Good" : overallScore >= 40 ? "Fair" : "Poor"}
                  </Badge>
                )}
              </div>
              <Progress value={routeData ? overallScore : 0} />

              {/* Score breakdown */}
              {routeData && (
                <div className="mt-4 space-y-2.5">
                  {Object.entries(SCORE_LABELS).map(([key, label]) => {
                    const val = routeData.scores[key as keyof typeof routeData.scores] ?? 0;
                    const pct = Math.round(val * 100);
                    return (
                      <div key={key} className="flex items-center gap-3 text-sm">
                        <span className="w-20 text-muted-foreground text-xs">{label}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="w-8 text-right tabular-nums text-xs font-medium">{pct}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-auto hidden pt-3 text-center text-muted-foreground text-xs lg:block">
            {routeData
              ? `Graph: ${routeData.path.length} nodes · ${routeData.distance_m}m`
              : "Click the map to start routing"}
          </div>
        </aside>

        <section className="relative flex min-h-[min(560px,calc(100vh-340px))] flex-1 flex-col gap-0 bg-[#faf8fc] p-4 md:p-6 lg:overflow-hidden lg:p-8 dark:bg-background/95">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end px-4 pt-6 md:px-8">
            <div className="pointer-events-auto rounded-2xl border border-border/65 bg-background/78 p-3.5 shadow-[0_20px_52px_-32px_rgba(15,24,71,0.42)] backdrop-blur-xl dark:bg-background/72 dark:shadow-black/65">
              <p className="mb-3 font-semibold font-mono text-muted-foreground text-[10px] uppercase tracking-[0.22em]">
                Map overlays
              </p>
              <div className="grid gap-2.5">
                <LayerRow checked={layers.route} onCheckedChange={(c) => setLayers((s) => ({ ...s, route: c }))} label="Route trace" description="Computed accessibility path" colorChip="border-primary/85 bg-primary" />
                <LayerRow checked={layers.heatmap} onCheckedChange={(c) => setLayers((s) => ({ ...s, heatmap: c }))} label="Heatmap" description="Accessibility score overlay" colorChip="border-purple-700 bg-purple-400" />
                <LayerRow checked={layers.obstacles} onCheckedChange={(c) => setLayers((s) => ({ ...s, obstacles: c }))} label="Transit stops" description="Unitrans bus stops" colorChip="border-amber-700 bg-amber-400" />
                <LayerRow checked={layers.dangerZones} onCheckedChange={(c) => setLayers((s) => ({ ...s, dangerZones: c }))} label="Danger zones" description="High-noise crossings" colorChip="border-red-700 bg-red-400" />
              </div>
            </div>
          </div>

          <MapView
            layers={layers}
            routeGeoJSON={routeData?.geojson ?? null}
            heatmapPoints={heatmapPoints}
            transitStops={transitStops}
            originLatLon={origin}
            destLatLon={destination}
            onMapClick={handleMapClick}
          />

          <div className="mt-4 rounded-2xl border border-border/60 bg-card/92 px-4 py-3.5 backdrop-blur-sm md:px-5 shadow-sm shadow-black/[0.04] dark:bg-card dark:shadow-none">
            <div className="flex flex-wrap items-center gap-3 md:justify-between">
              <div className="flex flex-wrap gap-2">
                <LegendSwatch chip="border-primary/85 bg-primary" label="Route" />
                <LegendSwatch chip="border-emerald-600 bg-emerald-500/65" label="Good" />
                <LegendSwatch chip="border-amber-600 bg-amber-400/90" label="Fair" />
                <LegendSwatch chip="border-red-600 bg-red-500/65" label="Poor" />
              </div>
              <p className="text-muted-foreground text-xs md:text-sm">
                Click map to set {clickMode === "origin" ? "origin" : "destination"} · Pan & zoom enabled
              </p>
            </div>
          </div>
        </section>
      </main>

      <section className="border-border/80 border-t bg-white px-4 py-7 dark:border-border md:px-8 dark:bg-background">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-5 lg:flex-row">
          <Card className="flex-1 border-dashed shadow-sm shadow-black/[0.03] dark:shadow-black/35">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="font-semibold text-base">Street image upload</CardTitle>
                  <CardDescription>Gemini would score curb geometry, tactile strips, glare, pinch points.</CardDescription>
                </div>
                <Badge variant="outline" className="gap-1">
                  <Camera className="size-3 opacity-70" aria-hidden /> Multimodal
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <Tabs defaultValue="sidewalk" className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                  <TabsTrigger value="sidewalk">Sidewalk</TabsTrigger>
                  <TabsTrigger value="entrance">Entrance</TabsTrigger>
                  <TabsTrigger value="crosswalk">Crosswalk</TabsTrigger>
                  <TabsTrigger value="hallway">Hallway</TabsTrigger>
                </TabsList>
                {(["sidewalk", "entrance", "crosswalk", "hallway"] as const).map((scene) => (
                  <TabsContent key={scene} value={scene} className="pt-4">
                    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/65 bg-muted/15 p-6 text-center backdrop-blur-[2px] md:min-h-[220px]">
                      <Upload className="size-9 text-muted-foreground/70" aria-hidden />
                      <div className="space-y-1">
                        <p className="font-medium text-base">Drag & drop a {scene} photo</p>
                        <p className="mx-auto max-w-md text-muted-foreground text-sm">Gemini CV analysis coming soon.</p>
                      </div>
                      <Button type="button" variant="secondary" disabled>Choose file…</Button>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
              <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <Label className="flex cursor-pointer items-start gap-3 text-left text-muted-foreground text-sm">
                  <Checkbox checked={consentGeminiTerms} onCheckedChange={(v) => setConsentGeminiTerms(v === true)} className="mt-1" />
                  <span>
                    <span className="font-semibold text-foreground">Responsible use flag</span> — confirm rights to imagery.
                  </span>
                </Label>
                <Button type="button" className="shrink-0 gap-2" disabled>
                  <Sparkles className="size-4" aria-hidden />
                  Run Gemini inspection
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="w-full lg:max-w-md xl:max-w-lg">
            <CardHeader className="pb-2">
              <CardTitle className="font-semibold text-base">Route analysis</CardTitle>
              <CardDescription>{routeData ? "Live route data" : "Compute a route to see analysis"}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pb-6">
              {routeData ? (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-4 py-3">
                    <span className="font-semibold text-sm">{routeData.profile_display} route</span>
                    <Badge className="shrink-0 bg-primary">{overallScore} / 100</Badge>
                  </div>
                  <div>
                    <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">Score breakdown</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed">
                      {Object.entries(SCORE_LABELS).map(([key, label]) => {
                        const val = routeData.scores[key as keyof typeof routeData.scores] ?? 0;
                        return (
                          <li key={key} className="flex gap-2">
                            <Sparkles className="mt-0.5 size-3.5 shrink-0 opacity-65" aria-hidden />
                            <span><span className="font-medium">{label}: </span>{Math.round(val * 100)}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Route explanation</p>
                    <p className="text-sm leading-relaxed">{routeData.explanation}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Route stats</p>
                    <ul className="list-disc space-y-1.5 ps-5 text-sm">
                      <li>Distance: {routeData.distance_m}m</li>
                      <li>Path nodes: {routeData.path.length}</li>
                      <li>Profile: {routeData.profile_display}</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-xs leading-relaxed">
                  Click on the map to set an origin and destination, then a route will be computed and analyzed here.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-border/80 border-t bg-white px-4 py-5 font-mono text-muted-foreground text-[11px] backdrop-blur-sm dark:bg-card/40 md:px-8">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p>AccessMap AI — Next.js 15 · FastAPI · NetworkX · OSM · Open-Meteo</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">OSS tiles</Badge>
            <Badge variant="secondary">Privacy-first</Badge>
            <Badge variant="secondary">19.7K nodes</Badge>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LegendSwatch({ chip, label }: { chip: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs">
      <span className={`inline-block size-3 rounded-[3px] border ${chip}`} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

function LayerRow({ label, description, colorChip, checked, onCheckedChange }: {
  label: string; description: string; colorChip: string;
  checked: boolean; onCheckedChange: (next: boolean) => void;
}) {
  const labelId = useId();
  const descId = useId();
  return (
    <div className="flex items-center gap-3">
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={labelId} aria-describedby={descId} />
      <div className="min-w-0 flex flex-1 items-start gap-2">
        <span className={`mt-2 inline-block size-2.5 shrink-0 rounded-[2px] border ${colorChip}`} aria-hidden />
        <span className="min-w-0">
          <p id={labelId} className="font-medium leading-tight">{label}</p>
          <p id={descId} className="text-muted-foreground text-[11px] leading-snug">{description}</p>
        </span>
      </div>
    </div>
  );
}
