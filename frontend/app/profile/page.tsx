"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ACCESS_PROFILE_OPTIONS } from "@/lib/access-profiles";
import { cn } from "@/lib/utils";
import type { RoutingProfileId } from "@/lib/profile-types";
import { useAuth } from "@/components/auth-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export default function ProfilePage() {
  const router = useRouter();
  const {
    configured,
    ready,
    user,
    profile,
    profileFetchError,
    signingOut,
    refreshProfile,
    mergeLocalProfile,
    signOut,
  } = useAuth();
  const [fullName, setFullName] = useState("");
  const [routingProfiles, setRoutingProfiles] = useState<RoutingProfileId[]>(["wheelchair"]);
  const [mobilityNotes, setMobilityNotes] = useState("");
  const [sensoryNotes, setSensoryNotes] = useState("");
  const [additionalNeeds, setAdditionalNeeds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

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
      router.replace("/login?next=/profile");
    }
  }, [ready, configured, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!user) return;
    if (!configured) {
      setError("Supabase is not configured.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: fullName.trim() || null,
        routing_profile: routingProfiles[0] ?? "wheelchair",
        routing_profiles: routingProfiles,
        mobility_notes: mobilityNotes.trim() || null,
        sensory_notes: sensoryNotes.trim() || null,
        additional_needs: additionalNeeds.trim() || null,
        onboarding_completed: profile?.onboarding_completed ?? true,
      };
      await postProfile(payload);
      mergeLocalProfile({
        full_name: payload.full_name,
        email: user.email ?? null,
        routing_profile: payload.routing_profile,
        routing_profiles: routingProfiles,
        mobility_notes: payload.mobility_notes,
        sensory_notes: payload.sensory_notes,
        additional_needs: payload.additional_needs,
        onboarding_completed: payload.onboarding_completed,
      });
      void refreshProfile().catch(() => {});
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  if (!configured) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">
          Configure Supabase in .env.local (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">
          {!ready ? "Loading session…" : "Redirecting to sign in…"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-muted/25 px-4 py-10 md:py-14">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-semibold text-2xl tracking-tight">Profile</h1>
          <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Map
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Accessibility & routing</CardTitle>
            <CardDescription>
              Stored securely in your account. The map uses <strong className="text-foreground">routing profile</strong>{" "}
              for default path weights; notes help future personalization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-6">
              {profileFetchError && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 text-sm dark:text-amber-100">
                  Could not refresh profile from the server ({profileFetchError}). Your last save may still be stored—check
                  Supabase connectivity or try again.
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                Signed in as <span className="font-medium text-foreground">{user.email}</span>
              </p>

              <div className="space-y-2">
                <Label htmlFor="full_name">Name</Label>
                <Input
                  id="full_name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <Label>Routing profiles</Label>
                <p className="text-muted-foreground text-xs">Pick one or more profiles used as default route preferences.</p>
                <div className="space-y-2">
                  {ACCESS_PROFILE_OPTIONS.map(({ value, title, description }) => {
                    const id = `profile-${value}`;
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
                <Label htmlFor="mobility">Mobility & movement</Label>
                <Textarea
                  id="mobility"
                  value={mobilityNotes}
                  onChange={(e) => setMobilityNotes(e.target.value)}
                  rows={3}
                  className="resize-y min-h-[72px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sensory">Sensory & environment</Label>
                <Textarea
                  id="sensory"
                  value={sensoryNotes}
                  onChange={(e) => setSensoryNotes(e.target.value)}
                  rows={3}
                  className="resize-y min-h-[72px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="additional">Other needs</Label>
                <Textarea
                  id="additional"
                  value={additionalNeeds}
                  onChange={(e) => setAdditionalNeeds(e.target.value)}
                  rows={2}
                  className="resize-y min-h-[56px]"
                />
              </div>

              {error && <p className="text-destructive text-sm">{error}</p>}
              {saved && <p className="text-emerald-600 text-sm dark:text-emerald-400">Saved.</p>}

              <Button type="submit" disabled={saving || signingOut}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>

            <Separator className="my-8" />

            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={signingOut}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                signOut();
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
