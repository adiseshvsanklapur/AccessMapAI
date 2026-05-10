import os
import json
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

def main():
    load_dotenv()
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        print("ERROR: Supabase credentials not found in .env")
        return

    client = create_client(url, key)
    
    data_path = Path(__file__).parent.parent.parent / "data" / "osm" / "accessibility_features.json"
    if not data_path.exists():
        print(f"ERROR: Data file not found: {data_path}")
        return

    with open(data_path, "r") as f:
        data = json.load(f)
    
    elements = data.get("elements", [])
    features = []
    
    for el in elements:
        if el["type"] == "node":
            features.append({
                "id": el["id"],
                "lat": el.get("lat"),
                "lon": el.get("lon"),
                "tags": el.get("tags", {}),
                "element_type": "node"
            })
        elif el["type"] == "way":
            # Just take the first coordinate for ways
            if "geometry" in el and el["geometry"]:
                features.append({
                    "id": el["id"],
                    "lat": el["geometry"][0]["lat"],
                    "lon": el["geometry"][0]["lon"],
                    "tags": el.get("tags", {}),
                    "element_type": "way"
                })

    if not features:
        print("No features found to upload.")
        return

    print(f"Preparing to upload {len(features)} accessibility features...")

    # Upload in batches of 100
    batch_size = 100
    for i in range(0, len(features), batch_size):
        batch = features[i:i + batch_size]
        try:
            res = client.table("accessibility_features").upsert(batch).execute()
            print(f"Uploaded batch {i//batch_size + 1}/{(len(features)-1)//batch_size + 1}")
        except Exception as e:
            print(f"Error uploading batch {i//batch_size + 1}: {e}")
            return

    print(f"Successfully uploaded {len(features)} accessibility features to Supabase!")

if __name__ == "__main__":
    main()
