"""Step 4: 'replay' weather for demos outside the season.

Saves the hourly weather of the coldest night of winter 2025-26 and the hottest
day of summer 2026 in Gwalior (found from the Open-Meteo ERA5 archive), in the same
shape the app gets from the live forecast API, so either can drive the scores.
"""
import json
from pathlib import Path

import requests

WEB = Path(__file__).parent.parent / "web" / "public" / "data" / "gwalior"
LAT, LON = 26.2124, 78.1772
HOURLY = ("temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,"
          "boundary_layer_height,shortwave_radiation")


def archive_extreme(start, end, var, pick):
    r = requests.get("https://archive-api.open-meteo.com/v1/archive", timeout=60, params={
        "latitude": LAT, "longitude": LON, "start_date": start, "end_date": end,
        "daily": var, "timezone": "Asia/Kolkata"}).json()["daily"]
    return pick(zip(r[var], r["time"]))


def hourly(start, end):
    w = requests.get("https://historical-forecast-api.open-meteo.com/v1/forecast", timeout=60, params={
        "latitude": LAT, "longitude": LON, "start_date": start, "end_date": end,
        "hourly": HOURLY, "wind_speed_unit": "ms", "timezone": "Asia/Kolkata"}).json()["hourly"]
    aq = requests.get("https://air-quality-api.open-meteo.com/v1/air-quality", timeout=60, params={
        "latitude": LAT, "longitude": LON, "start_date": start, "end_date": end,
        "hourly": "pm2_5", "timezone": "Asia/Kolkata"}).json().get("hourly", {})
    w["pm2_5"] = aq.get("pm2_5", [None] * len(w["time"]))
    return w


def shift(day, n):
    from datetime import date, timedelta
    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


def main():
    cold_min, cold_day = archive_extreme("2025-11-15", "2026-02-28", "apparent_temperature_min", min)
    hot_max, hot_day = archive_extreme("2026-04-01", "2026-06-30", "apparent_temperature_max", max)
    print("coldest", cold_day, cold_min, "hottest", hot_day, hot_max)
    replay = {
        "source": "Open-Meteo historical forecast + CAMS air quality (model data, not station obs.)",
        "sardi": {"label": "Sabse thandi raat, sardi 2025-26", "night": cold_day,
                  "hourly": hourly(shift(cold_day, -1), cold_day)},
        "garmi": {"label": "Sabse garam din, garmi 2026", "day": hot_day,
                  "hourly": hourly(hot_day, hot_day)},
    }
    (WEB / "replay.json").write_text(json.dumps(replay, separators=(",", ":")), encoding="utf-8")
    pm = [p for p in replay["sardi"]["hourly"]["pm2_5"] if p is not None]
    print("sardi PM2.5 max", max(pm) if pm else None)


if __name__ == "__main__":
    main()
