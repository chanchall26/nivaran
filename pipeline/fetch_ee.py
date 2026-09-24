"""Step 2 (Google Earth Engine): per-cell summer surface temperature and tree canopy.

Computes, on Earth Engine, for every H3 cell of the city:
  lst     mean land-surface temperature (C), median composite of clear-sky
          Landsat 8/9 Collection 2 L2 scenes in May 2026 (ST_B10, QA-masked)
  canopy  share of ESA WorldCover 2021 (v200) pixels that are tree cover

Writes pipeline/out/ee_cells.json, which build_grid.py prefers over the local
raster path (fetch_rasters.py) when present.

Auth: run `earthengine authenticate` once, or set EE_ACCESS_TOKEN to an OAuth
access token with the cloud-platform scope. Project: EE_PROJECT (default
barahmasa-gwalior), which must be registered for Earth Engine.
"""
import json
import os
from pathlib import Path

import ee
import h3
from shapely.geometry import mapping, shape

OUT = Path(__file__).parent / "out"
PROJECT = os.environ.get("EE_PROJECT", "barahmasa-gwalior")
RES = 9
MONTH = ("2026-05-01", "2026-06-01")


def init():
    token = os.environ.get("EE_ACCESS_TOKEN")
    if token:
        from google.oauth2.credentials import Credentials
        ee.Initialize(Credentials(token), project=PROJECT)
    else:
        ee.Initialize(project=PROJECT)


def city_cells():
    b = json.loads((OUT / "boundary.geojson").read_text(encoding="utf-8"))
    geom = shape(b["geometry"])
    return geom, sorted(h3.geo_to_cells(mapping(geom), RES))


def landsat_lst(region):
    def prep(img):
        qa = img.select("QA_PIXEL")
        clear = (qa.bitwiseAnd(1 << 1).eq(0)       # dilated cloud
                 .And(qa.bitwiseAnd(1 << 3).eq(0))  # cloud
                 .And(qa.bitwiseAnd(1 << 4).eq(0)))  # cloud shadow
        celsius = img.select("ST_B10").multiply(0.00341802).add(149.0).subtract(273.15)
        return celsius.updateMask(clear).rename("lst")

    col = (ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
           .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
           .filterBounds(region)
           .filterDate(*MONTH)
           .filter(ee.Filter.lt("CLOUD_COVER", 20)))
    return col.map(prep).median(), col.size()


def main():
    init()
    geom, cells = city_cells()
    region = ee.Geometry(mapping(geom.buffer(0.01)))
    lst, n_scenes = landsat_lst(region)
    canopy = ee.ImageCollection("ESA/WorldCover/v200").first().eq(10).rename("canopy")

    fc = ee.FeatureCollection([
        ee.Feature(ee.Geometry.Polygon([[[lon, lat] for lat, lon in h3.cell_to_boundary(c)]]), {"h3": c})
        for c in cells
    ])
    lst_rows = lst.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=30).getInfo()["features"]
    can_rows = canopy.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=10).getInfo()["features"]

    out = {c: {} for c in cells}
    for f in lst_rows:
        v = f["properties"].get("mean")
        out[f["properties"]["h3"]]["lst"] = None if v is None else round(v, 1)
    for f in can_rows:
        v = f["properties"].get("mean")
        out[f["properties"]["h3"]]["canopy"] = None if v is None else round(v, 3)

    meta = {"scenes": n_scenes.getInfo(), "month": MONTH, "project": PROJECT}
    (OUT / "ee_cells.json").write_text(json.dumps({"meta": meta, "cells": out}), encoding="utf-8")
    lsts = [v["lst"] for v in out.values() if v.get("lst") is not None]
    cans = [v["canopy"] for v in out.values() if v.get("canopy") is not None]
    print(f"Earth Engine: {meta['scenes']} Landsat scenes, {len(lsts)} cells with LST "
          f"({min(lsts):.1f}-{max(lsts):.1f} C), canopy mean {sum(cans) / len(cans):.1%}")


if __name__ == "__main__":
    main()
