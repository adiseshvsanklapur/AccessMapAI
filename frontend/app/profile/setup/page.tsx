"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ACCESS_PROFILE_OPTIONS } from "@/lib/access-profiles";
import type { RoutingProfileId } from "@/lib/profile-types";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ProfileSetupPage() {
  const router = useRouter();
  const { configured, ready, user, profile, refreshProfile, mergeLocalProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [routingProfiles, setRoutingProfiles] = useState<RoutingProfileId[]>(["wheelchair"]);
  const [mobilityNotes, setMobilityNotes] = useState("");
  const [sensoryNotes, setSensoryNotes] = useState("");
  const [additionalNeeds, setAdditionalNeeds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);

  async function postProfile(body: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not save profile");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  useEffect(() => {
    if (!ready || !user) return;
    if (profile) {
      setFullName(profile.full_name ?? "");
      setRoutingProfiles(profile.routing_profiles?.length ? profile.routing_profiles : [profile.routing_profile]);
      setMobilityNotes(profile.mobility_notes ?? "");
      setSensoryNotes(profile.sensory_notes ?? "");
      setAdditionalNeeds(profile.additional_needs ?? "");
    }
  }, [ready, user, profile]);

  useEffect(() => {
    if (ready && configured && !user) {
      router.replace("/login?next=/profile/setup");
    }
  }, [ready, configured, user, router]);

  function goHomeAfterSave() {
    // Full navigation avoids a race: AuthProvider's onboarding gate still has stale
    // `profile` until the next render, and would router.replace("/profile/setup")
    // if we only client-navigate with router.push("/") before state catches up.
    window.location.assign("/");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) {
      setError("You are not signed in. Open Sign in and try again.");
      return;
    }
    if (!configured) {
      setError("Supabase is not configured.");
      return;
    }
    setSaving(true);
    try {
      await postProfile({
        full_name: fullName.trim() || null,
        routing_profile: routingProfiles[0] ?? "wheelchair",
        routing_profiles: routingProfiles,
        mobility_notes: mobilityNotes.trim() || null,
        sensory_notes: sensoryNotes.trim() || null,
        additional_needs: additionalNeeds.trim() || null,
        onboarding_completed: true,
      });
      mergeLocalProfile({
        email: user.email ?? null,
        full_name: fullName.trim() || null,
        routing_profile: routingProfiles[0] ?? "wheelchair",
        routing_profiles: routingProfiles,
        mobility_notes: mobilityNotes.trim() || null,
        sensory_notes: sensoryNotes.trim() || null,
        additional_needs: additionalNeeds.trim() || null,
        onboarding_completed: true,
      });
      void refreshProfile().catch(() => {});
      goHomeAfterSave();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  async function onSkipDefaults() {
    setError(null);
    if (!user) {
      setError("You are not signed in. Open Sign in and try again.");
      return;
    }
    if (!configured) {
      setError("Supabase is not configured.");
      return;
    }
    setSkipping(true);
    try {
      await postProfile({
        routing_profile: routingProfiles[0] ?? "wheelchair",
        routing_profiles: routingProfiles,
        onboarding_completed: true,
      });
      mergeLocalProfile({
        email: user.email ?? null,
        routing_profile: routingProfiles[0] ?? "wheelchair",
        routing_profiles: routingProfiles,
        onboarding_completed: true,
      });
      void refreshProfile().catch(() => {});
      goHomeAfterSave();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSkipping(false);
    }
  }

  if (!ready || !configured) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">
          {!configured ? "Configure Supabase in .env.local to use accounts." : "Loading…"}
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-muted/25 px-4 py-10 md:py-14">
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Your accessibility profile</CardTitle>
            <CardDescription>
              This drives default route weights (slopes, noise, crossings, etc.). You can change it anytime on your
              profile page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="full_name">Name (optional)</Label>
                <Input
                  id="full_name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="How we should address you"
                />
              </div>

              <div className="space-y-3">
                <Label>Routing profiles</Label>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Pick one or more profiles; the map will use all selected preferences.
                </p>
                <div className="space-y-2">
                  {ACCESS_PROFILE_OPTIONS.map(({ value, title, description }) => {
                    const id = `setup-${value}`;
                    const checked = routingProfiles.includes(value);
                    return (
                      <Label
                        key={value}
                        htmlFor={id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 hover:bg-muted/40"
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(next) => {
                            if (next === true) {
                              setRoutingProfiles((prev) => (prev.includes(value) ? prev : [...prev, value]));
                            } else {
                              setRoutingProfiles((prev) => (prev.length > 1 ? prev.filter((p) => p !== value) : prev));
                            }
                          }}
                          className="mt-1 shrink-0"
                        />
                        <div>
                          <span className="font-medium text-sm">{title}</span>
                          <p className="text-muted-foreground text-xs">{description}</p>
                        </div>
                      </Label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobility">Mobility & movement (optional)</Label>
                <Textarea
                  id="mobility"
                  value={mobilityNotes}
                  onChange={(e) => setMobilityNotes(e.target.value)}
                  placeholder="e.g. manual wheelchair, cane user, need frequent breaks…"
                  rows={3}
                  className="resize-y min-h-[72px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sensory">Sensory & environment (optional)</Label>
                <Textarea
                  id="sensory"
                  value={sensoryNotes}
                  onChange={(e) => setSensoryNotes(e.target.value)}
                  placeholder="e.g. sensitive to loud traffic, prefer daylight travel…"
                  rows={3}
                  className="resize-y min-h-[72px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="additional">Other needs (optional)</Label>
                <Textarea
                  id="additional"
                  value={additionalNeeds}
                  onChange={(e) => setAdditionalNeeds(e.target.value)}
                  placeholder="Anything else we should consider for personalization."
                  rows={2}
                  className="resize-y min-h-[56px]"
                />
              </div>

              {error && <p className="text-destructive text-sm">{error}</p>}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" disabled={saving || skipping} onClick={() => void onSkipDefaults()}>
                  {skipping ? "Continuing…" : "Use defaults only"}
                </Button>
                <Button type="submit" disabled={saving || skipping}>
                  {saving ? "Saving…" : "Save and continue"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
