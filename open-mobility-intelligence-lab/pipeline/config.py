"""Single source of truth for the pipeline: data month, sources and cleaning thresholds."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "web" / "public" / "data"
SQL_DIR = Path(__file__).resolve().parent / "sql"

MONTH = "2026-05"
MONTH_START = "2026-05-01"
MONTH_END = "2026-06-01"  # exclusive

BASE_URL = "https://d37ci6vzurychx.cloudfront.net"
SOURCES = {
    "trips": {
        "file": f"yellow_tripdata_{MONTH}.parquet",
        "url": f"{BASE_URL}/trip-data/yellow_tripdata_{MONTH}.parquet",
        "title": "NYC TLC Yellow Taxi Trip Records",
    },
    "zone_lookup": {
        "file": "taxi_zone_lookup.csv",
        "url": f"{BASE_URL}/misc/taxi_zone_lookup.csv",
        "title": "NYC TLC Taxi Zone Lookup Table",
    },
    "zone_shapes": {
        "file": "taxi_zones.zip",
        "url": f"{BASE_URL}/misc/taxi_zones.zip",
        "title": "NYC TLC Taxi Zone Shapefile",
    },
}
LANDING_PAGE = "https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page"

# Cleaning thresholds. Every value is surfaced in the app (Data Engineering page).
THRESHOLDS = {
    "min_duration_s": 60,        # shorter trips are almost always meter tests / cancellations
    "max_duration_s": 4 * 3600,  # longer than 4 h is treated as a meter left running
    "max_distance_mi": 100.0,    # NYC metro trips beyond 100 mi are treated as odometer errors
    "max_fare_usd": 500.0,
    "max_speed_mph": 80.0,       # implied average speed above this is physically implausible in NYC
    "max_zone_id": 263,          # 264 = Unknown, 265 = Outside of NYC (no geometry)
}
OD_TOP_N = 150          # OD pairs kept per (day type, hour) slice
ZONE_TOP_N = 6          # top destinations / origins kept per zone
DIST_HIST_MAX_BIN = 20  # last histogram bin is "20+ mi"
SIMPLIFY_TOLERANCE_FT = 120.0
