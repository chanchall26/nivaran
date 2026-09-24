"""Small Overpass client with mirror fallback, retries and an on-disk cache."""
import hashlib
import json
import time
from pathlib import Path

import requests

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
HEADERS = {"User-Agent": "Barahmasa/0.1 (GDG hackathon; thermal-safety research)"}
CACHE = Path(__file__).parent / ".cache" / "overpass"


def query(ql: str, tries: int = 6) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(ql.encode()).hexdigest()[:16]
    cached = CACHE / f"{key}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))

    last = None
    for attempt in range(tries):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            r = requests.post(url, data={"data": ql}, headers=HEADERS, timeout=180)
            if r.ok and r.text.lstrip().startswith("{"):
                data = r.json()
                if "remark" in data and not data.get("elements"):
                    raise RuntimeError(data["remark"])
                cached.write_text(r.text, encoding="utf-8")
                return data
            last = f"{url}: HTTP {r.status_code} {r.text[:120]!r}"
        except Exception as e:  # network errors, timeouts, bad JSON
            last = f"{url}: {e}"
        print(f"  overpass retry {attempt + 1}/{tries} ({last})")
        time.sleep(4 + attempt * 3)
    raise RuntimeError(f"Overpass failed: {last}")
