"""Step 1: city boundary + outdoor-exposure features from OpenStreetMap.

Writes pipeline/out/boundary.geojson and pipeline/out/osm_features.json.
Every feature keeps its OSM id so the map can link back to the source.
"""
import json
from pathlib import Path

from shapely.geometry import LineString, mapping
from shapely.ops import polygonize, unary_union

from overpass import query

OUT = Path(__file__).parent / "out"
BOUNDARY_REL = 16455769  # "Gwalior", admin_level 9 (city limits in OSM)

# category -> (overpass selectors, who is exposed there)
CATEGORIES = {
    "bus_stop": (['node["highway"="bus_stop"]', 'nwr["amenity"="bus_station"]'],
                 "Sawari ka intezaar karte log, auto/e-rickshaw chalak"),
    "rail": (['nwr["railway"="station"]', 'nwr["public_transport"="station"]'],
             "Coolie, vendors, platform ke bahar sote log"),
    "market": (['nwr["amenity"="marketplace"]', 'nwr["shop"="mall"]', 'nwr["landuse"="retail"]'],
               "Rehri-patri wale, palledar, grahak"),
    "shop": (['nwr["shop"]'], "Dukaan ke bahar thele, delivery pickup"),
    "construction": (['nwr["landuse"="construction"]', 'nwr["building"="construction"]'],
                     "Nirmaan mazdoor"),
    "industrial": (['nwr["landuse"="industrial"]', 'nwr["man_made"="works"]'],
                   "Factory gate guards, loading mazdoor"),
    "guarded": (['nwr["amenity"~"^(bank|atm|hospital|clinic|school|college|university)$"]',
                 'nwr["office"="government"]'],
                "Security guards (din aur raat)"),
    "worship": (['nwr["amenity"="place_of_worship"]'], "Beghar log, bhikshuk, phool-prasad vendors"),
    "fuel": (['nwr["amenity"="fuel"]'], "Pump attendants (raat bhar)"),
    "shelter": (['nwr["social_facility"~"shelter"]', 'nwr["amenity"="shelter"]'],
                "Rain basera / aashray"),
    "residential": (['way["landuse"="residential"]'], "Colony gate guards"),
    "tree": (['node["natural"="tree"]'], None),
    "park": (['nwr["leisure"~"^(park|garden)$"]', 'nwr["landuse"~"^(forest|grass|recreation_ground)$"]',
              'nwr["natural"="wood"]'], None),
    "water": (['nwr["amenity"="drinking_water"]'], "Pyau / paani"),
}


def boundary():
    d = query(f"[out:json][timeout:120];rel({BOUNDARY_REL});out geom;")
    rel = d["elements"][0]
    lines = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
             for m in rel["members"] if m["type"] == "way" and m.get("geometry")]
    return unary_union(list(polygonize(unary_union(lines))))


def fetch_category(sels, bbox):
    s, w, n, e = bbox
    body = "".join(f"{sel}({s},{w},{n},{e});" for sel in sels)
    d = query(f"[out:json][timeout:180];({body});out center tags;")
    feats = []
    for el in d["elements"]:
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        tags = el.get("tags", {})
        feats.append({
            "id": f"{el['type'][0]}{el['id']}",
            "lat": round(lat, 6), "lon": round(lon, 6),
            "name": tags.get("name:en") or tags.get("name"),
            "kind": tags.get("amenity") or tags.get("shop") or tags.get("highway")
                    or tags.get("landuse") or tags.get("railway") or tags.get("leisure"),
        })
    return feats


def main():
    OUT.mkdir(exist_ok=True)
    geom = boundary()
    (OUT / "boundary.geojson").write_text(json.dumps(
        {"type": "Feature", "properties": {"name": "Gwalior", "osm_relation": BOUNDARY_REL},
         "geometry": mapping(geom)}), encoding="utf-8")
    w, s, e, n = geom.bounds
    bbox = (s - 0.005, w - 0.005, n + 0.005, e + 0.005)

    out = {}
    for cat, (sels, who) in CATEGORIES.items():
        feats = fetch_category(sels, bbox)
        out[cat] = {"who": who, "features": feats}
        print(f"{cat:13s} {len(feats):6d}")
    (OUT / "osm_features.json").write_text(json.dumps(out), encoding="utf-8")

    s_, w_, n_, e_ = bbox
    d = query(f'[out:json][timeout:180];way["highway"~"^(trunk|primary|secondary|tertiary)$"]({s_},{w_},{n_},{e_});out geom;')
    roads = [{"class": el["tags"]["highway"], "name": el["tags"].get("name"),
              "coords": [[round(p["lon"], 5), round(p["lat"], 5)] for p in el["geometry"]]}
             for el in d["elements"] if el.get("geometry")]
    (OUT / "roads.json").write_text(json.dumps(roads), encoding="utf-8")
    print(f"{'roads':13s} {len(roads):6d}")

    d = query(f'[out:json][timeout:180];nwr["place"~"^(suburb|neighbourhood|quarter|locality|village|town)$"]({s_},{w_},{n_},{e_});out center tags;')
    places = [{"name": el["tags"].get("name:en") or el["tags"]["name"], "hi": el["tags"].get("name:hi"),
               "place": el["tags"]["place"],
               "lat": el.get("lat") or el["center"]["lat"], "lon": el.get("lon") or el["center"]["lon"]}
              for el in d["elements"] if el.get("tags", {}).get("name")]
    (OUT / "places.json").write_text(json.dumps(places, ensure_ascii=False), encoding="utf-8")
    print(f"{'places':13s} {len(places):6d}")


if __name__ == "__main__":
    main()
