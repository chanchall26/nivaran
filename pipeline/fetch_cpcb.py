"""Load CPCB station PM2.5 history into BigQuery, ready for AI.FORECAST.

Downloads the Vonter/india-cpcb-aqi 15-minute release (CPCB data, ODbL 1.0 —
must attribute: https://github.com/Vonter/india-cpcb-aqi, licence text at
http://opendatacommons.org/licenses/odbl/1.0/), keeps only the configured
cities, resamples to hourly mean PM2.5 per station, and loads that into a
BigQuery table.

Needs a Google Cloud project with BigQuery enabled and Application Default
Credentials (`gcloud auth application-default login`, or a service account
key via GOOGLE_APPLICATION_CREDENTIALS). Pass the project with --project or
the GOOGLE_CLOUD_PROJECT env var.

    python fetch_cpcb.py --project my-gcp-project --years 2025

See bq_forecast.sql for the scheduled AI.FORECAST job that reads the table
this script writes (`<project>.nivaran_air.cpcb_station_hourly`).
"""
import argparse
import os
from pathlib import Path

import pandas as pd
import requests

RELEASE_URL = "https://github.com/Vonter/india-cpcb-aqi/releases/download/{year}/cpcb-air-quality-{year}.parquet"
CACHE = Path(__file__).parent / ".cache" / "cpcb"
CITIES = ("Delhi", "Gwalior")
DATASET = "nivaran_air"
TABLE = "cpcb_station_hourly"


def _norm(name: str) -> str:
    return name.lower().replace(" ", "").replace(".", "").replace("_", "")


def _col(names, *candidates) -> str:
    lookup = {_norm(n): n for n in names}
    for candidate in candidates:
        hit = lookup.get(_norm(candidate))
        if hit:
            return hit
    raise KeyError(f"none of {candidates} found in columns {names}")


def download(year: int) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / f"cpcb-{year}.parquet"
    if dest.exists():
        return dest
    url = RELEASE_URL.format(year=year)
    print(f"downloading {url} (can be several hundred MB)")
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(".part")
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
        tmp.rename(dest)
    return dest


def load_hourly(year: int, cities) -> pd.DataFrame:
    import pyarrow.parquet as pq

    path = download(year)
    schema_names = pq.ParquetFile(path).schema_arrow.names
    city_col = _col(schema_names, "City")
    station_id_col = _col(schema_names, "Station ID", "StationId")
    station_name_col = _col(schema_names, "Station Name", "StationName")
    state_col = _col(schema_names, "State")
    ts_col = _col(schema_names, "Timestamp", "From Date", "Date")
    pm25_col = _col(schema_names, "PM2.5", "PM25")

    table = pq.read_table(path, filters=[(city_col, "in", list(cities))])
    df = table.to_pandas()
    df = df.rename(columns={
        station_id_col: "station_id", station_name_col: "station_name",
        city_col: "city", state_col: "state", ts_col: "ts", pm25_col: "pm25",
    })
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    df = df.dropna(subset=["pm25"])

    hourly = (
        df.set_index("ts")
        .groupby(["station_id", "station_name", "city", "state"])["pm25"]
        .resample("1h").mean()
        .dropna()
        .reset_index()
    )
    return hourly


def load_to_bigquery(df: pd.DataFrame, project: str, dataset: str, table: str):
    from google.cloud import bigquery

    client = bigquery.Client(project=project)
    dataset_ref = bigquery.DatasetReference(project, dataset)
    try:
        client.get_dataset(dataset_ref)
    except Exception:
        ds = bigquery.Dataset(dataset_ref)
        ds.location = "US"
        client.create_dataset(ds)
        print(f"created dataset {project}.{dataset}")

    job_config = bigquery.LoadJobConfig(write_disposition="WRITE_TRUNCATE")
    job = client.load_table_from_dataframe(df, f"{project}.{dataset}.{table}", job_config=job_config)
    job.result()
    print(f"loaded {len(df)} station-hours into {project}.{dataset}.{table}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", nargs="+", type=int, default=[2025], help="release tags to pull, e.g. 2024 2025")
    ap.add_argument("--cities", nargs="+", default=list(CITIES))
    ap.add_argument("--project", default=os.environ.get("GOOGLE_CLOUD_PROJECT"))
    ap.add_argument("--dataset", default=DATASET)
    ap.add_argument("--table", default=TABLE)
    args = ap.parse_args()
    if not args.project:
        raise SystemExit("Set --project or GOOGLE_CLOUD_PROJECT to a GCP project with BigQuery enabled")

    frames = [load_hourly(year, args.cities) for year in args.years]
    hourly = pd.concat(frames, ignore_index=True) if len(frames) > 1 else frames[0]
    print(f"{len(hourly)} station-hours for {sorted(hourly['city'].unique())}")
    load_to_bigquery(hourly, args.project, args.dataset, args.table)


if __name__ == "__main__":
    main()
