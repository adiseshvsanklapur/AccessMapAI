from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from datetime import datetime
import uuid
import os
import time
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None
    print("WARNING: Supabase credentials not found. Hazards will not be saved.")

class HazardReport(BaseModel):
    id: str
    lat: float
    lon: float
    type: str
    description: str
    affected_profiles: List[str]
    timestamp: str

class HazardPayload(BaseModel):
    lat: float
    lon: float
    type: str
    description: str
    affected_profiles: List[str]

# Cache to prevent spamming Supabase on every routing request
CACHE_TTL = 30 # seconds
_cache_time = 0
_cache_data: List[HazardReport] = []

def _row_to_hazard(row: dict) -> HazardReport:
    return HazardReport(
        id=str(row["id"]),
        lat=row["lat"],
        lon=row["lon"],
        type=row["type"],
        description=row.get("description", ""),
        affected_profiles=row.get("affected_profiles", []),
        timestamp=row.get("created_at", "")
    )

def _refresh_cache(force=False):
    global _cache_time, _cache_data
    now = time.time()
    if force or (now - _cache_time > CACHE_TTL):
        if not supabase:
            return
        try:
            res = supabase.table("hazards").select("*").execute()
            _cache_data = [_row_to_hazard(row) for row in res.data]
            _cache_time = now
        except Exception as e:
            print("Error fetching hazards from Supabase:", e)

@router.post("/hazards", response_model=HazardReport)
def report_hazard(payload: HazardPayload):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    new_hazard = {
        "lat": payload.lat,
        "lon": payload.lon,
        "type": payload.type,
        "description": payload.description,
        "affected_profiles": payload.affected_profiles,
    }
    
    try:
        res = supabase.table("hazards").insert(new_hazard).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to insert hazard")
        
        hazard = _row_to_hazard(res.data[0])
        # Force cache refresh so the routing engine sees it immediately
        _refresh_cache(force=True)
        return hazard
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/hazards", response_model=List[HazardReport])
def get_hazards():
    if not supabase:
        return _cache_data
    
    try:
        res = supabase.table("hazards").select("*").execute()
        return [_row_to_hazard(row) for row in res.data]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def get_active_hazards_list() -> List[HazardReport]:
    _refresh_cache()
    return _cache_data

