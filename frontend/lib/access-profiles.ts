import type { RoutingProfileId } from "@/lib/profile-types";

/** Shared labels for routing profiles (matches backend `routing/profiles.py`). */
export const ACCESS_PROFILE_OPTIONS: {
  value: RoutingProfileId;
  title: string;
  description: string;
}[] = [
  {
    value: "wheelchair",
    title: "Wheelchair",
    description: "Ramps & slope constraints",
  },
  {
    value: "blind",
    title: "Blind / low vision",
    description: "Tactile cues & crossings",
  },
  {
    value: "elderly",
    title: "Elderly",
    description: "Rest stops & glare",
  },
  {
    value: "neurodivergent",
    title: "Neurodivergent",
    description: "Noise & sensory load",
  },
  {
    value: "temporary_injury",
    title: "Temporary injury",
    description: "Shorter distances",
  },
];
