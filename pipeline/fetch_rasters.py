"""Step 2: canopy (ESA WorldCover 2021, 10 m) and summer land-surface temperature
(Landsat 8/9 Collection 2 L2, median of clear May scenes) clipped to the city.

Writes pipeline/out/canopy.npz and pipeline/out/lst.npz, each holding a 2-D array
plus its affine transform on a common EPSG:4326 grid.
"""
import json
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from shapely.geometry import shape

OUT = Path(__file__).parent / "out"
WORLDCOVER = ("/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
              "ESA_WorldCover_10m_2021_v200_N24E078_Map.tif")
LST_SCENES = [  # clear-sky May 2026 overpasses (cloud < 1 %)
    "LC08_L2SP_145042_20260510_02_T1",
    "LC09_L2SP_145042_20260518_02_T1",
    "LC09_L2SP_146042_20260525_02_T1",
    "LC08_L2SP_145042_20260526_02_T1",
]
HRSL = "/vsicurl/https://dataforgood-fb-data.s3.amazonaws.com/hrsl-cogs/hrsl_general/hrsl_general-latest.vrt"
RES = 1 / 12000  # ~9 m common grid


def city_bounds():
    b = json.loads((OUT / "boundary.geojson").read_text(encoding="utf-8"))
    w, s, e, n = shape(b["geometry"]).bounds
    return w - 0.01, s - 0.01, e + 0.01, n + 0.01


def target_grid(bounds):
    w, s, e, n = bounds
    width, height = int((e - w) / RES), int((n - s) / RES)
    return rasterio.transform.from_origin(w, n, RES, RES), (height, width)


def canopy(bounds, transform, shape_):
    with rasterio.open(WORLDCOVER) as src:
        win = from_bounds(*bounds, src.transform)
        a = src.read(1, window=win)
        src_t = src.window_transform(win)
    trees = (a == 10).astype(np.float32)
    dst = np.zeros(shape_, np.float32)
    reproject(trees, dst, src_transform=src_t, src_crs="EPSG:4326",
              dst_transform=transform, dst_crs="EPSG:4326", resampling=Resampling.average)
    return dst


def population(bounds):
    """Meta HRSL (~30 m) people per pixel, kept at native resolution (sums, not averages)."""
    with rasterio.open(HRSL) as src:
        win = from_bounds(*bounds, src.transform)
        a = src.read(1, window=win).astype(np.float32)
        t = src.window_transform(win)
    a[~np.isfinite(a) | (a < 0)] = 0
    return a, t


def lst(bounds, transform, shape_):
    cat = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1",
                                    modifier=planetary_computer.sign_inplace)
    stack = []
    for sid in LST_SCENES:
        item = cat.get_collection("landsat-c2-l2").get_item(sid)
        layers = {}
        for band in ("lwir11", "qa_pixel"):
            with rasterio.open(item.assets[band].href) as src:
                dst = np.zeros(shape_, np.float32)
                reproject(rasterio.band(src, 1), dst, dst_transform=transform, dst_crs="EPSG:4326",
                          resampling=Resampling.nearest if band == "qa_pixel" else Resampling.bilinear,
                          src_nodata=0, dst_nodata=0)
                layers[band] = dst
        qa = layers["qa_pixel"].astype(np.uint16)
        cloudy = (qa & (1 << 3)) | (qa & (1 << 4)) | (qa & (1 << 1))  # cloud, shadow, dilated
        celsius = layers["lwir11"] * 0.00341802 + 149.0 - 273.15
        celsius[(layers["lwir11"] == 0) | (cloudy > 0)] = np.nan
        stack.append(celsius)
        print(f"  {sid}: median {np.nanmedian(celsius):.1f} C, valid {np.isfinite(celsius).mean():.0%}")
    return np.nanmedian(np.stack(stack), axis=0)


def main():
    bounds = city_bounds()
    transform, shape_ = target_grid(bounds)
    print("grid", shape_)
    c = canopy(bounds, transform, shape_)
    np.savez_compressed(OUT / "canopy.npz", data=c, transform=np.array(transform)[:6])
    print(f"canopy mean {c.mean():.1%}")
    pop, pop_t = population(bounds)
    np.savez_compressed(OUT / "population.npz", data=pop, transform=np.array(pop_t)[:6])
    print(f"population {pop.sum():,.0f}")
    if (OUT / "lst.npz").exists():
        return
    t = lst(bounds, transform, shape_)
    np.savez_compressed(OUT / "lst.npz", data=t, transform=np.array(transform)[:6])
    print(f"LST p5 {np.nanpercentile(t, 5):.1f}  p50 {np.nanmedian(t):.1f}  p95 {np.nanpercentile(t, 95):.1f}")


if __name__ == "__main__":
    main()
