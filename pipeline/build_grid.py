"""Step 3: aggregate everything onto an H3 resolution-9 grid (~0.1 km2 per cell)
and write the static data the web app loads:

  web/public/data/gwalior/cells.json     per-cell features (no scores; the app scores live)
  web/public/data/gwalior/places.json    Bahar-Log points (guard posts, rehri zones, shelters ...)
  web/public/data/gwalior/boundary.json  city outline
  web/public/data/gwalior/meta.json      provenance of every layer

Scores are deliberately NOT computed here: the app combines these structural
features with live weather, so the formula lives in one place (web/src/lib/scoring.ts).
"""
import json
import math
import random
from pathlib import Path

import h3
import numpy as np
from rasterio import features
from rasterio.transform import Affine
from shapely.geometry import Point, Polygon, mapping, shape

ROOT = Path(__file__).parent
OUT = ROOT / "out"
WEB = ROOT.parent / "web" / "public" / "data" / "gwalior"
RES = 9
SEED = 2026

# Core localities missing from OSM. Coordinates are approximate (label use only).
LOCALITIES = [
    ("Maharaj Bada", "महाराज बाड़ा", 26.1990, 78.1470),
    ("Lashkar", "लश्कर", 26.1950, 78.1520),
    ("Kampoo", "कम्पू", 26.2040, 78.1580),
    ("Jayarogya Hospital", "जयारोग्य अस्पताल", 26.2080, 78.1625),
    ("Phool Bagh", "फूल बाग", 26.2090, 78.1720),
    ("Padav", "पड़ाव", 26.2140, 78.1770),
    ("Railway Station", "रेलवे स्टेशन", 26.2162, 78.1826),
    ("Mahalgaon", "महलगांव", 26.2080, 78.1930),
    ("City Centre", "सिटी सेंटर", 26.2100, 78.1990),
    ("Thatipur", "थाटीपुर", 26.2140, 78.2150),
    ("Gola Ka Mandir", "गोला का मंदिर", 26.2250, 78.2080),
    ("Morar", "मुरार", 26.2270, 78.2240),
    ("Gwalior Fort", "ग्वालियर किला", 26.2303, 78.1689),
    ("Kila Gate", "किला गेट", 26.2280, 78.1600),
    ("Hazira", "हजीरा", 26.2360, 78.1800),
    ("Birla Nagar", "बिरला नगर", 26.2390, 78.1930),
    ("Bahodapur", "बहोड़ापुर", 26.2380, 78.1450),
]

# Night shelters: DEMO locations near places where rain baseras are typically run
# (station, district hospital, old market, bus stand). Verify with Nagar Nigam before real use.
SHELTERS = [
    ("Rain Basera - Railway Station (demo)", 26.2150, 78.1845),
    ("Rain Basera - JAH Hospital (demo)", 26.2070, 78.1610),
    ("Rain Basera - Maharaj Bada (demo)", 26.1985, 78.1490),
    ("Rain Basera - Morar (demo)", 26.2255, 78.2215),
    ("Rain Basera - Hazira (demo)", 26.2365, 78.1815),
]


DIRS = ["uttar", "uttar-purab", "purab", "dakshin-purab", "dakshin", "dakshin-paschim", "paschim", "uttar-paschim"]


