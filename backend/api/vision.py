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
    overall_score: int  # 0-100
    surface_type: str
    slope_estimate: str
    hazards: List[Hazard]
    wheelchair_accessible: bool
    explanation: str

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
            "obstructions like e-scooters or construction). Provide a structured assessment."
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
        return result_dict
        
    except Exception as e:
        print(f"Error in Gemini analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))
