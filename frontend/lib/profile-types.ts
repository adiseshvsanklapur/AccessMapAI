/** Matches backend routing profile names in `routing/profiles.py`. */
export const ROUTING_PROFILE_IDS = [
  "wheelchair",
  "blind",
  "elderly",
  "neurodivergent",
  "temporary_injury",
] as const;

export type RoutingProfileId = (typeof ROUTING_PROFILE_IDS)[number];

export function isRoutingProfileId(v: string): v is RoutingProfileId {
  return (ROUTING_PROFILE_IDS as readonly string[]).includes(v);
}

export function normalizeRoutingProfiles(input: unknown): RoutingProfileId[] {
  if (!Array.isArray(input)) return [];
  const values = input.filter((v): v is RoutingProfileId => typeof v === "string" && isRoutingProfileId(v));
  return Array.from(new Set(values));
}

/** Row shape for `public.profiles` in Supabase. */
export type UserProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  routing_profile: RoutingProfileId;
  routing_profiles: RoutingProfileId[];
  mobility_notes: string | null;
  sensory_notes: string | null;
  additional_needs: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};