def direction(from_lat, from_lon, to_lat, to_lon):
    """8-point compass direction of `to` as seen from `from`, in Hindi."""
    ang = math.degrees(math.atan2((to_lon - from_lon) * math.cos(math.radians(from_lat)), to_lat - from_lat)) % 360
    return DIRS[int((ang + 22.5) // 45) % 8]


def load_npz(name):
    z = np.load(OUT / name)
    return z["data"], Affine(*z["transform"])


def haversine_km(a_lat, a_lon, b_lat, b_lon):
    p = math.pi / 180
    h = (math.sin((b_lat - a_lat) * p / 2) ** 2
         + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin((b_lon - a_lon) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(h))


def cell_stats(cells, arr, transform, how):
    """Rasterise hexagons onto a raster grid and reduce the pixels inside each one."""
    shapes = ((Polygon([(lon, lat) for lat, lon in h3.cell_to_boundary(c)]), i + 1)
              for i, c in enumerate(cells))
    idx = features.rasterize(shapes, out_shape=arr.shape, transform=transform, fill=0, dtype="int32")
    flat_idx, flat = idx.ravel(), arr.ravel()
    ok = np.isfinite(flat) & (flat_idx > 0)
    n = len(cells) + 1
    total = np.bincount(flat_idx[ok], weights=flat[ok], minlength=n)[1:]
    if how == "sum":
        return total
    count = np.bincount(flat_idx[ok], minlength=n)[1:]
    return np.where(count > 0, total / np.maximum(count, 1), np.nan)


def main():
    WEB.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    boundary = shape(json.loads((OUT / "boundary.geojson").read_text(encoding="utf-8"))["geometry"])
    osm = json.loads((OUT / "osm_features.json").read_text(encoding="utf-8"))
    roads = json.loads((OUT / "roads.json").read_text(encoding="utf-8"))

    cells = sorted(h3.geo_to_cells(mapping(boundary), RES))
    index = {c: i for i, c in enumerate(cells)}
    print("cells", len(cells))

    pop, pt = load_npz("population.npz")
    pop_c = cell_stats(cells, pop, pt, "sum")
    ee_file = OUT / "ee_cells.json"
    if ee_file.exists():
        # preferred: computed on Google Earth Engine (fetch_ee.py)
        ee_data = json.loads(ee_file.read_text(encoding="utf-8"))
        ee_cells, ee_meta = ee_data["cells"], ee_data["meta"]
        pick = lambda k: np.array([np.nan if ee_cells.get(c, {}).get(k) is None else ee_cells[c][k] for c in cells])
        canopy_c, lst_c = pick("canopy"), pick("lst")
        print(f"using Earth Engine layers ({ee_meta['scenes']} Landsat scenes)")
    else:
        ee_meta = None
        canopy, ct = load_npz("canopy.npz")
        lst, lt = load_npz("lst.npz")
        canopy_c = cell_stats(cells, canopy, ct, "mean")
        lst_c = cell_stats(cells, lst, lt, "mean")

    counts = {c: np.zeros(len(cells)) for c in osm}
    for cat, block in osm.items():
        for f in block["features"]:
            i = index.get(h3.latlng_to_cell(f["lat"], f["lon"], RES))
            if i is not None:
                counts[cat][i] += 1

    road_km = np.zeros(len(cells))
    for r in roads:
        for (x1, y1), (x2, y2) in zip(r["coords"], r["coords"][1:]):
            seg = haversine_km(y1, x1, y2, x2)
            steps = max(1, int(seg / 0.02))
            for k in range(steps):
                t = (k + 0.5) / steps
                i = index.get(h3.latlng_to_cell(y1 + (y2 - y1) * t, x1 + (x2 - x1) * t, RES))
                if i is not None:
                    road_km[i] += seg / steps

    # ---- Bahar-Log points --------------------------------------------------------
    places = []

    def add(kind, lat, lon, name, source, who, **extra):
        places.append({"id": f"{kind}-{len(places)}", "kind": kind, "lat": round(lat, 6),
                       "lon": round(lon, 6), "name": name, "source": source, "who": who, **extra})

    guard_kinds = {"bank": "Bank", "atm": "ATM", "hospital": "Hospital", "clinic": "Clinic",
                   "school": "School", "college": "College", "university": "University"}
    for f in osm["guarded"]["features"]:
        label = guard_kinds.get(f["kind"], "Office")
        add("guard_post", f["lat"], f["lon"], f["name"] or f"{label} gate", "osm-anchored",
            "Security guard (raat ki duty)", anchor=f["id"],
            staff=2 if f["kind"] in ("hospital", "college", "university") else 1)
    for f in osm["residential"]["features"]:
        add("guard_post", f["lat"], f["lon"], f["name"] or "Colony gate", "osm-anchored",
            "Colony gate guard", anchor=f["id"], staff=1)
    for f in osm["market"]["features"]:
        add("rehri_zone", f["lat"], f["lon"], f["name"] or "Market", "osm-anchored",
            "Rehri-patri wale, palledar", anchor=f["id"], staff=rng.randint(15, 40))
    for f in osm["rail"]["features"] + osm["bus_stop"]["features"]:
        add("transit", f["lat"], f["lon"], f["name"] or "Bus/rail stop", "osm-anchored",
            "Coolie, auto chalak, intezaar karte log", anchor=f["id"], staff=rng.randint(10, 30))
    for f in osm["fuel"]["features"]:
        add("guard_post", f["lat"], f["lon"], f["name"] or "Petrol pump", "osm-anchored",
            "Pump attendant (raat bhar)", anchor=f["id"], staff=2)
    for f in osm["construction"]["features"] + osm["industrial"]["features"]:
        add("worksite", f["lat"], f["lon"], f["name"] or "Worksite", "osm-anchored",
            "Mazdoor, loading workers", anchor=f["id"], staff=rng.randint(10, 50))
    for name, lat, lon in SHELTERS:
        add("shelter", lat, lon, name, "demo", "Beghar log (aashray)", capacity=rng.choice([40, 50, 60]))

    # Synthetic points so the demo reflects real density where OSM is thin.
    # Sampled proportional to population, so they sit where people actually live and work.
    weights = pop_c / pop_c.sum()
    for kind, n, who, staff in [
        ("guard_post", 140, "Colony/dukaan guard (synthetic)", (1, 2)),
        ("rehri_zone", 60, "Rehri-patri wale (synthetic)", (5, 25)),
        ("worksite", 18, "Nirmaan mazdoor (synthetic)", (10, 40)),
        ("homeless_spot", 22, "Beghar log (synthetic, approx.)", (3, 15)),
    ]:
        for c in rng.choices(cells, weights=weights, k=n):
            lat, lon = h3.cell_to_latlng(c)
            jitter = 0.0012
            add(kind, lat + rng.uniform(-jitter, jitter), lon + rng.uniform(-jitter, jitter),
                None, "synthetic", who, staff=rng.randint(*staff))
    for name, (lat, lon) in [("Mazdoor chowk - Padav", (26.2143, 78.1768)),
                             ("Mazdoor chowk - Hazira", (26.2352, 78.1792)),
                             ("Mazdoor chowk - Morar", (26.2262, 78.2230))]:
        add("labour_chowk", lat, lon, name + " (synthetic)", "synthetic",
            "Dihadi mazdoor (subah 6-10)", staff=rng.randint(60, 150))

    exposed = np.zeros(len(cells))
    for p in places:
        i = index.get(h3.latlng_to_cell(p["lat"], p["lon"], RES))
        if i is not None and p["kind"] != "shelter":
            exposed[i] += p.get("staff", 1)

    # ---- per-cell records ----------------------------------------------------------
    shelters = [(lat, lon) for _, lat, lon in SHELTERS]
    osm_places = json.loads((OUT / "places.json").read_text(encoding="utf-8"))
    names = LOCALITIES + [(pl["name"], pl.get("hi"), pl["lat"], pl["lon"]) for pl in osm_places
                          if all(haversine_km(pl["lat"], pl["lon"], L[2], L[3]) > 0.8 for L in LOCALITIES)]
    records = []
    for i, c in enumerate(cells):
        lat, lon = h3.cell_to_latlng(c)
        near = min(names, key=lambda L: haversine_km(lat, lon, L[2], L[3]))
        near_km = haversine_km(lat, lon, near[2], near[3])
        records.append({
            "h3": c,
            "lat": round(lat, 5), "lon": round(lon, 5),
            "area": near[0],
            "areaHi": near[1],
            "areaKm": round(near_km, 1),
            "areaDir": direction(near[2], near[3], lat, lon),
            "pop": int(round(pop_c[i])),
            "canopy": None if np.isnan(canopy_c[i]) else round(float(canopy_c[i]), 3),
            "lst": None if np.isnan(lst_c[i]) else round(float(lst_c[i]), 1),
            "roadKm": round(float(road_km[i]), 3),
            "exposed": int(exposed[i]),
            "poi": {k: int(counts[k][i]) for k in ("bus_stop", "rail", "market", "shop", "guarded",
                                                   "construction", "industrial", "worship", "fuel",
                                                   "water", "park")
                    if counts[k][i]},
            "shelterKm": round(min(haversine_km(lat, lon, a, b) for a, b in shelters), 2),
        })

    (WEB / "cells.json").write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")),
                                    encoding="utf-8")
    (WEB / "places.json").write_text(json.dumps(places, ensure_ascii=False, separators=(",", ":")),
                                     encoding="utf-8")
    (WEB / "boundary.json").write_text((OUT / "boundary.geojson").read_text(encoding="utf-8"),
                                       encoding="utf-8")
    meta = {
        "city": "Gwalior", "cityHi": "ग्वालियर", "center": [26.2124, 78.1772], "h3Resolution": RES,
        "cells": len(cells), "population": int(pop_c.sum()),
        "layers": {
            "population": "Meta High Resolution Settlement Layer (HRSL), ~30 m, CC-BY 4.0",
            "canopy": "ESA WorldCover 2021 v200, 10 m, tree-cover class, CC-BY 4.0"
                      + (" (computed on Google Earth Engine)" if ee_meta else ""),
            "lst": (f"Landsat 8/9 C2 L2 surface temperature, QA-masked median of {ee_meta['scenes']} May 2026 scenes, "
                    "computed on Google Earth Engine") if ee_meta else
                   "Landsat 8/9 C2 L2 surface temperature, median of 10/18/25/26 May 2026 (USGS via Microsoft Planetary Computer)",
            "osm": "OpenStreetMap contributors, ODbL (bus stops, markets, guarded sites, roads, boundary)",
            "localities": "Hand-placed approximate locality labels",
            "synthetic": "Guard posts, rehri zones, worksites, homeless spots and labour chowks marked 'synthetic' are "
                         "sampled in proportion to population for the demo; shelters marked 'demo' are placeholders",
        },
        "lstRange": [round(float(np.nanpercentile(lst_c, 5)), 1), round(float(np.nanpercentile(lst_c, 95)), 1)],
    }
    (WEB / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    by_kind = {}
    for p in places:
        by_kind[p["kind"]] = by_kind.get(p["kind"], 0) + 1
    print("places", by_kind)
    print(f"pop {pop_c.sum():,.0f}  canopy mean {np.nanmean(canopy_c):.1%}  "
          f"lst {meta['lstRange']}  road km {road_km.sum():.0f}  exposed {exposed.sum():.0f}")


if __name__ == "__main__":
    main()
