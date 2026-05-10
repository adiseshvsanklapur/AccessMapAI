"""
profiles.py — Accessibility user profiles with edge cost functions.

Each profile defines how different environmental factors (slope, surface,
noise, crowd, lighting, stairs, width) affect route preference.

Higher weight = more penalty for bad conditions on that factor.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AccessibilityProfile:
    """Defines how a user experiences accessibility factors."""
    name: str
    display_name: str
    description: str

    # Weights (0-1): how much each factor matters to this user
    # Higher = more impactful on route cost
    slope_weight: float = 0.5
    surface_weight: float = 0.5
    noise_weight: float = 0.3
    crowd_weight: float = 0.3
    lighting_weight: float = 0.3
    stairs_penalty: float = 1.0       # multiplier for stair edges
    width_min: Optional[float] = None  # minimum path width (meters)
    kerb_weight: float = 0.3
    crossing_signal_weight: float = 0.0  # preference for signalized crossings
    tactile_weight: float = 0.0          # preference for tactile paving routes
    sidewalk_weight: float = 0.0         # preference for explicit sidewalks

    # Hard constraints
    avoid_stairs: bool = False
    avoid_unpaved: bool = False
    requires_width: Optional[float] = None  # minimum width in meters

    # Max acceptable slope (percentage)
    max_slope: Optional[float] = None


# ---------------------------------------------------------------------------
# Pre-defined profiles
# ---------------------------------------------------------------------------
PROFILES = {
    "wheelchair": AccessibilityProfile(
        name="wheelchair",
        display_name="Wheelchair User",
        description="Optimizes for smooth surfaces, gentle slopes, curb ramps, and avoids stairs.",
        slope_weight=0.95,
        surface_weight=0.9,
        noise_weight=0.1,
        crowd_weight=0.4,
        lighting_weight=0.3,
        stairs_penalty=100.0,  # effectively impassable
        kerb_weight=0.9,
        avoid_stairs=True,
        avoid_unpaved=True,
        requires_width=1.2,  # ADA minimum 36 inches = ~0.9m, prefer wider
        max_slope=8.33,  # ADA max ramp slope
        tactile_weight=0.5,  # Wheelchair users benefit from properly installed tactile paving (implies curb ramps and ADA compliance)
        sidewalk_weight=0.8, # Strong preference for explicit sidewalks over general paths
    ),

    "blind": AccessibilityProfile(
        name="blind",
        display_name="Blind / Low Vision",
        description="Prioritizes tactile paving, signalized crossings, well-lit paths, consistent surfaces, and avoids noisy areas.",
        slope_weight=0.3,
        surface_weight=0.7,
        noise_weight=0.8,  # noise interferes with echolocation / orientation
        crowd_weight=0.7,  # crowds make navigation harder
        lighting_weight=0.5,  # less relevant but still matters for low vision
        stairs_penalty=2.0,
        kerb_weight=0.8,  # tactile paving at kerbs
        crossing_signal_weight=0.85,  # strongly prefer signalized crossings
        tactile_weight=0.8,  # strongly prefer tactile paving routes
        avoid_stairs=False,
        avoid_unpaved=True,
    ),

    "elderly": AccessibilityProfile(
        name="elderly",
        display_name="Elderly / Mobility Limited",
        description="Prefers gentle slopes, well-maintained paths, good lighting, and lower crowds.",
        slope_weight=0.8,
        surface_weight=0.7,
        noise_weight=0.3,
        crowd_weight=0.5,
        lighting_weight=0.7,
        stairs_penalty=5.0,
        kerb_weight=0.6,
        avoid_stairs=False,
        max_slope=10.0,
    ),

    "neurodivergent": AccessibilityProfile(
        name="neurodivergent",
        display_name="Neurodivergent",
        description="Minimizes sensory overload: avoids noisy areas, crowds, and busy intersections.",
        slope_weight=0.2,
        surface_weight=0.2,
        noise_weight=0.95,  # noise is the primary concern
        crowd_weight=0.95,  # crowds cause sensory overload
        lighting_weight=0.4,
        stairs_penalty=1.5,
        kerb_weight=0.2,
    ),

    "temporary_injury": AccessibilityProfile(
        name="temporary_injury",
        display_name="Temporary Injury (Crutches/Boot)",
        description="Avoids stairs and steep slopes, prefers smooth surfaces.",
        slope_weight=0.7,
        surface_weight=0.6,
        noise_weight=0.1,
        crowd_weight=0.3,
        lighting_weight=0.4,
        stairs_penalty=10.0,
        kerb_weight=0.5,
        avoid_stairs=True,
        max_slope=12.0,
    ),

    "default": AccessibilityProfile(
        name="default",
        display_name="General Pedestrian",
        description="Balanced routing considering all accessibility factors.",
        slope_weight=0.4,
        surface_weight=0.4,
        noise_weight=0.3,
        crowd_weight=0.3,
        lighting_weight=0.3,
        stairs_penalty=1.5,
        kerb_weight=0.3,
    ),
}


def get_profile(name: str) -> AccessibilityProfile:
    """Get an accessibility profile by name."""
    return PROFILES.get(name, PROFILES["default"])


def get_combined_profile(names: list[str]) -> AccessibilityProfile:
    """Combine multiple accessibility profiles into a single composite profile."""
    if not names:
        return PROFILES["default"]
        
    profiles = [get_profile(name) for name in names]
    
    if len(profiles) == 1:
        return profiles[0]

    # Merge logic
    name = "combined_" + "_".join(names)
    display_name = " + ".join(p.display_name for p in profiles)
    description = "Combined profile: " + ", ".join(p.name for p in profiles)

    combined = AccessibilityProfile(
        name=name,
        display_name=display_name,
        description=description,
        slope_weight=max(p.slope_weight for p in profiles),
        surface_weight=max(p.surface_weight for p in profiles),
        noise_weight=max(p.noise_weight for p in profiles),
        crowd_weight=max(p.crowd_weight for p in profiles),
        lighting_weight=max(p.lighting_weight for p in profiles),
        stairs_penalty=max(p.stairs_penalty for p in profiles),
        kerb_weight=max(p.kerb_weight for p in profiles),
        crossing_signal_weight=max(p.crossing_signal_weight for p in profiles),
        tactile_weight=max(p.tactile_weight for p in profiles),
        sidewalk_weight=max(p.sidewalk_weight for p in profiles),
        avoid_stairs=any(p.avoid_stairs for p in profiles),
        avoid_unpaved=any(p.avoid_unpaved for p in profiles),
    )

    # Merge width: need the maximum required width
    widths = [p.requires_width for p in profiles if p.requires_width is not None]
    if widths:
        combined.requires_width = max(widths)

    # Merge slope: need the minimum max_slope (most restrictive)
    slopes = [p.max_slope for p in profiles if p.max_slope is not None]
    if slopes:
        combined.max_slope = min(slopes)

    return combined


def list_profiles() -> list[dict]:
    """Return all profiles as a list of dicts for API response."""
    return [
        {
            "name": p.name,
            "display_name": p.display_name,
            "description": p.description,
        }
        for p in PROFILES.values()
    ]
