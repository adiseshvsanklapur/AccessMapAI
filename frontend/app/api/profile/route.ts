import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isRoutingProfileId, type UserProfileRow } from "@/lib/profile-types";

type SaveProfileBody = {
  full_name?: string | null;
  routing_profile?: string;
  mobility_notes?: string | null;
  sensory_notes?: string | null;
  additional_needs?: string | null;
  onboarding_completed?: boolean;
};

function toNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as SaveProfileBody;
    const routingProfile = body.routing_profile ?? "wheelchair";
    if (!isRoutingProfileId(routingProfile)) {
      return NextResponse.json({ error: "Invalid routing profile" }, { status: 400 });
    }

    const payload = {
      id: user.id,
      email: user.email ?? null,
      full_name: toNullableText(body.full_name),
      routing_profile: routingProfile,
      mobility_notes: toNullableText(body.mobility_notes),
      sensory_notes: toNullableText(body.sensory_notes),
      additional_needs: toNullableText(body.additional_needs),
      onboarding_completed: Boolean(body.onboarding_completed),
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile: (data as UserProfileRow | null) ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
