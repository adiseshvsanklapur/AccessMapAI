"use client";

import {
  Accessibility, AlertTriangle, Bus, Camera, CircleDot, Ear, Flag, Footprints,
  Info, LogIn, MapPin, MapPinned, Moon, MoveHorizontal, Navigation, Route,
  Sparkles, Upload, User, UserPlus, UserRound, Users, X,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useCallback, useEffect, useId, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { MapView } from "@/components/access-map/map-view";
import type { MapLayerToggle } from "@/components/access-map/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ACCESS_PROFILE_OPTIONS } from "@/lib/access-profiles";
import {
  fetchRoute, fetchHeatmap, fetchTransit, fetchAccessibilityPoints, analyzeSidewalkImage,
  fetchHazards, reportHazard,
  type RouteResponse, type HeatmapPoint, type TransitStop, type AccessibilityPoint, type SidewalkAnalysisResult,
  type HazardReport,
} from "@/lib/api";
import type { RoutingProfileId } from "@/lib/profile-types";
import { cn } from "@/lib/utils";
import { formatAffectedProfile, formatHazardType, formatSeverity } from "@/lib/hazard-labels";

const PROFILE_ICONS: Record<
  RoutingProfileId,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  wheelchair: Accessibility,
  blind: Moon,
  elderly: Footprints,
  neurodivergent: Ear,
  temporary_injury: UserRound,
};

const defaultLayers: MapLayerToggle = { route: true, heatmap: true, obstacles: true, accessibilityPoints: true, hazards: true };

// Start empty: user picks origin/destination explicitly.
const DEFAULT_ORIGIN: [number, number] | null = null;
const DEFAULT_DEST: [number, number] | null = null;

const SCORE_LABELS: Record<string, string> = {
  slope: "Slope", surface: "Surface", noise: "Noise", crowd: "Crowd",
  lighting: "Lighting", kerb: "Curb Ramps",
  crossing_signals: "Audible Crossings", tactile: "Tactile Paving",
};

type ClickMode = "origin" | "dest" | "hazard";

