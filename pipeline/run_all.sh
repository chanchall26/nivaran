#!/usr/bin/env sh
# Rebuild all static city data for the web app. Takes ~5-10 min (Overpass is slow).
set -e
cd "$(dirname "$0")"
python -u fetch_osm.py
python -u fetch_rasters.py   # population (+ fallback canopy/LST)
python -u fetch_ee.py || echo 'Earth Engine step failed; using local rasters'
python -u build_grid.py
python -u fetch_weather.py
