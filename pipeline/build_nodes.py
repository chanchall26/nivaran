"""Step 5 (v3): Exposure Nodes and the real winter they will be replayed against.

Writes
  web/public/data/gwalior/nodes.json          12 Exposure Nodes: who is outside, when, what
                                               protection exists, plus nearby buildings (Google Open
                                               Buildings v3 footprints + 2.5D temporal heights) and
                                               tree crowns (ESA WorldCover) for the Shade Clock
  web/public/data/gwalior/winter_nights.json  every night of winter 2025-26 (1 Dec - 28 Feb):
                                               min feels-like, ventilation, PM2.5 (Open-Meteo, real)

People counts and protection status are SYNTHETIC planning profiles (labelled as such in the
app); anchors are real OpenStreetMap features where one exists.
"""
import json
import math
import os
import statistics
from datetime import date, timedelta
from pathlib import Path

import ee
import requests
from shapely.geometry import Point, Polygon, mapping, shape

ROOT = Path(__file__).parent
WEB = ROOT.parent / "web" / "public" / "data" / "gwalior"
PROJECT = os.environ.get("EE_PROJECT", "barahmasa-gwalior")
RADIUS_M = 120

# id, name, nameHi, lat, lon, anchor source, winter profile, summer profile
# winter: night hours [start, end], people by group, heater status
# summer: day hours [start, end], people by group, water point present
NODES = [
    ("shyam-gate", "Raksha Vihar, Gate 2", "रक्षा विहार, गेट 2", 26.20899, 78.183901, "osm-anchored",
     {"hours": [20, 8], "people": {"guard": 1}, "heater": "distributed"},
     {"hours": [8, 20], "people": {"guard": 1}, "water": False}),
    ("defence-gate", "Defence Colony gate", "डिफ़ेंस कॉलोनी गेट", 26.216211, 78.177523, "osm-anchored",
     {"hours": [20, 8], "people": {"guard": 2}, "heater": "distributed"},
     {"hours": [8, 20], "people": {"guard": 2}, "water": True}),
    ("jah-gate", "Jaya Arogya Hospital gate", "जयारोग्य अस्पताल गेट", 26.191627, 78.160652, "osm-anchored",
     {"hours": [21, 7], "people": {"guard": 3, "attendant": 25}, "heater": "none"},
     {"hours": [9, 18], "people": {"guard": 3, "attendant": 40}, "water": True}),
    ("station", "Gwalior Junction approach", "ग्वालियर जंक्शन के बाहर", 26.216244, 78.182604, "osm-anchored",
     {"hours": [22, 6], "people": {"homeless": 15, "worker": 12}, "heater": "none"},
     {"hours": [10, 18], "people": {"worker": 30, "commuter": 60}, "water": True}),
    ("isbt", "Inter-state Bus Stand", "अंतरराज्यीय बस स्टैंड", 26.215022, 78.186121, "osm-anchored",
     {"hours": [22, 6], "people": {"worker": 10, "homeless": 6}, "heater": "none"},
     {"hours": [10, 18], "people": {"worker": 25, "vendor": 12, "commuter": 50}, "water": False}),
    ("chhatri-mandi", "Chhatri vegetable market", "छत्री सब्ज़ी मंडी", 26.203095, 78.14577, "osm-anchored",
     {"hours": [4, 9], "people": {"vendor": 25}, "heater": "none"},
     {"hours": [6, 14], "people": {"vendor": 40}, "water": False}),
    ("padav-chowk", "Padav labour chowk", "पड़ाव मज़दूर चौक", 26.2143, 78.1768, "synthetic",
     {"hours": [6, 10], "people": {"labour": 80}, "heater": "none"},
     {"hours": [7, 11], "people": {"labour": 100}, "water": False}),
    ("hazira-chowk", "Hazira labour chowk", "हज़ीरा मज़दूर चौक", 26.2352, 78.1792, "synthetic",
     {"hours": [6, 10], "people": {"labour": 60}, "heater": "none"},
     {"hours": [7, 11], "people": {"labour": 70}, "water": False}),
    ("bp-pump", "Petrol pump near station", "स्टेशन के पास पेट्रोल पंप", 26.214132, 78.181998, "osm-anchored",
     {"hours": [20, 8], "people": {"guard": 2}, "heater": "distributed"},
     {"hours": [8, 20], "people": {"worker": 4}, "water": True}),
    ("site-lashkar", "Construction site, Lashkar", "निर्माण स्थल, लश्कर", 26.198182, 78.147487, "osm-anchored",
     {"hours": [20, 6], "people": {"guard": 1, "labour": 15}, "heater": "none"},
     {"hours": [8, 17], "people": {"labour": 25}, "water": False}),
    ("phoolbagh-night", "Phool Bagh footpath", "फूल बाग फ़ुटपाथ", 26.2090, 78.1720, "synthetic",
     {"hours": [21, 7], "people": {"homeless": 12}, "heater": "none"},
     {"hours": [11, 17], "people": {"vendor": 10}, "water": False}),
    ("mits-gate", "MITS campus gate", "MITS कैंपस गेट", 26.230267, 78.207172, "osm-anchored",
     {"hours": [20, 8], "people": {"guard": 2}, "heater": "distributed"},
     {"hours": [8, 20], "people": {"guard": 2}, "water": True}),
]

