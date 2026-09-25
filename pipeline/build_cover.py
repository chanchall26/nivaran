"""Evidence for "Where to plant" (Brief 2, sections 4 and 6).

For every map point in web/public/data/points/{city}.json:
  - ESA WorldCover 2021 (10 m) land cover around the point, read straight from the public
    Cloud-Optimised GeoTIFFs on AWS (no key, no billing):
      trees50  share of tree cover within 50 m        -> "no trees within 50 m" / "No shade now"
      built30  share of built-up land within 30 m     -> "hard hot surface"
      bare50   share of bare / sparse ground in 50 m  -> "dusty or unpaved edge"
      grass50, crop50, water50 for context
  - pin provenance: "osm:<type>/<id>" when the pin is a real OpenStreetMap feature, else "manual"
    with a Nominatim search of its name and the distance to our pin, so the team knows which
    pins to check on Street View before the demo.

Writes web/public/data/cover/{city}.json:
  { "meta": {...}, "points": { "<point id>": { "trees50": 0.12, "built30": 0.9, ..., "pin": "osm:node/1" } } }

Run:  python pipeline/build_cover.py            (all cities)
      python pipeline/build_cover.py leh        (one city)
"""
import json
import math
import sys
import time
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.windows import from_bounds

ROOT = Path(__file__).parent
WEB = ROOT.parent / "web" / "public" / "data"
CACHE = ROOT / "cache" / "nominatim"
CACHE.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "barahmasa-build/1.0 (GDG hackathon)"}
COG = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
CITY = {
    "gwalior": {"name": "Gwalior", "box": (78.00, 26.05, 78.35, 26.35)},
    "delhi": {"name": "Delhi", "box": (76.85, 28.40, 77.40, 28.90)},
    "leh": {"name": "Leh", "box": (77.40, 34.00, 77.75, 34.25)},
}
CLASSES = {"trees": 10, "built": 50, "bare": 60, "grass": 30, "crop": 40, "water": 80}


def tile(lat, lon):
    return f"N{int(math.floor(lat / 3) * 3):02d}E{int(math.floor(lon / 3) * 3):03d}"


_open = {}


def worldcover(lat, lon, radius_m=55):
    """Class grid around a point and each pixel centre's distance from it (metres)."""
    t = tile(lat, lon)
    if t not in _open:
        _open[t] = rasterio.open(COG.format(tile=t))
    src = _open[t]
    dlat = radius_m / 111320
    dlon = radius_m / (111320 * math.cos(math.radians(lat)))
    win = from_bounds(lon - dlon, lat - dlat, lon + dlon, lat + dlat, src.transform).round_offsets().round_lengths()
    a = src.read(1, window=win)
    tr = src.window_transform(win)
    rows, cols = np.indices(a.shape)
    xs = tr.c + (cols + 0.5) * tr.a
    ys = tr.f + (rows + 0.5) * tr.e
    dist = np.hypot((xs - lon) * 111320 * math.cos(math.radians(lat)), (ys - lat) * 110574)
    return a, dist


def shares(a, dist, radius):
    m = dist <= radius
    n = int(m.sum())
    return {k: round(float(((a == v) & m).sum()) / n, 2) if n else None for k, v in CLASSES.items()}, n


def km(a_lat, a_lon, b_lat, b_lon):
    p = math.pi / 180
    h = math.sin((b_lat - a_lat) * p / 2) ** 2 + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin((b_lon - a_lon) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def nominatim(q, box):
    # the search is bounded to the city's box, so the cache must be per box too
    tag = "_".join(f"{v:.2f}" for v in box)
    key = CACHE / (f"{tag}__" + q.replace("/", " ").replace(":", " ").replace("?", " ")[:110] + ".json")
    if key.exists():
        return json.loads(key.read_text(encoding="utf-8"))
    out = None
    for wait in (1.1, 5, 15):  # Nominatim usage policy: at most 1 request per second; back off when refused
        time.sleep(wait)
        try:
            r = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q, "format": "jsonv2", "countrycodes": "in", "limit": 3, "viewbox": ",".join(map(str, box)), "bounded": 1},
                headers=UA, timeout=30,
            )
            r.raise_for_status()
            out = r.json()
            break
        except (requests.RequestException, ValueError):
            continue
    if out is None:
        return None  # not cached: try again on the next run
    key.write_text(json.dumps(out), encoding="utf-8")
    return out


def check_name(p, city):
    """Search the point's own name; report the closest hit and how far it is from our pin."""
    box = CITY[city]["box"]
    name = p["name"]
    queries = [f"{name}, {CITY[city]['name']}", name.split(",")[0].split("(")[0].strip()]
    for q in queries:
        hits = nominatim(q, box)
        if hits is None:
            return {"name": None, "km": None, "query": q, "error": "Nominatim did not answer"}
        if hits:
            best = min(hits, key=lambda h: km(p["lat"], p["lon"], float(h["lat"]), float(h["lon"])))
            return {"name": best["display_name"].split(",")[0], "km": round(km(p["lat"], p["lon"], float(best["lat"]), float(best["lon"])), 2), "query": q}
    return {"name": None, "km": None, "query": queries[0]}


def build(city):
    pts = json.loads((WEB / "points" / f"{city}.json").read_text(encoding="utf-8"))["points"]
    out = {}
    for p in pts:
        a, dist = worldcover(p["lat"], p["lon"])
        s50, n50 = shares(a, dist, 50)
        s30, _ = shares(a, dist, 30)
        row = {
            "trees50": s50["trees"], "built30": s30["built"], "bare50": s50["bare"],
            "grass50": s50["grass"], "crop50": s50["crop"], "water50": s50["water"], "pixels50": n50,
        }
        # a pin placed on a real OSM feature is that feature; only hand-placed pins need a name check
        if p.get("osm"):
            row["pin"] = f"osm:{p['osm']}"
            note = f"pin = {row['pin']}"
        else:
            row["pin"] = "manual"
            n = row["nominatim"] = check_name(p, city)
            ok = n["km"] is not None and n["km"] <= 0.3
            note = f"manual pin, OSM name search: '{n['name']}' {n['km']} km" + ("" if ok else "  <- team: check this pin")
        out[p["id"]] = row
        print(f"{city:8s} {p['id']:32s} trees50 {row['trees50']:.2f} built30 {row['built30']:.2f} bare50 {row['bare50']:.2f} | {note}")
    meta = {
        "source": "ESA WorldCover 2021 v200, 10 m (public COGs on AWS); shares of pixels whose centre is within the radius. "
                  "Name check: OpenStreetMap Nominatim, nearest hit to our pin.",
        "built": str(date.today()),
        "note": "Land cover is from 2021 satellite imagery: street trees under 10 m wide or new since 2021 may be missed.",
    }
    (WEB / "cover").mkdir(exist_ok=True)
    (WEB / "cover" / f"{city}.json").write_text(json.dumps({"meta": meta, "points": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    for c in sys.argv[1:] or list(CITY):
        build(c)