export function AccessDashboard() {
  const scoringId = useId();
  const {
    configured: supabaseReady,
    ready: authReady,
    user,
    profile: accountProfile,
    signingOut,
    signOut,
  } = useAuth();
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [syncedRoutingFromAccount, setSyncedRoutingFromAccount] = useState(false);
  const [layers, setLayers] = useState<MapLayerToggle>(defaultLayers);
  const [consentGeminiTerms, setConsentGeminiTerms] = useState(true);

  // Live data state
  const [origin, setOrigin] = useState<[number, number] | null>(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState<[number, number] | null>(DEFAULT_DEST);
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [accessibilityPoints, setAccessibilityPoints] = useState<AccessibilityPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendReady, setBackendReady] = useState(false);
  const [clickMode, setClickMode] = useState<ClickMode>("origin");

  // Hazard reporting state
  const [activeHazards, setActiveHazards] = useState<HazardReport[]>([]);
  const [draftHazardLatLon, setDraftHazardLatLon] = useState<[number, number] | null>(null);
  const [hazardType, setHazardType] = useState("construction");
  const [hazardDesc, setHazardDesc] = useState("");
  const [hazardProfiles, setHazardProfiles] = useState<string[]>(["wheelchair", "blind"]);
  const [submittingHazard, setSubmittingHazard] = useState(false);

  // Gemini state
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiResult, setGeminiResult] = useState<SidewalkAnalysisResult | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !supabaseReady || !accountProfile?.onboarding_completed) return;
    if (syncedRoutingFromAccount) return;
    const savedProfiles = accountProfile.routing_profiles?.length
      ? accountProfile.routing_profiles
      : [accountProfile.routing_profile];
    setSelectedProfiles(savedProfiles);
    setSyncedRoutingFromAccount(true);
  }, [authReady, supabaseReady, accountProfile, syncedRoutingFromAccount]);

  useEffect(() => {
    if (!user) setSyncedRoutingFromAccount(false);
  }, [user]);

  // Fetch route when origin, destination, or profile changes
  useEffect(() => {
    if (!origin || !destination || selectedProfiles.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRoute(origin[0], origin[1], destination[0], destination[1], selectedProfiles)
      .then((data) => {
        if (!cancelled) {
          setRouteData(data);
          setBackendReady(true);
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [origin, destination, selectedProfiles]);

  // Fetch heatmap & transit on mount
  useEffect(() => {
    fetchHeatmap("crowd_score")
      .then((r) => {
        setHeatmapPoints(r.points);
        setBackendReady(true);
      })
      .catch(() => {});
    fetchTransit()
      .then((r) => {
        setTransitStops(r.stops);
        setBackendReady(true);
      })
      .catch(() => {});
    fetchAccessibilityPoints()
      .then((points) => {
        setAccessibilityPoints(points);
        setBackendReady(true);
      })
      .catch(() => {});
    fetchHazards()
      .then((hazards) => {
        setActiveHazards(hazards);
        setBackendReady(true);
      })
      .catch(() => {});
  }, []);

  // Map click handler — routed by current click mode
  const handleMapClick = useCallback((lat: number, lon: number) => {
    if (clickMode === "origin") {
      setOrigin([lat, lon]);
      setClickMode("dest");
    } else if (clickMode === "dest") {
      setDestination([lat, lon]);
      setClickMode("origin");
    } else if (clickMode === "hazard") {
      setDraftHazardLatLon([lat, lon]);
    }
  }, [clickMode]);

  // Handle Gemini upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !consentGeminiTerms) return;

    setGeminiLoading(true);
    setGeminiResult(null);
    setGeminiError(null);

    try {
      const result = await analyzeSidewalkImage(file);
      setGeminiResult(result);
    } catch (err: unknown) {
      setGeminiError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setGeminiLoading(false);
    }
  };

  const overallScore = routeData ? Math.round(routeData.scores.overall * 100) : 0;
  const grade = overallScore >= 80 ? "Excellent" : overallScore >= 60 ? "Good" : overallScore >= 40 ? "Fair" : "Poor";
  const gradeColor = overallScore >= 80 ? "#10b981" : overallScore >= 60 ? "#22c55e" : overallScore >= 40 ? "#f59e0b" : "#ef4444";

  // Cancel hazard reporting completely (clears draft pin AND exits hazard mode)
  const cancelHazard = () => {
    setDraftHazardLatLon(null);
    setClickMode("origin");
    setHazardDesc("");
  };

  const enterHazardMode = () => {
    setClickMode("hazard");
    setDraftHazardLatLon(null);
  };

  const submitHazard = async () => {
    if (!draftHazardLatLon) return;
    setSubmittingHazard(true);
    try {
      await reportHazard({
        lat: draftHazardLatLon[0],
        lon: draftHazardLatLon[1],
        type: hazardType,
        description: hazardDesc,
        affected_profiles: hazardProfiles,
      });
      const updated = await fetchHazards();
      setActiveHazards(updated);
      cancelHazard();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingHazard(false);
    }
  };

  // Form rendered inside the Mapbox Popup — anchored at the dropped pin
  const hazardFormPopup = draftHazardLatLon ? (
    <div className="w-[min(360px,80vw)] rounded-2xl bg-card p-4 text-foreground">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 font-semibold text-sm">
            <AlertTriangle className="size-4 text-amber-400" /> Report a hazard
          </h4>
          <p className="mt-0.5 font-mono text-muted-foreground text-[11px]">
            {draftHazardLatLon[0].toFixed(4)}, {draftHazardLatLon[1].toFixed(4)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={cancelHazard}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Hazard type</Label>
          <select
            className="w-full rounded-md border border-border/70 bg-background p-2 text-sm focus:border-primary focus:outline-none"
            value={hazardType}
            onChange={(e) => setHazardType(e.target.value)}
          >
            <option value="construction">Construction / work zone</option>
            <option value="scooter">Improperly parked scooter</option>
            <option value="broken_ramp">Broken or missing curb ramp</option>
            <option value="surface_damage">Severe surface damage</option>
            <option value="other">Other obstruction</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <input
            type="text"
            className="w-full rounded-md border border-border/70 bg-background p-2 text-sm focus:border-primary focus:outline-none"
            placeholder="e.g., Sidewalk completely blocked…"
            value={hazardDesc}
            onChange={(e) => setHazardDesc(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Affects profiles</Label>
          <div className="flex flex-wrap gap-1.5">
            {(["wheelchair", "blind", "elderly", "neurodivergent", "temporary_injury"] as const).map((p) => {
              const active = hazardProfiles.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    if (active) setHazardProfiles(hazardProfiles.filter((x) => x !== p));
                    else setHazardProfiles([...hazardProfiles, p]);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/15 text-foreground"
                      : "border-border/70 bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {formatAffectedProfile(p)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={cancelHazard}>Cancel</Button>
          <Button size="sm" disabled={submittingHazard} onClick={submitHazard}>
            <Flag className="mr-1.5 size-3.5" />
            {submittingHazard ? "Submitting…" : "Submit hazard"}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 px-4 py-[1.1rem] backdrop-blur-2xl md:px-8">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[0_18px_40px_-24px_rgba(124,92,255,0.55)] ring-1 ring-white/[0.12]">
                <MapPinned className="relative z-10 size-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]" aria-hidden />
                <span aria-hidden className="pointer-events-none absolute inset-x-[-40%] top-[-60%] h-[140%] bg-white/10 blur-xl" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground text-lg tracking-tighter">
                  AccessMap AI
                  <Badge variant="secondary" className="ml-2 align-middle font-mono text-[10px] tracking-wide uppercase">
                    Live
                  </Badge>
                </p>
                <p className="text-muted-foreground text-[0.813rem] leading-snug md:max-w-lg">
                  Explainable accessibility routing powered by real OSM data.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {/* Do not gate on authReady — if it never flips true, auth links disappeared entirely */}
            {user ? (
              <>
                <Link
                  href="/profile"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5 inline-flex")}
                >
                  <User className="size-3.5 opacity-80" aria-hidden />
                  Profile
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  type="button"
                  disabled={signingOut}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    signOut();
                  }}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5 inline-flex")}
                >
                  <LogIn className="size-3.5 opacity-90" aria-hidden />
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-8 gap-1.5 inline-flex")}
                >
                  <UserPlus className="size-3.5 opacity-90" aria-hidden />
                  Sign up
                </Link>
              </div>
            )}
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
        <aside className="flex max-h-none w-full flex-col gap-4 border-border/60 border-b bg-background px-4 py-5 lg:max-h-full lg:w-[min(396px,100%)] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-7">
          {/* Profile selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-semibold text-base">Disability profile</CardTitle>
              <CardDescription className="space-y-1">
                <span>Select a profile to remap routing weights.</span>
                {!user && (
                  <span className="block text-[0.8125rem] leading-snug">
                    <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
                      Sign up
                    </Link>
                    {" · "}
                    <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                      Sign in
                    </Link>
                    <span className="text-muted-foreground"> to save your preferences.</span>
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col gap-2.5">
                {ACCESS_PROFILE_OPTIONS.map(({ value, title, description }) => {
                  const Icon = PROFILE_ICONS[value];
                  const id = `profile-${value}`;
                  const isSelected = selectedProfiles.includes(value);
                  return (
                    <Label
                      key={value}
                      htmlFor={id}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 transition-colors ${
                        isSelected
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-muted/40 hover:border-primary/30 hover:bg-muted/70"
                      }`}
                    >
                      <Checkbox
                        id={id}
                        className="mt-1 shrink-0"
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedProfiles([...selectedProfiles, value]);
                          } else {
                            setSelectedProfiles(selectedProfiles.filter((p) => p !== value));
                          }
                        }}
                      />
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
              </div>
              <Separator className="my-4" />
              <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-3.5 font-mono text-muted-foreground text-[11px] leading-relaxed">
                <span className="flex items-start gap-2 font-medium text-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
                  Click the map to set origin (green) then destination (red).
                  Next click sets: <strong className="text-primary">{clickMode === "origin" ? "Origin" : clickMode === "dest" ? "Destination" : "Hazard"}</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Combined route analysis: hero score + explanation + breakdown */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-primary/[0.10] via-card to-card">
            <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/[0.12] blur-3xl" />
            <CardHeader className="relative pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle id={scoringId} className="text-base tracking-tight">Route analysis</CardTitle>
                  <CardDescription>
                    {routeData ? `${routeData.distance_m}m via ${routeData.profile_display}` : "Select origin & destination"}
                  </CardDescription>
                </div>
                <Route className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              </div>
            </CardHeader>
            <CardContent aria-labelledby={scoringId} className="relative space-y-4 pb-6 pt-0">
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-background/80 p-4">
                <ScoreRing value={routeData ? overallScore : 0} color={routeData ? gradeColor : "#3f3a52"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-3xl tabular-nums tracking-tight">
                      {routeData ? overallScore : "—"}
                    </span>
                    <span className="text-muted-foreground text-sm">/ 100</span>
                  </div>
                  {routeData && (
                    <Badge
                      variant="secondary"
                      className="mt-1 font-medium"
                      style={{ backgroundColor: `${gradeColor}1f`, color: gradeColor, borderColor: `${gradeColor}33` }}
                    >
                      {grade}
                    </Badge>
                  )}
                  <p className="mt-2 text-muted-foreground text-xs">
                    {routeData ? "Weighted accessibility score for this route" : "Waiting for route…"}
                  </p>
                </div>
              </div>

              {loading && <p className="text-sm text-muted-foreground animate-pulse">Computing route…</p>}
              {error && <p className="text-sm text-red-400">Error: {error}</p>}
              {routeData && !loading && (
                <div className="rounded-xl border border-primary/15 bg-primary/[0.06] p-3.5">
                  <p className="mb-1.5 font-medium text-primary text-xs uppercase tracking-wider">Why this route</p>
                  <p className="text-[0.875rem] leading-relaxed text-foreground/90">
                    {routeData.explanation}
                  </p>
                </div>
              )}

              {routeData && (
                <div className="space-y-2">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">Breakdown</p>
                  <div className="space-y-2">
                    {Object.entries(SCORE_LABELS).map(([key, label]) => {
                      const val = routeData.scores[key as keyof typeof routeData.scores] ?? 0;
                      const pct = Math.round(val * 100);
                      return (
                        <div key={key} className="flex items-center gap-3 text-sm">
                          <span className="w-24 text-muted-foreground text-xs">{label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
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
                </div>
              )}
            </CardContent>
          </Card>

          {/* Turn-by-turn directions */}
          <Card className="flex flex-col overflow-hidden max-h-[300px]">
            <CardHeader className="pb-3 pt-4 shrink-0 shadow-[0_1px_0_0_var(--border)] z-10">
              <CardTitle className="font-semibold text-base">Directions</CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto p-0 z-0">
              {loading && <div className="p-4 text-sm text-muted-foreground animate-pulse">Computing route…</div>}
              {!loading && !routeData && <div className="p-4 text-sm text-muted-foreground">Waiting for route…</div>}
              {routeData && !loading && routeData.directions && (
                <ul className="divide-y divide-border">
                  {routeData.directions.map((step) => (
                    <li key={step.step} className="p-4 py-3 flex gap-4 hover:bg-muted/40 transition-colors">
                      <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono border border-primary/25">
                        {step.step}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-tight">{step.instruction}</p>
                        <p className="text-xs text-muted-foreground">
                          {step.distance_m > 0 ? `${step.distance_m}m · ` : ""}
                          <span className="capitalize">{step.surface.replace("_", " ")}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="mt-auto hidden pt-3 text-center text-muted-foreground text-xs lg:block">
            {routeData
              ? `Graph: ${routeData.path.length} nodes · ${routeData.distance_m}m`
              : "Click the map to start routing"}
          </div>
        </aside>

        <section className="relative flex min-h-[min(560px,calc(100vh-220px))] flex-1 flex-col gap-0 bg-background p-4 md:p-6 lg:overflow-hidden lg:p-8">
          {/* Smart action toolbar — top of the map */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-start justify-between gap-3 px-4 pt-6 md:px-8">
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-[0_18px_48px_-34px_rgba(0,0,0,0.85)]">
              <ModePill
                active={clickMode === "origin"}
                onClick={() => setClickMode("origin")}
                icon={<MapPin className="size-3.5" />}
                label="Set origin"
                accent="#22c55e"
              />
              <ModePill
                active={clickMode === "dest"}
                onClick={() => setClickMode("dest")}
                icon={<Navigation className="size-3.5" />}
                label="Set destination"
                accent="#ef4444"
              />
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
              <ModePill
                active={clickMode === "hazard"}
                onClick={() => (clickMode === "hazard" ? cancelHazard() : enterHazardMode())}
                icon={<AlertTriangle className="size-3.5" />}
                label={clickMode === "hazard" ? "Cancel report" : "Report hazard"}
                accent="#f59e0b"
                emphasized
              />
            </div>

            {/* Layers + properly labeled legend */}
            <div className="pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-3.5 shadow-[0_18px_48px_-34px_rgba(0,0,0,0.85)]">
              <p className="mb-3 font-semibold font-mono text-muted-foreground text-[10px] uppercase tracking-[0.22em]">
                Layers · Legend
              </p>
              <div className="grid gap-3">
                <LayerRow
                  checked={layers.route}
                  onCheckedChange={(c) => setLayers((s) => ({ ...s, route: c }))}
                  label="Route"
                  description="Best accessibility path"
                  legend={[{ icon: Route, color: "#7c5cff", label: "Recommended path" }]}
                />
                <LayerRow
                  checked={layers.heatmap}
                  onCheckedChange={(c) => setLayers((s) => ({ ...s, heatmap: c }))}
                  label="Crowd heatmap"
                  description="Time of day × campus hubs"
                  legend={[
                    { icon: Users, color: "#22c55e", label: "Calm" },
                    { icon: Users, color: "#facc15", label: "Moderate" },
                    { icon: Users, color: "#ef4444", label: "Busy" },
                  ]}
                />
                <LayerRow
                  checked={layers.obstacles}
                  onCheckedChange={(c) => setLayers((s) => ({ ...s, obstacles: c }))}
                  label="Transit stops"
                  description="Unitrans wheelchair flag"
                  legend={[
                    { icon: Bus, color: "#10b981", label: "Accessible" },
                    { icon: Bus, color: "#f59e0b", label: "Limited" },
                  ]}
                />
                <LayerRow
                  checked={layers.accessibilityPoints}
                  onCheckedChange={(c) => setLayers((s) => ({ ...s, accessibilityPoints: c }))}
                  label="Accessibility points"
                  description="OSM curbs · crossings · tactile"
                  legend={[
                    { icon: MoveHorizontal, color: "#3b82f6", label: "Crossing" },
                    { icon: Accessibility, color: "#10b981", label: "Curb ramp lowered" },
                    { icon: Accessibility, color: "#ef4444", label: "Curb ramp raised" },
                    { icon: CircleDot, color: "#8b5cf6", label: "Tactile paving" },
                  ]}
                />
                <LayerRow
                  checked={layers.hazards}
                  onCheckedChange={(c) => setLayers((s) => ({ ...s, hazards: c }))}
                  label="User hazards"
                  description="Reports from Supabase"
                  legend={[{ icon: AlertTriangle, color: "#ef4444", label: "Active hazard" }]}
                />
              </div>
            </div>
          </div>

          {/* Mode hint pill — bottom center */}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
            <div
              className={`pointer-events-auto rounded-full border px-4 py-1.5 text-xs font-medium shadow-[0_18px_48px_-34px_rgba(0,0,0,0.85)] ${
                clickMode === "hazard"
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {clickMode === "hazard"
                ? draftHazardLatLon
                  ? "Fill out the form on the map · click another spot to move the pin"
                  : "Click anywhere on the map to drop a hazard pin"
                : `Click the map to set ${clickMode === "origin" ? "origin" : "destination"}`}
            </div>
          </div>

          <MapView
            layers={layers}
            routeGeoJSON={routeData?.geojson ?? null}
            heatmapPoints={heatmapPoints}
            transitStops={transitStops}
            accessibilityPoints={accessibilityPoints}
            hazards={activeHazards}
            draftHazardLatLon={draftHazardLatLon}
            draftHazardPopup={hazardFormPopup}
            onDraftHazardClose={cancelHazard}
            originLatLon={origin}
            destLatLon={destination}
            onMapClick={handleMapClick}
          />
        </section>
      </main>

      <section className="border-t border-border/60 bg-background px-4 py-7 md:px-8">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-5 lg:flex-row">
          <Card className="flex-1 border-dashed">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="font-semibold text-base">Street image upload</CardTitle>
                  <CardDescription>Gemini scores curb geometry, tactile strips, glare, and pinch points.</CardDescription>
                </div>
                <Badge variant="outline" className="gap-1">
                  <Camera className="size-3 opacity-70" aria-hidden /> Multimodal
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              {!geminiResult ? (
                <>
                  <label className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/40 p-6 text-center md:min-h-[220px] hover:bg-muted/70 transition-colors">
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={!consentGeminiTerms || geminiLoading} />
                    {geminiLoading ? (
                      <div className="space-y-3">
                        <Sparkles className="size-9 text-primary animate-pulse mx-auto" aria-hidden />
                        <p className="font-medium text-base text-primary">Analyzing image with Gemini 2.5 Flash…</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="size-9 text-muted-foreground/70" aria-hidden />
                        <div className="space-y-1">
                          <p className="font-medium text-base">Click or drag & drop a photo</p>
                          <p className="mx-auto max-w-md text-muted-foreground text-sm">Requires Responsible Use confirmation below.</p>
                        </div>
                        <Button type="button" variant="secondary" className="pointer-events-none">Choose file…</Button>
                      </>
                    )}
                  </label>
                  {geminiError && <p className="text-sm text-red-400 font-medium">Error: {geminiError}</p>}
                </>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/40">
                    <div>
                      <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1">Overall assessment</p>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-bold tracking-tight">{geminiResult.overall_score}/100</span>
                        <Badge variant={geminiResult.wheelchair_accessible ? "default" : "destructive"}>
                          {geminiResult.wheelchair_accessible ? "Accessible" : "Barriers detected"}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setGeminiResult(null); setGeminiError(null); }}>Analyze another</Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground uppercase mb-1">Surface type</p>
                      <p className="font-medium capitalize">{geminiResult.surface_type}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground uppercase mb-1">Estimated slope</p>
                      <p className="font-medium capitalize">{geminiResult.slope_estimate}</p>
                    </div>
                  </div>

                  {geminiResult.hazards.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Detected hazards</p>
                      <div className="grid gap-2">
                        {geminiResult.hazards.map((hazard, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-destructive/[0.08]">
                            <Badge variant={hazard.severity === "high" ? "destructive" : "secondary"} className="mt-0.5">
                              {formatSeverity(hazard.severity)}
                            </Badge>
                            <div>
                              <p className="text-sm font-medium">{formatHazardType(hazard.type)}</p>
                              <p className="text-sm text-muted-foreground">{hazard.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 rounded-lg bg-primary/[0.08] border border-primary/15">
                    <p className="text-sm leading-relaxed">{geminiResult.explanation}</p>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Label className="flex cursor-pointer items-start gap-3 text-left text-muted-foreground text-sm">
                  <Checkbox checked={consentGeminiTerms} onCheckedChange={(v) => setConsentGeminiTerms(v === true)} className="mt-1" />
                  <span>
                    <span className="font-semibold text-foreground">Responsible use flag</span> — confirm rights to imagery.
                  </span>
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t border-border/60 bg-background px-4 py-5 font-mono text-muted-foreground text-[11px] md:px-8">
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

function ModePill({
  active,
  onClick,
  icon,
  label,
  accent,
  emphasized = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: string;
  emphasized?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? "shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          : emphasized
            ? "text-amber-200 hover:text-amber-100"
            : "text-muted-foreground hover:text-foreground"
      }`}
      style={
        active
          ? { backgroundColor: `${accent}26`, color: accent }
          : undefined
      }
    >
      <span className="flex size-4 items-center justify-center" style={active ? { color: accent } : undefined}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function ScoreRing({ value, color }: { value: number; color: string }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 600ms ease, stroke 300ms ease" }}
        />
      </svg>
    </div>
  );
}

type LegendIcon = ComponentType<SVGProps<SVGSVGElement>>;
type LegendEntry = { icon: LegendIcon; color: string; label: string };

function LayerRow({
  label,
  description,
  legend,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  legend: LegendEntry[];
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const labelId = useId();
  const descId = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch
        className="mt-0.5"
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={labelId}
        aria-describedby={descId}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <p id={labelId} className="font-medium text-sm leading-tight">{label}</p>
          <p id={descId} className="text-muted-foreground text-[11px] leading-snug">{description}</p>
        </div>
        {checked && (
          <ul className="flex flex-col gap-1 pt-1">
            {legend.map((entry, i) => {
              const Icon = entry.icon;
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 text-[11px] leading-tight text-muted-foreground"
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset"
                    style={{
                      backgroundColor: `${entry.color}1f`,
                      color: entry.color,
                      // ring-inset color via box-shadow trick using ring color
                    }}
                    aria-hidden
                  >
                    <Icon className="size-3" strokeWidth={2.25} />
                  </span>
                  <span className="text-foreground/80">{entry.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
