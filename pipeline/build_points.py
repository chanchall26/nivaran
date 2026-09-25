"""Build static point + PIN data for the web app.

Outputs
  web/public/data/points/gwalior.json   exposure points around Shinde Ki Chhawani + city anchors
  web/public/data/points/delhi.json     exposure points around Connaught Place + central Delhi anchors
  web/public/data/points/leh.json       exposure points in Leh town (bus stand, SNM, Main Bazaar)
  web/public/data/pins.json             6-digit PIN -> {lat, lon, name, district, state}

Points are anchored to real OpenStreetMap features (fetched by id from Overpass so the
coordinates are current). Which features to use was decided by ranking the Overpass
candidates near each centre (run `python build_points.py --candidates gwalior|delhi`,
`--candidates leh 4000` for the small town) and then reviewing the list by hand; the
reviewed picks live in PICKS below together with Hindi names, ward labels and
worker-count estimates (the counts are estimates, not OSM data). A pick with osm=None is
a hand-placed point (written with "anchor": "manual").

Every point also carries planting fields for the app's "Where to plant" screen:
street (narrow|open), traffic (busy|some|quiet), shadeNow (none|some|good). They are
reviewed values kept in PICKS; `--planting <city>` prints the OSM evidence they were
judged from (road class / lanes / width within 40 m, tree and park tags within 30 m).

Run:  python build_points.py                 points + pins
      python build_points.py --points-only   points/*.json only (fast, Overpass by id)
      python build_points.py --pins-only     pins.json only (data.gov.in is slow uncached)

PIN coordinates: data.gov.in "All India Pincode Directory" (median of cleaned
coordinates per PIN) when the API answers; otherwise api.postalpincode.in for names
and Nominatim for coordinates.

All HTTP responses are cached under pipeline/cache/ so re-runs are offline and stable.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import re
import statistics
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
OUT_POINTS = ROOT.parent / "web" / "public" / "data" / "points"
OUT_PINS = ROOT.parent / "web" / "public" / "data" / "pins.json"

UA = {"User-Agent": "barahmasa-build/1.0 (hackathon)"}
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# --------------------------------------------------------------------------- http


def _cache_path(kind: str, key: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    return CACHE / f"{kind}_{hashlib.sha1(key.encode()).hexdigest()[:16]}.json"


def overpass(ql: str, tries: int = 8) -> dict:
    p = _cache_path("ovp", ql)
    if p.exists():
        return json.loads(p.read_text("utf-8"))
    last = None
    for i in range(tries):
        url = OVERPASS[i % len(OVERPASS)]
        try:
            r = requests.post(url, data={"data": ql}, headers=UA, timeout=180)
            if r.ok and r.text.lstrip().startswith("{"):
                data = r.json()
                if data.get("remark") and not data.get("elements"):
                    raise RuntimeError(data["remark"][:120])
                p.write_text(r.text, "utf-8")
                return data
            last = f"HTTP {r.status_code}"
        except Exception as e:  # timeouts, resets, bad JSON
            last = str(e)[:120]
        print(f"  overpass retry {i + 1}/{tries} via {url}: {last}", file=sys.stderr)
        time.sleep(3 + 3 * i)
    raise RuntimeError(f"Overpass failed: {last}")


def get_json(kind: str, url: str, params: dict | None = None, *, tries: int = 3,
             pause: float = 0.0):
    key = url + "?" + json.dumps(params or {}, sort_keys=True)
    p = _cache_path(kind, key)
    if p.exists():
        return json.loads(p.read_text("utf-8"))
    last = None
    for i in range(tries):
        if pause:
            time.sleep(pause)
        try:
            r = requests.get(url, params=params, headers=UA, timeout=60)
            if r.status_code == 429:
                last = "429 rate limited"
            elif r.ok:
                data = r.json()
                p.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
                return data
            else:
                last = f"HTTP {r.status_code}"
        except Exception as e:
            last = str(e)[:120]
        time.sleep(2 + 3 * i)
    raise RuntimeError(f"{url}: {last}")


def km(a_lat, a_lon, b_lat, b_lon) -> float:
    r = math.radians
    h = (math.sin(r(b_lat - a_lat) / 2) ** 2
         + math.cos(r(a_lat)) * math.cos(r(b_lat)) * math.sin(r(b_lon - a_lon) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s if len(s) <= 32 else s[:33].rsplit("-", 1)[0]


# --------------------------------------------------------------------------- cities

CITIES = {
    "gwalior": {"center": (26.178647, 78.144908)},
    "delhi": {"center": (28.6315, 77.2167)},
    "leh": {"center": (34.1526, 77.5771)},  # app's Leh preset / PIN 194101
}

# Shorthand people entries
def P(group, count, shift):
    return {"group": group, "count": count, "shift": shift}


# Reviewed picks. Keys: osm, id (short slug), type, name (only when the OSM feature is
# unnamed or its name needs context), nameHi (used when OSM has no name:hi), ward, wardHi,
# people, offers, heater, and the planting fields street / traffic / shadeNow (see
# `--planting`; a comment marks every pick where the hand review overrode the OSM evidence).
# Manual picks: osm=None plus lat / lon / name given here; written with "anchor": "manual".
PICKS = {
    "gwalior": [
        # ---- within 2.5 km of the 474001 centre. OSM is nearly empty for ~1.3 km around
        #      it, so these anchors sit 1.4-2.4 km north (Eidgah / Kampoo / Maharaj Bada).
        #      No fuel station, bus stand or night shelter is mapped inside 2.5 km: the
        #      nearest pump (3.0 km) is listed below, a tempo stand stands in for the bus
        #      stand, and JAH hospital carries the shelter/heater offer.
        # planting override: street: fronts the secondary road 34 m away; nearest way is its
        #   own drive
        dict(osm="node/7016843265", id="upadhyay-hospital", type="hospital",
             name="Upadhyay Hospital and Research Centre",
             nameHi="उपाध्याय हॉस्पिटल एवं रिसर्च सेंटर", ward="Eidgah", wardHi="ईदगाह",
             people=[P("attendant", 12, "night"), P("guard", 1, "night")],
             offers=["water", "shade"], heater="unconfirmed",
             street="open", traffic="busy", shadeNow="none"),
        dict(osm="node/13418898014", id="sbi-atm-eidgah", type="atm", name="SBI ATM, Eidgah",
             nameHi="एसबीआई एटीएम, ईदगाह", ward="Eidgah", wardHi="ईदगाह",
             people=[P("guard", 1, "night")], heater="none",
             street="open", traffic="busy", shadeNow="none"),
        dict(osm="node/8661402417", id="roxy-pul-chauraha", type="signal",
             name="Roxy Pul Chauraha",
             nameHi="रॉक्सी पुल चौराहा", ward="Eidgah", wardHi="ईदगाह",
             people=[P("traffic", 2, "day")],
             street="open", traffic="busy", shadeNow="none"),
        # planting override: street/shade: large campus grounds with old trees (none mapped)
        dict(osm="node/7013200651", id="jaya-arogya-hospital", type="hospital",
             nameHi="जया आरोग्य अस्पताल समूह",
             ward="Kampoo", wardHi="कंपू",
             people=[P("attendant", 40, "night"), P("guard", 2, "night"), P("homeless", 15, "night")],
             offers=["water", "shade", "shelter", "heater"], heater="working",
             street="open", traffic="quiet", shadeNow="some"),
        dict(osm="node/7107499585", id="civil-hospital-hem-singh-parade", type="hospital",
             name="Civil Hospital, Hem Singh Ki Parade",
             nameHi="सिविल अस्पताल, हेमसिंह की परेड", ward="Hem Singh Ki Parade",
             wardHi="हेमसिंह की परेड",
             people=[P("attendant", 14, "night"), P("guard", 1, "night")],
             offers=["water", "shade"], heater="unconfirmed",
             street="narrow", traffic="quiet", shadeNow="none"),
        # planting override: street: old-city bazaar lane although tagged tertiary
        dict(osm="node/13426743111", id="sbi-atm-lala-ka-bazar", type="atm",
             name="SBI ATM, Lala Ka Bazar",
             nameHi="एसबीआई एटीएम, लाला का बाज़ार", ward="Lala Ka Bazar", wardHi="लाला का बाज़ार",
             people=[P("guard", 1, "night")], heater="unconfirmed",
             street="narrow", traffic="some", shadeNow="none"),
        dict(osm="node/13776491633", id="tempo-stand-maharaj-bada", type="bus",
             name="Taxi & Tempo Stand, Maharaj Bada",
             nameHi="टैक्सी व टेम्पो स्टैंड, महाराज बाड़ा", ward="Maharaj Bada", wardHi="महाराज बाड़ा",
             people=[P("vendor", 8, "day"), P("porter", 4, "day"), P("vendor", 3, "night"),
                     P("porter", 2, "night")],
             street="open", traffic="busy", shadeNow="none"),
        # planting override: street/traffic: open plot; Maharaj Bada ring road 45 m away
        dict(osm="way/1551970354", id="parking-site-maharaj-bada", type="construction",
             name="Parking construction site, Maharaj Bada",
             nameHi="पार्किंग निर्माण स्थल, महाराज बाड़ा", ward="Maharaj Bada", wardHi="महाराज बाड़ा",
             people=[P("labour", 32, "day"), P("guard", 1, "night")], heater="failed",
             street="open", traffic="some", shadeNow="none"),
        dict(osm="way/1551970374", id="subhash-market", type="market", nameHi="सुभाष मार्केट",
             ward="Maharaj Bada", wardHi="महाराज बाड़ा", people=[P("vendor", 34, "day")],
             street="narrow", traffic="quiet", shadeNow="none"),
        # planting override: street: old-city lane though tagged tertiary; shade: pyaau shed
        dict(osm="node/12526240310", id="pyaau-mote-ganesh-mandir", type="water",
             name="Pyaau near Mote Ganesh Ji Mandir",
             nameHi="मोटे गणेश जी मंदिर के पास प्याऊ", ward="Maharaj Bada", wardHi="महाराज बाड़ा",
             people=[P("vendor", 6, "day")], offers=["water", "shade"],
             street="narrow", traffic="some", shadeNow="some"),
        # ---- across the city
        # planting override: shade: pump canopy over the islands
        dict(osm="node/13626830689", id="nayara-hanuman-chauraha", type="fuel",
             name="Nayara Petrol Pump, Hanuman Chauraha",
             nameHi="नायरा पेट्रोल पंप, हनुमान चौराहा", ward="Lashkar", wardHi="लश्कर",
             people=[P("worker", 3, "day"), P("worker", 2, "night")], offers=["water"],
             street="open", traffic="busy", shadeNow="some"),
        # planting override: street/traffic/shade: station forecourt (autos, taxis), station
        #   building and platform roofs; the main road is 110 m away
        dict(osm="node/3871559370", id="gwalior-junction", type="rail",
             name="Gwalior Junction Railway Station",
             nameHi="ग्वालियर जंक्शन रेलवे स्टेशन", ward="Padav", wardHi="पड़ाव",
             people=[P("vendor", 25, "day"), P("porter", 30, "day"), P("vendor", 10, "night"),
                     P("porter", 18, "night"), P("homeless", 20, "night")],
             offers=["water", "shade"], heater="unconfirmed",
             street="open", traffic="some", shadeNow="some"),
        # planting override: street/traffic/shade: bus yard with heavy buses; bay sheds
        dict(osm="way/1028161121", id="gwalior-isbt", type="bus",
             nameHi="ग्वालियर अंतरराज्यीय बस स्टैंड",
             ward="Padav", wardHi="पड़ाव",
             people=[P("vendor", 18, "day"), P("porter", 10, "day"), P("vendor", 6, "night"),
                     P("porter", 4, "night")], offers=["water", "shade"],
             street="open", traffic="busy", shadeNow="some"),
        dict(osm="way/380922607", id="padav-chowk", type="signal", name="Padav Chowk",
             nameHi="पड़ाव चौराहा", ward="Padav", wardHi="पड़ाव",
             people=[P("traffic", 2, "day")],
             street="open", traffic="busy", shadeNow="none"),
        dict(osm="node/8720631150", id="hazira-labour-chowk", type="labour",
             name="Hazira Labour Chowk",
             nameHi="हजीरा लेबर चौक", ward="Hazira", wardHi="हजीरा",
             people=[P("labour", 70, "day")],
             street="open", traffic="busy", shadeNow="none"),
        # planting override: no road mapped within 120 m: hand judgement (campus gate,
        #   campus trees)
        dict(osm="node/6467938110", id="mits-main-gate", type="gate",
             name="MITS Gwalior Main Gate",
             nameHi="एमआईटीएस ग्वालियर मुख्य द्वार", ward="Race Course Road", wardHi="रेस कोर्स रोड",
             people=[P("guard", 1, "day"), P("guard", 2, "night")], heater="unconfirmed",
             street="open", traffic="some", shadeNow="some"),
        # ---- added: old-city market lanes and a colony gate
        # planting override: street: tight jewellery lane; the anchor is the way's bbox
        #   centre, 35 m off it
        dict(osm="way/170106691", id="sarafa-bazar", type="market", name="Sarafa Bazar",
             nameHi="सराफ़ा बाज़ार", ward="Sarafa", wardHi="सराफ़ा",
             people=[P("vendor", 30, "day"), P("guard", 8, "night")], heater="unconfirmed",
             street="narrow", traffic="some", shadeNow="none"),
        # the park at the centre of the square (unnamed leisure=park, 110-240 m from the
        # tempo stand / parking site / Subhash Market points)
        # planting override: shade: park trees cover the centre, vendors / police stand at
        #   the edges
        dict(osm="way/1551970381", id="maharaj-bada", type="market",
             name="Maharaj Bada (Jayaji Chowk)", nameHi="महाराज बाड़ा (जयाजी चौक)",
             ward="Maharaj Bada", wardHi="महाराज बाड़ा",
             people=[P("vendor", 60, "day"), P("traffic", 4, "day")], offers=["shade"],
             street="open", traffic="busy", shadeNow="some"),
        # manual: same coordinate as node shyam-gate in web/public/data/gwalior/nodes.json
        # (Google Open Buildings footprints for the shade simulation). Inside the OSM
        # landuse=residential polygon "Raksha Vihar" (way/1144665936); OSM has no ward /
        # locality label within 1.8 km, so the colony itself is the ward label.
        # planting override: shade: no OSM trees, but ESA WorldCover (nodes.json) has 12
        #   tree pixels within 30 m, 4 within 20 m
        dict(osm=None, lat=26.209153, lon=78.1833, id="shyam-gate", type="gate",
             name="Raksha Vihar colony, Gate 2", nameHi="रक्षा विहार कॉलोनी, गेट 2",
             ward="Raksha Vihar", wardHi="रक्षा विहार",
             people=[P("guard", 1, "night"), P("guard", 1, "day")], heater="unconfirmed",
             street="narrow", traffic="quiet", shadeNow="some"),
        # ---- added from the team brief
        # manual: the brief's anchor is the app's preset centre for PIN 474001. Only unnamed
        # residential lanes are mapped around it (nearest 12 m), no feature to anchor to.
        # Planting evidence (quiet / narrow / no trees) matches the brief: a sunny waiting spot.
        dict(osm=None, lat=26.178647, lon=78.144908, id="shinde-chhawani-gates", type="gate",
             name="Shinde Ki Chhawani colony gates", nameHi="शिंदे की छावनी कॉलोनी गेट",
             ward="Shinde Ki Chhawani", wardHi="शिंदे की छावनी",
             people=[P("guard", 6, "night")], heater="unconfirmed",
             street="narrow", traffic="quiet", shadeNow="none"),
        # the 2-lane secondary way named "Janakganj" (brief: near 26.203861, 78.146907)
        # planting override: street: old-city bazaar road lined with shops, although tagged
        #   secondary with 2 lanes
        dict(osm="way/941481584", id="janakganj-market", type="market",
             name="Janakganj market", nameHi="जनकगंज बाज़ार", ward="Janakganj", wardHi="जनकगंज",
             people=[P("vendor", 40, "day")],
             street="narrow", traffic="busy", shadeNow="none"),
        # OSM names the junction via its statue area (tourism=artwork "PhoolBagh Tiraha")
        # planting override: shade: the Phool Bagh park is within 30 m, but the police stand
        #   on the open junction
        dict(osm="way/1086458307", id="phool-bagh-crossing", type="signal",
             name="Phool Bagh crossing", nameHi="फूलबाग चौराहा", ward="Phool Bagh",
             wardHi="फूलबाग", people=[P("traffic", 4, "day")],
             street="open", traffic="busy", shadeNow="some"),
    ],
    "delhi": [
        # ---- within 2.5 km of Connaught Place
        dict(osm="node/249783302", id="cp-outer-circle-signal", type="signal",
             name="Outer Circle - Baba Kharak Singh Marg Signal",
             nameHi="आउटर सर्किल - बाबा खड़क सिंह मार्ग सिग्नल", ward="Connaught Place",
             wardHi="कनॉट प्लेस",
             people=[P("traffic", 2, "day"), P("vendor", 80, "day"), P("guard", 20, "night")],
             heater="unconfirmed",
             street="open", traffic="busy", shadeNow="none"),
        # planting override: street/traffic: bus terminal (nearest ways are its bays)
        dict(osm="way/284192857", id="shivaji-stadium-terminal", type="bus",
             nameHi="शिवाजी स्टेडियम बस टर्मिनल",
             ward="Connaught Place", wardHi="कनॉट प्लेस",
             people=[P("vendor", 14, "day"), P("porter", 3, "day"), P("vendor", 5, "night"),
                     P("porter", 1, "night")], offers=["shade"],
             street="open", traffic="busy", shadeNow="good"),
        # planting override: colonnade on the CP service lane: arcade roof shades the guard
        dict(osm="node/5577533598", id="icici-atm-cp", type="atm",
             name="ICICI Bank ATM, Connaught Place",
             nameHi="आईसीआईसीआई बैंक एटीएम, कनॉट प्लेस", ward="Connaught Place", wardHi="कनॉट प्लेस",
             people=[P("guard", 1, "night")], heater="unconfirmed",
             street="open", traffic="some", shadeNow="good"),
        # planting override: no road within 40 m (underground under Central Park); Radial
        #   Road 1 53 m
        dict(osm="way/1393736849", id="palika-bazar", type="market", nameHi="पालिका बाज़ार",
             ward="Connaught Place", wardHi="कनॉट प्लेस",
             people=[P("vendor", 38, "day"), P("guard", 2, "night")], heater="unconfirmed",
             street="open", traffic="some", shadeNow="good"),
        # planting override: street: open plaza by the park
        dict(osm="node/11703943158", id="water-atm-rajiv-chowk", type="water",
             name="Water ATM, Rajiv Chowk Gate 6",
             nameHi="वॉटर एटीएम, राजीव चौक गेट 6", ward="Connaught Place", wardHi="कनॉट प्लेस",
             people=[P("delivery", 6, "day")], offers=["water"],
             street="open", traffic="some", shadeNow="good"),
        dict(osm="node/6539894851", id="rajiv-chowk-metro", type="rail",
             name="Rajiv Chowk Metro Station",
             nameHi="राजीव चौक मेट्रो स्टेशन", ward="Connaught Place", wardHi="कनॉट प्लेस",
             people=[P("vendor", 20, "day"), P("porter", 4, "day"), P("vendor", 6, "night"),
                     P("porter", 2, "night")], offers=["shade", "water"],
             street="open", traffic="some", shadeNow="none"),
        # planting override: street/shade: wide Lutyens avenue, avenue trees not mapped in
        #   OSM
        dict(osm="node/5368454824", id="bob-atm-janpath", type="atm",
             name="Bank of Baroda ATM, Janpath",
             nameHi="बैंक ऑफ़ बड़ौदा एटीएम, जनपथ", ward="Janpath", wardHi="जनपथ",
             people=[P("guard", 1, "night")], heater="working",
             street="open", traffic="busy", shadeNow="some"),
        # planting override: street/shade: campus forecourt and old campus trees (none
        #   mapped)
        dict(osm="node/7138534287", id="lady-hardinge-hospital", type="hospital",
             nameHi="लेडी हार्डिंग मेडिकल कॉलेज एवं संबद्ध अस्पताल",
             ward="Gole Market", wardHi="गोल मार्केट",
             people=[P("attendant", 24, "night"), P("guard", 2, "night")],
             offers=["water", "shade"], heater="unconfirmed",
             street="open", traffic="quiet", shadeNow="some"),
        # planting override: street: fuel forecourt on BKS Marg; shade: pump canopy
        dict(osm="way/351418890", id="indian-oil-bks-marg", type="fuel",
             name="Indian Oil Petrol Pump, Baba Kharak Singh Marg",
             nameHi="इंडियन ऑयल पेट्रोल पंप, बाबा खड़क सिंह मार्ग", ward="Baba Kharak Singh Marg",
             wardHi="बाबा खड़क सिंह मार्ग",
             people=[P("worker", 4, "day"), P("worker", 2, "night")], offers=["water"],
             street="open", traffic="busy", shadeNow="some"),
        # planting override: street/traffic/shade: station forecourt jammed with taxis and
        #   autos; station building and platform roofs
        dict(osm="node/6131069513", id="new-delhi-railway-station", type="rail",
             name="New Delhi Railway Station",
             ward="Paharganj", wardHi="पहाड़गंज", nameHi="नई दिल्ली रेलवे स्टेशन",
             people=[P("vendor", 40, "day"), P("porter", 45, "day"), P("vendor", 15, "night"),
                     P("porter", 25, "night"), P("homeless", 30, "night")],
             offers=["water", "shade"], heater="unconfirmed",
             street="open", traffic="busy", shadeNow="some"),
        # planting override: no road within 40 m (large site); construction trucks on site
        dict(osm="way/1218426668", id="ccs-construction-site", type="construction",
             name="Common Central Secretariat construction site",
             nameHi="सामान्य केंद्रीय सचिवालय निर्माण स्थल", ward="Central Vista", wardHi="सेंट्रल विस्टा",
             people=[P("labour", 45, "day"), P("guard", 1, "night")], heater="unconfirmed",
             street="open", traffic="some", shadeNow="none"),
        # ---- elsewhere in central Delhi
        # planting override: traffic: handcarts, tempos and e-rickshaws fill the lanes
        dict(osm="node/943749060", id="sadar-bazar", type="market", name="Sadar Bazar",
             ward="Sadar Bazar", wardHi="सदर बाज़ार", nameHi="सदर बाज़ार",
             people=[P("vendor", 40, "day"), P("porter", 25, "day")],
             street="narrow", traffic="some", shadeNow="none"),
        dict(osm="node/3268564739", id="chandni-chowk", type="market", nameHi="चांदनी चौक",
             ward="Chandni Chowk", wardHi="चांदनी चौक", people=[P("vendor", 36, "day")],
             street="open", traffic="some", shadeNow="none"),
        # planting override: street/traffic/shade: bus terminal, heavy buses, concourse roof
        dict(osm="way/40943545", id="kashmere-gate-isbt", type="bus", name="Kashmere Gate ISBT",
             nameHi="कश्मीरी गेट आईएसबीटी", ward="Kashmere Gate", wardHi="कश्मीरी गेट",
             people=[P("vendor", 22, "day"), P("porter", 15, "day"), P("vendor", 8, "night"),
                     P("porter", 6, "night"), P("homeless", 12, "night")],
             offers=["water", "shade"], heater="none",
             street="open", traffic="busy", shadeNow="some"),
        # planting override: street: beside the Ring Road (nearest way is a ramp)
        dict(osm="node/6362609788", id="rain-basera-nigambodh-ghat", type="shelter",
             name="Rain Basera near Nigambodh Ghat",
             nameHi="निगमबोध घाट के पास रैन बसेरा", ward="Yamuna Bazar", wardHi="यमुना बाज़ार",
             people=[P("homeless", 60, "night")], offers=["shelter", "heater"], heater="working",
             street="open", traffic="busy", shadeNow="none"),
        # ---- added: 2.5-12 km out (the app's Delhi pilot radius is 30 km)
        dict(osm="node/838495921", id="ito-crossing", type="signal",
             name="ITO Crossing", nameHi="आईटीओ चौराहा", ward="ITO", wardHi="आईटीओ",
             people=[P("traffic", 6, "day")],
             street="open", traffic="busy", shadeNow="none"),
        # public_transport=station (no amenity=bus_station tag, so --candidates misses it)
        # planting override: street/traffic/shade: bus terminal, heavy buses, bay sheds
        dict(osm="way/52081141", id="anand-vihar-isbt", type="bus", name="Anand Vihar ISBT",
             nameHi="आनंद विहार आईएसबीटी", ward="Anand Vihar", wardHi="आनंद विहार",
             people=[P("vendor", 25, "day"), P("porter", 20, "day"), P("porter", 10, "night"),
                     P("driver", 30, "night"), P("homeless", 25, "night")],
             offers=["water", "shade"], heater="none",
             street="open", traffic="busy", shadeNow="some"),
        # AIIMS has no campus-wide amenity=hospital feature: anchored to the Emergency node,
        # ~170 m in from Aurobindo Marg and ~220 m from the AIIMS metro / subway where
        # patients' families sleep
        # planting override: campus 170 m in from Aurobindo Marg: open grounds, ambulances,
        #   building and campus-tree shade (none mapped)
        dict(osm="node/7130306819", id="aiims-new-delhi", type="hospital", name="AIIMS New Delhi",
             nameHi="एम्स नई दिल्ली", ward="Ansari Nagar", wardHi="अंसारी नगर",
             people=[P("attendant", 150, "night"), P("guard", 4, "night"), P("homeless", 40, "night")],
             offers=["water", "shade"], heater="unconfirmed",
             street="open", traffic="some", shadeNow="some"),
        # the landuse=retail area "Azadpur Fruit and Vegetable Market" (admin_level 10
        # boundary). The brief's point, node/13146724916 "Azadpur Mandi Office" at
        # 28.721893, 77.164922, lies 680 m outside it (34 m outside the adjoining
        # "Fruit Market" area); the relation centre is inside the market, 45 m from its edge.
        # Porters (loaders) start at 3 am, so they count as night.
        # planting override: street/traffic: only internal lanes within 40 m, but the anchor
        #   sits in open truck yards with heavy truck traffic all night
        dict(osm="relation/3888865", id="azadpur-mandi", type="market", name="Azadpur Mandi",
             nameHi="आज़ादपुर मंडी", ward="Azadpur", wardHi="आज़ादपुर",
             people=[P("porter", 200, "night"), P("vendor", 100, "day")],
             street="open", traffic="busy", shadeNow="none"),
    ],
    "leh": [
        # Leh is small: the anchors run 0-1.5 km north from the PIN 194101 point (Indian Oil
        # pump on the Leh-Manali road) to Main Bazaar. Not mapped in OSM within 8 km: a
        # current construction site, a labour chowk, a night shelter.
        # planting override: pedestrianised wide bazaar (vehicles only on the Fort Road loop
        #   22 m away); a small park is mapped within 30 m but the bazaar is mostly open
        dict(osm="way/39663140", id="leh-main-bazaar", type="market", name="Leh Main Bazaar",
             nameHi="लेह मेन बाज़ार", ward="Main Bazaar", wardHi="मेन बाज़ार",
             people=[P("vendor", 40, "day"), P("guard", 6, "night")], heater="unconfirmed",
             street="open", traffic="some", shadeNow="some"),
        # planting override: street: hospital compound (nearest way is a drive)
        dict(osm="way/27761109", id="snm-hospital", type="hospital",
             name="SNM Hospital (Sonam Norboo Memorial)",
             nameHi="एसएनएम अस्पताल (सोनम नोरबू मेमोरियल)", ward="Khardung La Road", wardHi="खारदुंग ला रोड",
             people=[P("attendant", 20, "night"), P("guard", 2, "night")],
             offers=["water", "shelter"], heater="working",
             street="open", traffic="quiet", shadeNow="none"),
        # planting override: street/traffic: open bus yard, buses in and out
        dict(osm="way/1086524216", id="leh-bus-stand", type="bus", name="Leh Bus Stand",
             nameHi="लेह बस स्टैंड", ward="Bus Stand Road", wardHi="बस स्टैंड रोड",
             people=[P("vendor", 12, "day"), P("porter", 4, "day"), P("driver", 18, "night"),
                     P("porter", 3, "night")], offers=["water"], heater="none",
             street="open", traffic="some", shadeNow="none"),
        # planting override: no road within 40 m (large lot); unnamed tertiary 50 m
        dict(osm="way/924161852", id="leh-taxi-stand", type="bus",
             name="New Taxi Stand (All Ladakh Taxi Union)",
             nameHi="न्यू टैक्सी स्टैंड (ऑल लद्दाख टैक्सी यूनियन)",
             ward="Housing Colony", wardHi="हाउसिंग कॉलोनी",
             people=[P("driver", 30, "day"), P("driver", 8, "night")], heater="none",
             street="open", traffic="some", shadeNow="none"),
        dict(osm="node/1444104284", id="sbi-leh", type="bank", name="State Bank of India, Leh",
             nameHi="भारतीय स्टेट बैंक, लेह", ward="Zorawar Fort Road", wardHi="ज़ोरावर फ़ोर्ट रोड",
             people=[P("guard", 1, "night")], heater="working",
             street="open", traffic="some", shadeNow="none"),
        dict(osm="node/11200263286", id="sbi-atm-old-leh-road", type="atm",
             name="SBI ATM, Old Leh Road", nameHi="एसबीआई एटीएम, ओल्ड लेह रोड",
             ward="Old Leh Road", wardHi="ओल्ड लेह रोड",
             people=[P("guard", 1, "night")], heater="unconfirmed",
             street="open", traffic="some", shadeNow="none"),
        dict(osm="node/3253371336", id="jk-bank-skalzangling", type="bank",
             name="J&K Bank, Skalzangling", nameHi="जे एंड के बैंक, स्कलज़ांगलिंग",
             ward="Skalzangling", wardHi="स्कलज़ांगलिंग",
             people=[P("guard", 1, "night")], heater="none",
             street="open", traffic="busy", shadeNow="none"),
        # planting override: traffic: Old Fort Road carries taxis to the bazaar (part of it
        #   is tagged secondary)
        dict(osm="node/2575504257", id="axis-bank-old-fort-road", type="bank",
             name="Axis Bank, Old Fort Road", nameHi="एक्सिस बैंक, ओल्ड फ़ोर्ट रोड",
             ward="Old Fort Road", wardHi="ओल्ड फ़ोर्ट रोड",
             people=[P("guard", 1, "night")], heater="failed",
             street="narrow", traffic="some", shadeNow="none"),
        # planting override: street: fuel forecourt on the primary road; shade: pump canopy
        dict(osm="node/299707352", id="indian-oil-leh", type="fuel",
             name="Indian Oil Petrol Pump, Leh", nameHi="इंडियन ऑयल पेट्रोल पंप, लेह",
             ward="Khardung La Road", wardHi="खारदुंग ला रोड",
             people=[P("worker", 3, "day"), P("worker", 2, "night"), P("guard", 1, "night")],
             offers=["water"], heater="unconfirmed",
             street="open", traffic="busy", shadeNow="some"),
        dict(osm="node/2417355299", id="dzomsa-fort-road", type="water",
             name="Dzomsa water refill, Fort Road", nameHi="ज़ोमसा पानी रिफ़िल, फ़ोर्ट रोड",
             ward="Fort Road", wardHi="फ़ोर्ट रोड",
             people=[P("vendor", 6, "day"), P("porter", 4, "day")], offers=["water"],
             street="open", traffic="some", shadeNow="good"),
        dict(osm="node/3700290454", id="leh-veg-fruit-market", type="market",
             name="Vegetable & Fruit Market, Leh", nameHi="सब्ज़ी व फल मंडी, लेह",
             ward="Zorawar Fort Road", wardHi="ज़ोरावर फ़ोर्ट रोड",
             people=[P("vendor", 20, "day")],
             street="open", traffic="some", shadeNow="none"),
        # node "Public market" (shop=supermarket) on the Manali-Leh highway, ~6 km SE of
        # the Leh centre, next to the Choglamsar bus stop
        dict(osm="node/5022305021", id="choglamsar-market", type="market",
             name="Choglamsar market", nameHi="चोगलमसर बाज़ार", ward="Choglamsar",
             wardHi="चोगलमसर", people=[P("labour", 30, "day")],
             street="open", traffic="busy", shadeNow="none"),
    ],
}

TYPES = {"atm", "bank", "hospital", "bus", "rail", "market", "fuel", "signal", "construction",
         "shelter", "labour", "gate", "water"}
GROUPS = {"guard", "attendant", "vendor", "porter", "labour", "traffic", "worker", "homeless",
          "delivery", "driver"}
OFFERS = {"shade", "water", "shelter", "heater"}
HEATERS = {"none", "unconfirmed", "working", "failed"}
# groups whose night shift makes a heater status meaningful (drivers sleep in their vehicles)
NIGHT_HEATER_GROUPS = {"guard", "homeless", "driver"}
STREETS = {"narrow", "open"}
TRAFFIC = {"busy", "some", "quiet"}
SHADE = {"none", "some", "good"}
PLANTING_NOTE = ("street / traffic / shadeNow are reviewed estimates from OSM road class and tree "
                 "tags plus hand review")


def fetch_elements(osm_ids: list[str]) -> dict[str, dict]:
    if not osm_ids:
        return {}
    by_type: dict[str, list[str]] = {}
    for oid in osm_ids:
        t, i = oid.split("/")
        by_type.setdefault(t, []).append(i)
    body = "".join(f"{t}(id:{','.join(sorted(ids))});" for t, ids in sorted(by_type.items()))
    data = overpass(f"[out:json][timeout:120];({body});out center tags;")
    out = {}
    for e in data["elements"]:
        lat = e.get("lat", e.get("center", {}).get("lat"))
        lon = e.get("lon", e.get("center", {}).get("lon"))
        out[f"{e['type']}/{e['id']}"] = {"lat": lat, "lon": lon, "tags": e.get("tags", {})}
    return out


def resolve(city: str) -> list[tuple[dict, str, str, float, float]]:
    """(pick, name, nameHi, lat, lon) for every pick. OSM picks take their coordinates (and
    name / name:hi unless the pick overrides them) from the live feature; manual picks
    (osm=None) carry lat / lon / name / nameHi themselves."""
    picks = PICKS[city]
    els = fetch_elements([p["osm"] for p in picks if p.get("osm")])
    out = []
    for p in picks:
        if not p.get("osm"):
            assert p.get("name") and p.get("lat") is not None and p.get("lon") is not None, p
            out.append((p, p["name"], p["nameHi"], p["lat"], p["lon"]))
            continue
        el = els.get(p["osm"])
        if el is None or el["lat"] is None:
            raise SystemExit(f"{city}: {p['osm']} no longer exists in OSM - re-review PICKS")
        tags = el["tags"]
        name = p.get("name") or tags.get("name:en") or tags.get("name")
        name_hi = tags.get("name:hi") if not p.get("name") and tags.get("name:hi") else p["nameHi"]
        out.append((p, name, name_hi, el["lat"], el["lon"]))
    return out


def build_city(city: str, built: str) -> dict:
    clat, clon = CITIES[city]["center"]
    points, ids = [], set()
    for p, name, name_hi, lat, lon in resolve(city):
        pid = base = p.get("id") or slug(name)
        n = 2
        while pid in ids:
            pid, n = f"{base}-{n}", n + 1
        ids.add(pid)
        pt = {
            "id": pid, "name": name, "nameHi": name_hi,
            "lat": round(lat, 6), "lon": round(lon, 6),
            "type": p["type"], "ward": p["ward"], "wardHi": p["wardHi"],
            "people": p["people"],
        }
        if p.get("offers"):
            pt["offers"] = p["offers"]
        if p.get("heater"):
            pt["heater"] = p["heater"]
        pt["street"], pt["traffic"], pt["shadeNow"] = p["street"], p["traffic"], p["shadeNow"]
        if p.get("osm"):
            pt["osm"] = p["osm"]
        else:
            pt["anchor"] = "manual"
        validate(city, pt)
        points.append(pt)

    # spacing check: no two points closer than ~80 m
    for i, a in enumerate(points):
        for b in points[i + 1:]:
            d = km(a["lat"], a["lon"], b["lat"], b["lon"]) * 1000
            if d < 80:
                raise SystemExit(f"{city}: {a['id']} and {b['id']} only {d:.0f} m apart")

    for pt in points:
        print(f"  {city:8s} {km(clat, clon, pt['lat'], pt['lon']):5.2f} km  {pt['type']:12s} "
              f"{pt['street']:6s} {pt['traffic']:5s} {pt['shadeNow']:4s}  {pt['name']}")
    source = "OpenStreetMap (Overpass) anchors; people counts are estimates"
    if any(pt.get("anchor") == "manual" for pt in points):
        source += "; points with anchor 'manual' are hand-placed (see PICKS for their origin)"
    return {
        "meta": {"city": city, "center": [clat, clon], "source": source,
                 "planting": PLANTING_NOTE, "built": built},
        "points": points,
    }


def validate(city: str, pt: dict) -> None:
    where = f"{city}/{pt['id']}"
    assert pt["type"] in TYPES, where
    assert pt["name"] and pt["id"], where
    assert -90 <= pt["lat"] <= 90 and -180 <= pt["lon"] <= 180, where
    assert re.search(r"[ऀ-ॿ]", pt["nameHi"]) and re.search(r"[ऀ-ॿ]", pt["wardHi"]), where
    assert pt["people"], where
    for pe in pt["people"]:
        assert pe["group"] in GROUPS and pe["shift"] in ("day", "night") and pe["count"] > 0, where
    assert set(pt.get("offers", [])) <= OFFERS, where
    if "heater" in pt:
        assert pt["heater"] in HEATERS, where
        assert any(pe["group"] in NIGHT_HEATER_GROUPS and pe["shift"] == "night" for pe in pt["people"]), where
    assert pt.get("street") in STREETS, f"{where}: street"
    assert pt.get("traffic") in TRAFFIC, f"{where}: traffic"
    assert pt.get("shadeNow") in SHADE, f"{where}: shadeNow"
    assert ("osm" in pt) != ("anchor" in pt), f"{where}: needs exactly one of osm / anchor"
    if "osm" in pt:
        assert re.fullmatch(r"(node|way|relation)/\d+", pt["osm"]), where
    else:
        assert pt["anchor"] == "manual", where


# --------------------------------------------------------------------------- candidates
# Discovery helper used to choose PICKS: ranks nearby OSM features by type priority,
# name presence and distance. Not used for the output itself.

SCORE_SELECTORS = {
    "hospital": 'nwr[amenity=hospital]', "atm": 'nwr[amenity=atm]', "bank": 'nwr[amenity=bank]',
    "bus": 'nwr[amenity=bus_station]', "rail": 'nwr[railway=station]', "fuel": 'nwr[amenity=fuel]',
    "market": 'nwr[amenity=marketplace]', "water": 'nwr[amenity=drinking_water]',
    "shelter": 'nwr[social_facility~shelter]', "signal": 'node[highway=traffic_signals]',
    "construction": 'nwr[landuse=construction]', "taxi": 'nwr[amenity=taxi]',
    "market_street": 'way[highway=pedestrian][name~"bazaa?r|market",i]',
}


def candidates(city: str, radius: int = 2500) -> None:
    """Rank candidate anchors. Use a bigger radius for small towns, e.g. `--candidates leh 4000`."""
    clat, clon = CITIES[city]["center"]
    body = "".join(f"{s}(around:{radius},{clat},{clon});" for s in SCORE_SELECTORS.values())
    data = overpass(f"[out:json][timeout:180];({body});out center tags;")
    rows = []
    for e in data["elements"]:
        t = e.get("tags", {})
        lat = e.get("lat", e.get("center", {}).get("lat"))
        lon = e.get("lon", e.get("center", {}).get("lon"))
        d = km(clat, clon, lat, lon)
        named = bool(t.get("name") or t.get("brand") or t.get("operator"))
        score = (2 if t.get("name") else 1 if named else 0) + (1 if t.get("name:hi") else 0) - d / 2.5
        rows.append((round(score, 2), round(d, 2), f"{e['type']}/{e['id']}", t.get("name", ""),
                     t.get("amenity") or t.get("railway") or t.get("highway") or t.get("landuse")))
    for r in sorted(rows, reverse=True)[:80]:
        print(*r, sep=" | ")


# --------------------------------------------------------------------------- planting evidence
# Evidence helper used to review the street / traffic / shadeNow fields in PICKS (run
# `python build_points.py --planting <city>`). Like --candidates it only prints; the
# reviewed values live in PICKS so builds stay stable.

ROAD_RANK = {  # highway class -> (rank, traffic)
    "motorway": (6, "busy"), "trunk": (6, "busy"), "primary": (5, "busy"),
    "secondary": (4, "busy"), "tertiary": (3, "some"), "unclassified": (2, "quiet"),
    "residential": (1, "quiet"), "living_street": (1, "quiet"), "service": (1, "quiet"),
    "pedestrian": (1, "quiet"), "footway": (0, "quiet"), "path": (0, "quiet"),
    "steps": (0, "quiet"), "track": (0, "quiet"), "cycleway": (0, "quiet"),
}
ROAD_M, GREEN_M = 40, 30


def _xy(lat0: float, lat: float, lon: float, lon0: float) -> tuple[float, float]:
    return ((lon - lon0) * 111320 * math.cos(math.radians(lat0)), (lat - lat0) * 110540)


def _dist_to_geom(lat0: float, lon0: float, geom: list[dict], closed: bool) -> float:
    """Metres from (lat0, lon0) to a polyline, or 0 if inside a closed ring."""
    pts = [_xy(lat0, g["lat"], g["lon"], lon0) for g in geom if g]
    if len(pts) == 1:
        return math.hypot(*pts[0])
    best, inside = float("inf"), False
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        dx, dy = x2 - x1, y2 - y1
        t = max(0.0, min(1.0, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy or 1)))
        best = min(best, math.hypot(x1 + t * dx, y1 + t * dy))
        if closed and (y1 > 0) != (y2 > 0) and 0 < x1 + (0 - y1) * dx / (dy or 1e-12):
            inside = not inside
    return 0.0 if inside else best


def _geoms(e: dict) -> list[tuple[list[dict], bool]]:
    if e["type"] == "node":
        return [([{"lat": e["lat"], "lon": e["lon"]}], False)]
    if e["type"] == "way":
        g = e.get("geometry", [])
        return [(g, len(g) > 3 and g[0] == g[-1])]
    return [(g, len(g) > 3 and g[0] == g[-1])
            for m in e.get("members", []) if (g := m.get("geometry"))]


def planting(city: str) -> None:
    rows = [(p, name, lat, lon) for p, name, _, lat, lon in resolve(city)]
    body = ""
    for _, _, lat, lon in rows:
        body += (f"way[highway](around:{ROAD_M},{lat:.6f},{lon:.6f});"
                 f"nwr[natural~\"^(tree|tree_row|wood|scrub)$\"](around:{GREEN_M},{lat:.6f},{lon:.6f});"
                 f"nwr[landuse~\"^(forest|grass|meadow|orchard|village_green|recreation_ground)$\"]"
                 f"(around:{GREEN_M},{lat:.6f},{lon:.6f});"
                 f"nwr[leisure~\"^(park|garden)$\"](around:{GREEN_M},{lat:.6f},{lon:.6f});")
    data = overpass(f"[out:json][timeout:180];({body});out geom;")
    for p, name, lat, lon in rows:
        roads, green = [], []
        for e in data["elements"]:
            t = e.get("tags", {})
            d = min((_dist_to_geom(lat, lon, g, c) for g, c in _geoms(e) if g), default=1e9)
            if "highway" in t and e["type"] == "way" and d <= ROAD_M:
                roads.append((d, t))
            elif "highway" not in t and d <= GREEN_M:
                green.append((d, t.get("natural") or t.get("landuse") or t.get("leisure")))
        roads.sort(key=lambda r: r[0])
        top = max(roads, key=lambda r: ROAD_RANK.get(r[1]["highway"], (0, ""))[0], default=None)
        traffic = ROAD_RANK.get(top[1]["highway"], (0, "quiet"))[1] if top else "quiet?"
        near = roads[0][1] if roads else {}
        wide = (ROAD_RANK.get(near.get("highway"), (0,))[0] >= 3
                or int(re.sub(r"\D.*", "", near.get("lanes", "0")) or 0) >= 2
                or float(re.sub(r"[^\d.].*", "", near.get("width", "0")) or 0) >= 7)
        street = ("open" if wide else "narrow") if near else "open?"
        trees = sum(1 for _, k in green if k in ("tree", "tree_row"))
        areas = sorted({k for _, k in green if k not in ("tree", "tree_row")})
        shade = "good" if trees >= 4 or areas else "some" if trees else "none"
        print(f"{p.get('id') or slug(name):32s} traffic={traffic:6s} street={street:6s} "
              f"shade={shade:5s} | reviewed {p.get('traffic', '-')}/{p.get('street', '-')}/"
              f"{p.get('shadeNow', '-')}")
        for d, t in roads[:5]:
            print(f"      {d:4.0f} m  {t['highway']:13s} lanes={t.get('lanes', '-'):2s} "
                  f"width={t.get('width', '-'):4s} {t.get('name', '')}")
        if green:
            print(f"      green within {GREEN_M} m: {trees} tree nodes/rows, areas {areas or '-'}")


# --------------------------------------------------------------------------- PINs

DGI_URL = "https://api.data.gov.in/resource/5c2f62fe-5afa-4119-a499-fec9d604d5bd"
DGI_KEY = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b"  # public sample key

# Each region: how to pull it from data.gov.in, which PIN ranges to enumerate in the
# fallback, a sanity bbox for coordinates, and a PIN/district/state filter. Gwalior and
# Leh keep every PIN of the district (e.g. 475110 Dabra), not only 4740xx / 1941xx.
REGIONS = {
    "gwalior": {"dgi": ("filters[district]", "GWALIOR"),
                "ranges": [range(474001, 474100), range(475001, 475400)],
                "bbox": (25.6, 26.6, 77.6, 78.6),
                "keep": lambda pin, district, state: pin[:3] in ("474", "475")
                and "gwalior" in district.lower()},
    "delhi": {"dgi": ("filters[statename]", "DELHI"),
              "ranges": [range(110001, 110100)],
              "bbox": (28.4, 28.9, 76.8, 77.4),
              "keep": lambda pin, district, state: pin.startswith("1100") and "delhi" in state.lower()},
    "leh": {"dgi": ("filters[district]", "LEH"),
            "ranges": [range(194101, 194500)],
            "bbox": (32.5, 35.7, 75.5, 80.0),
            "keep": lambda pin, district, state: pin.startswith("194") and "leh" in district.lower()},
}

REQUIRED_PINS = {
    "474001": {"lat": 26.178647, "lon": 78.144908, "name": "Shinde Ki Chhawani",
               "nameHi": "शिंदे की छावनी", "district": "Gwalior", "state": "Madhya Pradesh"},
    "110001": {"lat": 28.6315, "lon": 77.2167, "name": "Connaught Place",
               "nameHi": "कनॉट प्लेस", "district": "New Delhi", "state": "Delhi"},
    "194101": {"lat": 34.1526, "lon": 77.5771, "name": "Leh", "nameHi": "लेह",
               "district": "Leh", "state": "Ladakh"},
}

# data.gov.in officetype: HO head office, PO sub office, BO branch office
OFFICE_RANK = {"ho": 0, "head post office": 0, "po": 1, "so": 1, "sub post office": 1}


def in_bbox(lat, lon, bbox) -> bool:
    s, n, w, e = bbox
    return s <= lat <= n and w <= lon <= e


KEEP_CAPS = {"IARI", "JNU", "IGNOU", "NDC", "NDHO", "CRPF", "GPO", "NSIT", "ITO", "MAF", "ESI",
             "CVD", "CRRI", "FFC", "SRT", "NGT", "RML", "CAT", "II", "III", "IV", "VI", "VII",
             "VIII", "IX", "XI", "XII"}


def clean_name(n: str) -> str:
    """'Antri S.O (Gwalior' -> 'Antri', 'Patel Nagar SO Central Delhi' -> 'Patel Nagar',
    'GWALIOR CITY SO' -> 'Gwalior City', 'Gwalior R.S. S.O' -> 'Gwalior Railway Station'."""
    n = re.sub(r"\s+", " ", n).strip()
    n = re.sub(r"\s\((gwalior|delhi|leh)\)?$", "", n, flags=re.I)
    n = re.sub(r"\s(H\.?\s?O|S\.?\s?O|B\.?\s?O|P\.?\s?O)\.?(\s.*)?$", "", n, flags=re.I)
    n = re.sub(r"(?<=\S)\s(South|North|East|West|Central|New|North West|North East|South West"
               r"|South East)\sDelhi$", "", n, flags=re.I)
    n = n.strip(" .-")
    n = re.sub(r"\bR\.\s?S$", "Railway Station", n)
    n = re.sub(r"\bA\.\s?F$", "Air Force", n)
    if (n.isupper() and not (" " not in n and len(n) <= 4)) or n.islower():  # keep 'AGCR', 'COD'
        n = " ".join(w if w.upper() in KEEP_CAPS else w.title() for w in n.split(" "))
    return n


def norm_district(district: str, region: str) -> str:
    if region == "leh":
        return "Leh"
    d = district.strip().title()
    if region == "delhi" and "delhi" not in d.lower() and d.lower() != "shahdara":
        d = f"{d} Delhi"
    return d


def norm_state(state: str, region: str) -> str:
    return {"leh": "Ladakh", "delhi": "Delhi"}.get(region) or state.strip().title()


def dgi_page(params: dict, tries: int = 25) -> dict:
    """One data.gov.in page. The shared sample key is rate limited (429 for ~1-2 min at a
    time), so wait it out instead of giving up."""
    p = _cache_path("dgi", DGI_URL + "?" + json.dumps(params, sort_keys=True))
    if p.exists():
        return json.loads(p.read_text("utf-8"))
    last = None
    for i in range(tries):
        try:
            r = requests.get(DGI_URL, params={"api-key": DGI_KEY, "format": "json", **params},
                             headers=UA, timeout=60)
            if r.status_code == 429:
                last = "429 rate limited"
                print(f"  data.gov.in rate limited, waiting ({i + 1}/{tries})", file=sys.stderr)
                time.sleep(20)
                continue
            d = r.json()
            if r.ok and "records" in d:
                p.write_text(json.dumps(d, ensure_ascii=False), "utf-8")
                time.sleep(0.3)
                return d
            last = f"HTTP {r.status_code} {str(d)[:100]}"
        except Exception as e:
            last = str(e)[:120]
        time.sleep(5)
    raise RuntimeError(f"data.gov.in: {last}")


def datagov_records() -> list[tuple[str, dict]]:
    recs = []
    for region, cfg in REGIONS.items():
        fkey, fval = cfg["dgi"]
        offset = 0
        while True:  # the sample key caps pages at 10 records
            d = dgi_page({"limit": 10, "offset": offset, fkey: fval})
            batch = d["records"]
            recs += [(region, r) for r in batch]
            offset += len(batch)
            if not batch or offset >= int(d.get("total", 0)):
                break
    return recs


def nominatim(params: dict) -> list:
    return get_json("nom", "https://nominatim.openstreetmap.org/search",
                    {**params, "format": "json", "limit": 5}, tries=3, pause=1.1)


def geocode_pin(pin: str, names: list[str], district: str, state: str, bbox) -> tuple | None:
    """Nominatim: the OSM postcode centroid first, then the office names (also tried
    without spaces: 'Birla Nagar' is 'Birlanagar' in OSM). Hits outside the region bbox
    are ignored; network failures count as no hit (they are not cached, so a re-run
    retries them)."""
    queries = [{"postalcode": pin, "country": "in"}]
    for n in list(dict.fromkeys(names))[:2]:
        queries.append({"q": f"{n}, {district}, {state}", "countrycodes": "in"})
        if " " in n:
            queries.append({"q": f"{n.replace(' ', '')}, {district}", "countrycodes": "in"})
    for qp in queries:
        try:
            hits = nominatim(qp)
        except RuntimeError as e:
            print(f"  nominatim failed for {pin} ({e})", file=sys.stderr)
            continue
        for h in hits:
            la, lo = float(h["lat"]), float(h["lon"])
            if in_bbox(la, lo, bbox):
                return la, lo
    return None


def pins_from_datagov() -> tuple[dict, list, list]:
    """Median of cleaned coordinates per PIN.

    Cleaning: drop NA / zero values, un-swap lat/lon typed the wrong way round, drop values
    outside the region bbox, and drop placeholder coordinates (the exact same lat/lon used
    by 3+ different PINs - e.g. 26.178647,78.144908 is shared by ten Gwalior-district PINs
    from Lashkar to Dabra). The median is re-taken without points > 10 km from the first one.

    In Gwalior and Leh every head/sub office carries a placeholder, so only rural branch
    offices keep real coordinates and their median lands out in the villages (474006 Morar
    came out 11 km east of Morar). So when the head/sub office that names the PIN has only
    a placeholder, the PIN is geocoded with Nominatim (postcode, then office name) and the
    median of the remaining offices is only the fallback."""
    grouped: dict[str, list] = {}
    for region, r in datagov_records():
        pin = str(r.get("pincode", "")).strip().split(".")[0]
        if REGIONS[region]["keep"](pin, str(r.get("district", "")), str(r.get("statename", ""))):
            grouped.setdefault(pin, []).append((region, r))

    def coord(r, bbox):
        try:
            la, lo = float(r.get("latitude")), float(r.get("longitude"))
        except (TypeError, ValueError):
            return None
        if not (la and lo):
            return None
        if not in_bbox(la, lo, bbox) and in_bbox(lo, la, bbox):
            la, lo = lo, la
        return (round(la, 6), round(lo, 6)) if in_bbox(la, lo, bbox) else None

    def is_main(r) -> bool:  # head office (HO) or sub office (PO), not a village branch (BO)
        return str(r.get("officetype", "")).upper() in ("HO", "PO")

    users: dict[tuple, set] = {}
    for pin, rs in grouped.items():
        for region, r in rs:
            if c := coord(r, REGIONS[region]["bbox"]):
                users.setdefault((round(c[0], 5), round(c[1], 5)), set()).add(pin)
    placeholders = {c for c, pins in users.items() if len(pins) >= 3}

    out, geocoded, missing = {}, [], []
    for pin, rs in sorted(grouped.items()):
        if pin in REQUIRED_PINS:
            continue
        region = rs[0][0]
        cfg = REGIONS[region]
        rs.sort(key=lambda x: (OFFICE_RANK.get(str(x[1].get("officetype", "")).lower(), 2),
                               str(x[1].get("delivery", "")).lower() != "delivery",
                               str(x[1].get("officename", ""))))
        best = rs[0][1]
        rec = {"name": clean_name(str(best.get("officename", ""))),
               "district": norm_district(str(best.get("district", "")), region),
               "state": norm_state(str(best.get("statename", "")), region)}
        good = [(r, c) for _, r in rs if (c := coord(r, cfg["bbox"]))
                and (round(c[0], 5), round(c[1], 5)) not in placeholders]
        pts = [c for _, c in good]
        mains = [r for _, r in rs if is_main(r)]
        hit = None
        # geocode when nothing is usable, or when the head/sub office that names the PIN
        # has only a placeholder (then the usable points are outlying villages)
        if not pts or (is_main(best) and not any(r is best for r, _ in good)):
            names = [clean_name(str(r.get("officename", ""))) for r in (mains or [r for _, r in rs])]
            hit = geocode_pin(pin, names, rec["district"], rec["state"], cfg["bbox"])
        if hit:
            geocoded.append(pin)
            lat, lon = hit
        elif pts:
            mlat = statistics.median(p[0] for p in pts)
            mlon = statistics.median(p[1] for p in pts)
            near = [p for p in pts if km(mlat, mlon, *p) <= 10] or pts
            lat, lon = statistics.median(p[0] for p in near), statistics.median(p[1] for p in near)
        else:
            missing.append(pin)
            continue
        out[pin] = {"lat": round(lat, 5), "lon": round(lon, 5), **rec}
    return out, geocoded, missing


def pins_from_fallback() -> tuple[dict, list]:
    out, missing = {}, []
    for region, cfg in REGIONS.items():
        for rg in cfg["ranges"]:
            for pin in map(str, rg):
                d = get_json("ppi", f"https://api.postalpincode.in/pincode/{pin}", tries=3)
                offices = (d[0].get("PostOffice") or []) if isinstance(d, list) and d else []
                offices = [o for o in offices
                           if cfg["keep"](pin, o.get("District", ""), o.get("State", ""))]
                if not offices or pin in REQUIRED_PINS:
                    continue
                offices.sort(key=lambda o: (OFFICE_RANK.get(o.get("BranchType", "").lower(), 2),
                                            o.get("DeliveryStatus") != "Delivery", o["Name"]))
                best = offices[0]
                rec = {"name": clean_name(best["Name"]),
                       "district": norm_district(best["District"], region),
                       "state": norm_state(best["State"], region)}
                hit = geocode_pin(pin, [o["Name"] for o in offices], best["District"],
                                  rec["state"], cfg["bbox"])
                if not hit:
                    missing.append(pin)
                    continue
                out[pin] = {"lat": round(hit[0], 5), "lon": round(hit[1], 5), **rec}
    return out, missing


def build_pins() -> tuple[dict, str, list]:
    try:
        pins, geocoded, missing = pins_from_datagov()
        if len(pins) < 20:
            raise RuntimeError(f"only {len(pins)} PINs with coordinates")
        source = ("data.gov.in All India Pincode Directory (India Post): names, districts and "
                  "median of cleaned lat/lon per PIN (placeholder coordinates removed)")
        if geocoded:
            source += (f"; {len(geocoded)} PINs whose post offices had only placeholder "
                       "coordinates geocoded via Nominatim/OpenStreetMap")
        print(f"  geocoded via Nominatim: {', '.join(geocoded) or '-'}")
    except Exception as e:
        print(f"  data.gov.in unavailable ({e}); using postalpincode.in + Nominatim", file=sys.stderr)
        pins, missing = pins_from_fallback()
        source = ("api.postalpincode.in (India Post office names) + Nominatim/OpenStreetMap "
                  "geocoding (coordinates); data.gov.in API unavailable")
    pins.update(REQUIRED_PINS)
    return dict(sorted(pins.items())), source, missing


# --------------------------------------------------------------------------- main


USAGE = """usage: python build_points.py [--points-only | --pins-only]
       python build_points.py --candidates <city> [radius_m]
       python build_points.py --planting <city>"""


def write_points() -> None:
    built = dt.date.today().isoformat()
    OUT_POINTS.mkdir(parents=True, exist_ok=True)
    for city in CITIES:
        data = build_city(city, built)
        (OUT_POINTS / f"{city}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
        print(f"wrote points/{city}.json ({len(data['points'])} points)")


def write_pins() -> None:
    pins, source, missing = build_pins()
    OUT_PINS.write_text(json.dumps({"_source": source, **pins}, ensure_ascii=False,
                                   separators=(",", ":")) + "\n", "utf-8")
    print(f"wrote pins.json ({len(pins)} PINs) from: {source}")
    if missing:
        print(f"  could not locate: {', '.join(missing)}")


def main() -> None:
    args = sys.argv[1:]
    if args and args[0] == "--candidates" and len(args) in (2, 3):
        candidates(args[1], int(args[2]) if len(args) == 3 else 2500)
    elif args and args[0] == "--planting" and len(args) == 2:
        planting(args[1])
    elif args in ([], ["--points-only"], ["--pins-only"]):
        if args != ["--pins-only"]:
            write_points()
        if args != ["--points-only"]:
            write_pins()
    else:
        raise SystemExit(USAGE)


if __name__ == "__main__":
    main()
