#!/usr/bin/env sh
# Rebuild all static city data for the web app. Takes ~5-10 min (Overpass is slow).
set -e
cd "$(dirname "$0")"
python -u fetch_osm.py
python -u fetch_rasters.py
python -u build_grid.py
python -u fetch_weather.py
