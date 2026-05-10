import os
import json
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from google import genai
from google.genai import types

router = APIRouter()

# Schema for the structured Gemini response
class Hazard(BaseModel):
    type: str
    description: str
    severity: str  # "low", "medium", "high"

class SidewalkAnalysisResult(BaseModel):
    # 0-100 where HIGHER = BETTER accessibility for a wheelchair user.
    overall_score: int
    surface_type: str
    slope_estimate: str
    hazards: List[Hazard]
    wheelchair_accessible: bool
    explanation: str


def _clamp_int(v: object, lo: int, hi: int, default: int) -> int:
    try:
        n = int(v)  # handles numeric strings too
    except Exception:
        return default
    return max(lo, min(hi, n))


def _normalize_severity(raw: object) -> str:
    if not isinstance(raw, str):
        return "medium"
    s = raw.strip().lower()
    if s in ("low", "l"):
        return "low"
    if s in ("high", "h", "severe", "critical"):
        return "high"
    return "medium"


def _postprocess_result(result_dict: dict) -> dict:
    """
    Gemini can invert the score direction (treating 0 as best) unless we are explicit.
    This normalizes fields and applies a small consistency check so users don't see
    \"path looks clear\" paired with \"7/100\".
    """
    hazards = result_dict.get("hazards") or []
    if isinstance(hazards, list):
        for h in hazards:
            if isinstance(h, dict):
                h["severity"] = _normalize_severity(h.get("severity"))
    else:
        hazards = []
        result_dict["hazards"] = hazards

    score = _clamp_int(result_dict.get("overall_score"), 0, 100, 50)
    wheelchair_ok = bool(result_dict.get("wheelchair_accessible"))

    any_high = any(isinstance(h, dict) and h.get("severity") == "high" for h in hazards)
    any_med = any(isinstance(h, dict) and h.get("severity") == "medium" for h in hazards)
    any_low = any(isinstance(h, dict) and h.get("severity") == "low" for h in hazards)

    # If the narrative says it's accessible (wheelchair_accessible true) and hazards are empty/low,
    # a single-digit score is almost certainly inverted. Lift it to a reasonable range.
    if wheelchair_ok and not any_high and score < 35:
        score = 85 if (not hazards) else (75 if any_low and not any_med else 65)

    # Conversely: if not wheelchair accessible and there is a high severity hazard, prevent overly high scores.
    if (not wheelchair_ok) and any_high and score > 55:
        score = 35

    result_dict["overall_score"] = score
    return result_dict

@router.post("/analyze-sidewalk", response_model=SidewalkAnalysisResult)
async def analyze_sidewalk(image: UploadFile = File(...)):
    """
    Analyze an uploaded image of a sidewalk, entrance, or intersection
    for accessibility barriers using Gemini.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    
    if not api_key or api_key == "mock":
        # Return a mock response for frontend demonstration if no key is set
        import asyncio
        await asyncio.sleep(2.5)  # simulate API latency
        return {
            "overall_score": 65,
            "surface_type": "concrete",
            "slope_estimate": "gentle (2-4%)",
            "hazards": [
                {
                    "type": "Obstruction",
                    "description": "E-scooter parked partially blocking the pathway",
                    "severity": "medium"
                },
                {
                    "type": "Surface Damage",
                    "description": "Minor crack in concrete panel",
                    "severity": "low"
                }
            ],
            "wheelchair_accessible": True,
            "explanation": "The pathway is generally clear and paved with concrete. The slope appears gentle. However, there is an e-scooter partially blocking the path which requires maneuvering around, and a minor crack in the surface."
        }

    try:
        # Read file contents
        image_bytes = await image.read()
        
        client = genai.Client(api_key=api_key)
        
        prompt = (
            "You are an expert ADA accessibility inspector. Analyze this image of a sidewalk, "
            "crosswalk, or building entrance. Look for physical barriers that would impact someone "
            "in a wheelchair or using a cane (e.g., steep slopes, broken concrete, missing curb ramps, "
            "obstructions like e-scooters or construction).\n\n"
            "SCORING RUBRIC (IMPORTANT):\n"
            "- overall_score is an integer from 0 to 100 where HIGHER IS BETTER accessibility.\n"
            "- 90-100: clear, smooth, wide path + curb ramps present; no meaningful barriers.\n"
            "- 70-89: generally accessible, minor issues (small cracks, slight cross-slope, minor clutter).\n"
            "- 40-69: usable but significant difficulty (narrow pinch points, uneven surface, ambiguous curb ramp).\n"
            "- 0-39: not wheelchair accessible (steps, missing curb cut at crossing, severe blockage, unsafe slope).\n\n"
            "Return ONLY the structured JSON matching the schema."
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=image.content_type or "image/jpeg"),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SidewalkAnalysisResult,
                temperature=0.1,
            )
        )
        
        # Parse the JSON string returned by Gemini into a dict
        result_dict = json.loads(response.text)
        return _postprocess_result(result_dict)
        
    except Exception as e:
        print(f"Error in Gemini analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))
