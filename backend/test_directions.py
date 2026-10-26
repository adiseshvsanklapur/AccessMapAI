"""Self-check for turn-by-turn directions. Run: venv/bin/python test_directions.py"""
import math, sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from routing.engine import _generate_directions

def walk(moves, lat=38.54, lon=-121.75):
    """moves: list of (bearing_deg, meters, surface). Returns coords, edges."""
    coords = [{"lat": lat, "lon": lon}]
    edges = []
    for brg, m, sfc in moves:
        dlat = m * math.cos(math.radians(brg)) / 111_000
        dlon = m * math.sin(math.radians(brg)) / (111_000 * math.cos(math.radians(lat)))
        lat, lon = lat + dlat, lon + dlon
        coords.append({"lat": lat, "lon": lon})
        edges.append({"distance_m": m, "surface": sfc, "is_shortcut": sfc == "off"})
    return coords, edges

def instr(moves):
    return [(s["instruction"], s["distance_m"], s["surface"]) for s in _generate_directions(*walk(moves))]

# 1. Short first hop north then 200m east -> must head east, not north
r = instr([(0, 6, "asphalt"), (90, 100, "asphalt"), (90, 100, "asphalt")])
assert r[0][0] == "Head east", r

# 2. 90-degree corner drawn as four 22.5-degree bends -> a left turn is reported
r = instr([(0, 50, "asphalt")] + [(-22.5 * k, 5, "asphalt") for k in range(1, 5)] + [(-90, 50, "asphalt")])
assert any(i.startswith("Turn left") for i, *_ in r), r

# 3. Short jog mid-route that returns to the same heading -> no spurious turns
r = instr([(0, 50, "asphalt"), (90, 4, "asphalt"), (0, 50, "asphalt")])
assert [i for i, *_ in r] == ["Head north", "Arrive at your destination"], r

# 4. Leg labelled by majority surface, not first edge
r = instr([(180, 20, "off"), (180, 127, "concrete")])
assert r[0][2] == "concrete", r

# 5. A real right turn after a long leg
r = instr([(0, 80, "asphalt"), (90, 80, "asphalt")])
assert [i for i, *_ in r][:2] == ["Head north", "Turn right"] and r[1][1] == 80, r
print("directions ok")