SHELTERS = [(26.2150, 78.1845), (26.2070, 78.1610), (26.1985, 78.1490), (26.2255, 78.2215), (26.2365, 78.1815)]


def km(a_lat, a_lon, b_lat, b_lon):
    p = math.pi / 180
    h = (math.sin((b_lat - a_lat) * p / 2) ** 2
         + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin((b_lon - a_lon) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(h))


def init_ee():
    token = os.environ.get("EE_ACCESS_TOKEN")
    if token:
        from google.oauth2.credentials import Credentials
        ee.Initialize(Credentials(token), project=PROJECT)
    else:
        ee.Initialize(project=PROJECT)


def surroundings(lat, lon):
    """Buildings (footprint + height) and tree crowns within RADIUS_M of a node."""
    region = ee.Geometry.Point([lon, lat]).buffer(RADIUS_M)
    polys = (ee.FeatureCollection("GOOGLE/Research/open-buildings/v3/polygons")
             .filterBounds(region).filter(ee.Filter.gte("confidence", 0.7)))
    heights = (ee.ImageCollection("GOOGLE/Research/open-buildings-temporal/v1")
               .filterBounds(region).filterDate("2023-01-01", "2024-01-01").mosaic().select("building_height"))
    polys = heights.reduceRegions(collection=polys, reducer=ee.Reducer.median(), scale=4)
    buildings = []
    for f in polys.getInfo()["features"]:
        g = shape(f["geometry"])
        if g.geom_type != "Polygon":
            continue
        h = f["properties"].get("median") or 0
        # the 2.5D model under-reads small buildings; floor at one storey
        h = max(3.5, min(40.0, float(h)))
        ring = [[round(x, 6), round(y, 6)] for x, y in g.simplify(0.000005).exterior.coords]
        buildings.append({"c": ring, "h": round(h, 1)})
    trees_img = ee.ImageCollection("ESA/WorldCover/v200").first().eq(10).selfMask()
    pts = trees_img.sample(region=region, scale=10, geometries=True, dropNulls=True).getInfo()["features"]
    trees = [[round(p["geometry"]["coordinates"][0], 6), round(p["geometry"]["coordinates"][1], 6)] for p in pts]
    return buildings, trees


def free_spot(lat, lon, buildings):
    """People stand outside buildings: if the anchor falls inside a footprint, step out of it."""
    pt = Point(lon, lat)
    polys = [Polygon(b["c"]) for b in buildings]
    inside = [p for p in polys if p.contains(pt)]
    if not inside:
        return lat, lon
    ring = inside[0].exterior
    nearest = ring.interpolate(ring.project(pt))
    dx, dy = nearest.x - pt.x, nearest.y - pt.y
    n = math.hypot(dx, dy) or 1
    step = 0.00004  # ~4 m further out
    return round(nearest.y + dy / n * step, 6), round(nearest.x + dx / n * step, 6)


def winter_nights():
    """Nightly summaries for winter 2025-26 from the Open-Meteo historical forecast (has BLH)."""
    params = {
        "latitude": 26.2124, "longitude": 78.1772, "start_date": "2025-12-01", "end_date": "2026-03-01",
        "hourly": "temperature_2m,apparent_temperature,wind_speed_10m,boundary_layer_height",
        "wind_speed_unit": "ms", "timezone": "Asia/Kolkata",
    }
    h = requests.get("https://historical-forecast-api.open-meteo.com/v1/forecast", params=params, timeout=120).json()["hourly"]
    aq = requests.get("https://air-quality-api.open-meteo.com/v1/air-quality", timeout=120, params={
        "latitude": 26.2124, "longitude": 78.1772, "start_date": "2025-12-01", "end_date": "2026-03-01",
        "hourly": "pm2_5", "timezone": "Asia/Kolkata"}).json().get("hourly", {})
    pm = aq.get("pm2_5") or [None] * len(h["time"])
    idx = {t: i for i, t in enumerate(h["time"])}
    out = []
    d = date(2025, 12, 1)
    while d <= date(2026, 2, 28):
        nxt = d + timedelta(days=1)
        hours = [idx[t] for t in (f"{d}T{x:02d}:00" for x in range(20, 24))] + \
                [idx[t] for t in (f"{nxt}T{x:02d}:00" for x in range(0, 7)) if t in idx]
        feels = [h["apparent_temperature"][i] for i in hours]
        temp = [h["temperature_2m"][i] for i in hours]
        wind = [h["wind_speed_10m"][i] for i in hours]
        vc = [h["boundary_layer_height"][i] * h["wind_speed_10m"][i] for i in hours]
        pms = [pm[i] for i in hours if pm[i] is not None]
        out.append({
            "date": str(d), "minTemp": round(min(temp), 1), "minFeels": round(min(feels), 1),
            "wind": round(statistics.mean(wind), 2), "vc": round(statistics.median(vc)), "pm25": round(max(pms)) if pms else None,
        })
        d = nxt
    return out


def main():
    init_ee()
    nodes = []
    for nid, name, name_hi, lat, lon, source, winter, summer in NODES:
        buildings, trees = surroundings(lat, lon)
        slat, slon = free_spot(lat, lon, buildings)
        shelter = min(km(slat, slon, a, b) for a, b in SHELTERS)
        winter = {**winter, "shelterKm": round(shelter, 2)}
        nodes.append({
            "id": nid, "name": name, "nameHi": name_hi, "lat": slat, "lon": slon, "source": source,
            "profilesSource": "synthetic", "winter": winter, "summer": summer,
            "buildings": buildings, "trees": trees,
        })
        print(f"{nid:16s} buildings {len(buildings):3d}  trees {len(trees):3d}  shelter {shelter:.1f} km")
    meta = {
        "buildings": "Google Open Buildings v3 footprints (confidence >= 0.7) with 2023 median height from "
                     "Open Buildings 2.5D Temporal, via Google Earth Engine",
        "trees": "ESA WorldCover 2021 tree-cover pixels (10 m), via Google Earth Engine",
        "profiles": "People counts, hours and protection status are synthetic planning profiles",
    }
    (WEB / "nodes.json").write_text(json.dumps({"meta": meta, "nodes": nodes}, ensure_ascii=False, separators=(",", ":")),
                                    encoding="utf-8")
    nights = winter_nights()
    (WEB / "winter_nights.json").write_text(json.dumps({
        "source": "Open-Meteo historical forecast + CAMS PM2.5 (model data), Gwalior, nights 20:00-07:00",
        "nights": nights}, separators=(",", ":")), encoding="utf-8")
    cold = sorted(nights, key=lambda n: n["minFeels"])[:3]
    print("nights", len(nights), "coldest", [(n["date"], n["minFeels"], n["vc"]) for n in cold])


if __name__ == "__main__":
    main()
