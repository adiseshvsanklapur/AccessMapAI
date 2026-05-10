/**
 * Human-readable labels for hazard types and routing profiles (stored as slugs in API/DB).
 */

const HAZARD_TYPE_LABELS: Record<string, string> = {
  construction: "Construction / work zone",
  scooter: "Improperly parked scooter",
  broken_ramp: "Broken or missing curb ramp",
  surface_damage: "Severe surface damage",
  other: "Other obstruction",
  obstruction: "Obstruction",
  surface: "Surface issue",
};

const PROFILE_LABELS: Record<string, string> = {
  wheelchair: "Wheelchair",
  blind: "Blind / low vision",
  elderly: "Elderly",
  neurodivergent: "Neurodivergent",
  temporary_injury: "Temporary injury",
};

function humanizeSlug(raw: string): string {
  const s = raw.trim().replace(/_/g, " ").replace(/\s+/g, " ");
  if (!s) return raw;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map hazard `type` from API / Supabase / Gemini to a short title for UI. */
export function formatHazardType(type: string): string {
  const key = type.trim().toLowerCase();
  if (HAZARD_TYPE_LABELS[key]) return HAZARD_TYPE_LABELS[key];
  return humanizeSlug(type);
}

/** Profile slugs as shown in “Affects: …” and forms. */
export function formatAffectedProfile(slug: string): string {
  const key = slug.trim().toLowerCase();
  if (PROFILE_LABELS[key]) return PROFILE_LABELS[key];
  return humanizeSlug(slug);
}

export function formatAffectedProfilesList(profiles: string[]): string {
  return profiles.map(formatAffectedProfile).join(", ");
}

export function formatSeverity(severity: string): string {
  const s = severity.trim().toLowerCase();
  if (s === "low" || s === "medium" || s === "high") {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return humanizeSlug(severity);
}
