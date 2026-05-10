"""
Gemini-powered explanation for why a computed route fits an accessibility profile.
"""

import asyncio
import json
import os

from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

router = APIRouter()


class DirectionPreview(BaseModel):
    step: int
    instruction: str
    distance_m: float


class RouteExplanationRequest(BaseModel):
    profile: str
    profile_display: str
    distance_m: float
    explanation_baseline: str = Field(
        description="Plain summary from the routing engine (ground truth cues)",
    )
    scores: dict[str, float]
    directions_preview: list[DirectionPreview] = Field(default_factory=list)


class RouteWhyResponse(BaseModel):
    explanation: str = Field(
        description="2–4 short paragraphs, plain language, grounded in the scores and baseline",
    )


def _mock_explanation(req: RouteExplanationRequest) -> str:
    """Deterministic fallback when GEMINI_API_KEY is unset."""
    lines = [
        f"This path is tuned for {req.profile_display} ({req.distance_m:.0f} m). "
        "The routing engine prioritized edges that match your profile weights.",
        f"Engine summary: {req.explanation_baseline}",
    ]
    pct = {k: round(float(v) * 100) for k, v in req.scores.items() if k != "overall"}
    if pct:
        top = sorted(pct.items(), key=lambda x: -x[1])[:3]
        lines.append(
            "Strongest measured factors along the corridor: "
            + ", ".join(f"{k.replace('_', ' ')} ({v}%)" for k, v in top)
            + ". (Mock mode — set GEMINI_API_KEY for a richer narrative.)"
        )
    return "\n\n".join(lines)


@router.post("/explain-route", response_model=RouteWhyResponse)
async def explain_route(req: RouteExplanationRequest):
    """
    Turn structured route metrics into a disability-aware narrative using Gemini.
    """
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key or api_key == "mock":
        await asyncio.sleep(0.8)
        return RouteWhyResponse(explanation=_mock_explanation(req))

    score_lines = []
    for key, val in req.scores.items():
        try:
            pct = round(float(val) * 100)
        except (TypeError, ValueError):
            continue
        score_lines.append(f"- {key}: {pct}% (higher is better unless noted in docs)")

    dir_lines = []
    for d in req.directions_preview[:10]:
        dir_lines.append(f"{d.step}. {d.instruction} (~{d.distance_m:.0f} m)")

    prompt = f"""You are an accessibility navigation assistant for pedestrian routing on a university campus.

The user selected the disability profile: "{req.profile_display}" (internal id: {req.profile}).

Route facts:
- Distance: {req.distance_m:.0f} meters
- Routing engine summary (trust this; do not contradict): {req.explanation_baseline}

Normalized accessibility scores along this path (0–100% scale below):
{chr(10).join(score_lines)}

First steps of turn-by-turn directions:
{chr(10).join(dir_lines) if dir_lines else "(none)"}

Write a helpful explanation (2–4 short paragraphs) of why this route is a strong choice FOR THIS SPECIFIC PROFILE.
- Tie claims to the scores and engine summary; do not invent street names or hazards not implied by the data.
- Mention trade-offs briefly if overall score is middling (e.g., longer but calmer).
- Use supportive, clear language; avoid medical diagnoses.
"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RouteWhyResponse,
                temperature=0.35,
            ),
        )
        result_dict = json.loads(response.text)
        return RouteWhyResponse(**result_dict)
    except Exception as e:
        print(f"Error in Gemini route explanation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
