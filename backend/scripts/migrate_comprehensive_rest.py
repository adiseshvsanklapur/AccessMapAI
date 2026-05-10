import os
import json
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

def upload_in_batches(client, table_name, items, batch_size=500):
    print(f"Uploading {len(items)} rows to {table_name}...")
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        try:
            client.table(table_name).upsert(batch).execute()
            print(f"  Batch {i//batch_size + 1}/{(len(items)-1)//batch_size + 1} uploaded.")
        except Exception as e:
            print(f"  Error on batch {i//batch_size + 1}: {e}")

def main():
    load_dotenv()
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        print("ERROR: Supabase credentials not found.")
        return

    client = create_client(url, key)
    osm_dir = Path(__file__).parent.parent.parent / "data" / "osm"

    # 1. Buildings
    print("\n--- Migrating Buildings ---")
    b_path = osm_dir / "buildings.json"
    if b_path.exists():
        with open(b_path, "r") as f:
            data = json.load(f)
            items = []
            for el in data.get("elements", []):
                if el["type"] == "way" and "geometry" in el:
                    lats = [p["lat"] for p in el["geometry"]]
                    lons = [p["lon"] for p in el["geometry"]]
                    items.append({
                        "id": el["id"],
                        "lat": sum(lats)/len(lats),
                        "lon": sum(lons)/len(lons),
                        "tags": el.get("tags", {})
                    })
            upload_in_batches(client, "osm_buildings", items)

    # 2. Lighting
    print("\n--- Migrating Lighting ---")
    l_path = osm_dir / "davis_lighting.json"
    if l_path.exists():
        with open(l_path, "r") as f:
            data = json.load(f)
            items = []
            for el in data.get("elements", []):
                items.append({
                    "id": el["id"],
                    "lat": el.get("lat", 0),
                    "lon": el.get("lon", 0),
                    "tags": el.get("tags", {})
                })
            upload_in_batches(client, "osm_lighting", items)

    # 3. Accessibility Features
    print("\n--- Migrating Accessibility Features ---")
    a_path = osm_dir / "accessibility_features.json"
    if a_path.exists():
        with open(a_path, "r") as f:
            data = json.load(f)
            items = []
            for el in data.get("elements", []):
                if el["type"] == "node":
                    items.append({
                        "id": el["id"], "lat": el["lat"], "lon": el["lon"],
                        "tags": el.get("tags", {}), "element_type": "node"
                    })
                elif el["type"] == "way" and "geometry" in el:
                    lats = [p["lat"] for p in el["geometry"]]
                    lons = [p["lon"] for p in el["geometry"]]
                    items.append({
                        "id": el["id"], "lat": sum(lats)/len(lats), "lon": sum(lons)/len(lons),
                        "tags": el.get("tags", {}), "element_type": "way"
                    })
            upload_in_batches(client, "accessibility_features", items)

    # 4. Roads
    print("\n--- Migrating Roads ---")
    r_path = osm_dir / "roads.json"
    if r_path.exists():
        with open(r_path, "r") as f:
            data = json.load(f)
            nodes = []
            ways = []
            for el in data.get("elements", []):
                if el["type"] == "node":
                    nodes.append({
                        "id": el["id"], "lat": el["lat"], "lon": el["lon"], "tags": el.get("tags", {})
                    })
                elif el["type"] == "way":
                    ways.append({
                        "id": el["id"], "tags": el.get("tags", {}), "nodes": el.get("nodes", [])
                    })
            upload_in_batches(client, "osm_nodes", nodes)
            upload_in_batches(client, "osm_roads", ways)

    # 5. Graph Data (sidewalks)
    print("\n--- Migrating Graph Nodes/Ways ---")
    for f_name in ["sidewalks_paths.json", "davis_all_sidewalks.json"]:
        p = osm_dir / f_name
        if p.exists():
            with open(p, "r") as f:
                data = json.load(f)
                nodes = []
                ways = []
                for el in data.get("elements", []):
                    if el["type"] == "node":
                        nodes.append({
                            "id": el["id"], "lat": el["lat"], "lon": el["lon"], "tags": el.get("tags", {})
                        })
                    elif el["type"] == "way":
                        ways.append({
                            "id": el["id"], "tags": el.get("tags", {}), "nodes": el.get("nodes", [])
                        })
                upload_in_batches(client, "osm_nodes", nodes)
                upload_in_batches(client, "osm_ways", ways)

    print("\n--- Migration Complete! ---")

if __name__ == "__main__":
    main()
