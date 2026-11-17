"""End-to-end ETL: raw TLC Parquet -> cleaned table -> SQL aggregates -> validated static JSON.

Usage:  python pipeline/download.py && python pipeline/run_pipeline.py
"""
from __future__ import annotations

import json
import platform
import re
import sys
import time
from datetime import datetime, timezone

import duckdb
import numpy as np

import config as cfg
from zones import build_zones

RULES = {
    "R01_missing_key_field": "Pickup/drop-off time, zone, distance or fare is NULL",
    "R02_outside_month": f"Pickup timestamp outside {cfg.MONTH} (device clock errors, late submissions)",
    "R03_non_positive_duration": "Drop-off is not after pickup",
    "R04_duration_too_short": f"Duration under {cfg.THRESHOLDS['min_duration_s']} s",
    "R05_duration_too_long": f"Duration over {cfg.THRESHOLDS['max_duration_s'] // 3600} h",
    "R06_non_positive_distance": "Trip distance ≤ 0 mi",
    "R07_distance_too_long": f"Trip distance over {cfg.THRESHOLDS['max_distance_mi']:.0f} mi",
    "R08_non_positive_fare": "Fare ≤ $0 (refunds, voids, disputes)",
    "R09_fare_too_high": f"Fare over ${cfg.THRESHOLDS['max_fare_usd']:.0f}",
    "R10_unknown_zone": "Pickup or drop-off zone is 264 (Unknown) or 265 (Outside NYC)",
    "R11_implausible_speed": f"Implied average speed over {cfg.THRESHOLDS['max_speed_mph']:.0f} mph",
}


def named_queries(path) -> dict[str, str]:
    text = path.read_text()
    parts = re.split(r"^-- name: (\w+)\s*$", text, flags=re.M)
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts), 2)}


def rows(con, sql) -> list[dict]:
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def r(x, n=2):
    return None if x is None else round(float(x), n)


def write_json(name: str, obj) -> int:
    path = cfg.OUT_DIR / name
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False, default=str))
    return path.stat().st_size


def pandas_crosscheck(con) -> dict:
    """Recompute the cleaning rules and headline sums with NumPy, independently of the SQL."""
    df = con.execute(
        """SELECT tpep_pickup_datetime AS pu, tpep_dropoff_datetime AS dropoff, PULocationID AS pz,
                  DOLocationID AS dz, trip_distance AS d, fare_amount AS f FROM raw_trips"""
    ).df()
    t = cfg.THRESHOLDS
    dur = (df["dropoff"] - df["pu"]).dt.total_seconds().to_numpy()
    d, f = df["d"].to_numpy(), df["f"].to_numpy()
    pz, dz = df["pz"].to_numpy(), df["dz"].to_numpy()
    in_month = ((df["pu"] >= np.datetime64(cfg.MONTH_START)) & (df["pu"] < np.datetime64(cfg.MONTH_END))).to_numpy()
    keep = (
        in_month
        & (dur >= t["min_duration_s"]) & (dur <= t["max_duration_s"])
        & (d > 0) & (d <= t["max_distance_mi"])
        & (f > 0) & (f <= t["max_fare_usd"])
        & (pz >= 1) & (pz <= t["max_zone_id"]) & (dz >= 1) & (dz <= t["max_zone_id"])
    )
    with np.errstate(divide="ignore", invalid="ignore"):
        keep &= (d / (dur / 3600.0)) <= t["max_speed_mph"]
    return {"rows": int(keep.sum()), "distance_mi": float(d[keep].sum()), "fare_usd": float(f[keep].sum())}


def configure(con) -> None:
    """Expose thresholds to SQL as DuckDB variables (read with getvariable())."""
    params = {**cfg.THRESHOLDS, "month_start": cfg.MONTH_START, "month_end": cfg.MONTH_END,
              "od_top_n": cfg.OD_TOP_N, "zone_top_n": cfg.ZONE_TOP_N, "dist_hist_max_bin": cfg.DIST_HIST_MAX_BIN}
    for k, v in params.items():
        con.execute(f"SET VARIABLE {k} = {v!r}")


def main() -> None:
    cfg.OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((cfg.RAW_DIR / "manifest.json").read_text())
    timings: list[dict] = []
    con = duckdb.connect()

    def step(name: str, fn):
        t0 = time.perf_counter()
        out = fn()
        timings.append({"step": name, "seconds": round(time.perf_counter() - t0, 3)})
        print(f"[{timings[-1]['seconds']:7.3f}s] {name}")
        return out

    configure(con)
    trips_path = cfg.RAW_DIR / cfg.SOURCES["trips"]["file"]
    con.execute(f"CREATE VIEW raw_trips AS SELECT * FROM read_parquet('{trips_path.as_posix()}')")

    # ---- 1. schema + profile ------------------------------------------------------------
    profile_q = named_queries(cfg.SQL_DIR / "01_profile.sql")

    def profile():
        schema = [{"column": c[0], "type": c[1]} for c in con.execute("DESCRIBE raw_trips").fetchall()]
        cols = [s["column"] for s in schema]
        nulls = con.execute(
            "SELECT " + ", ".join(f'count(*) - count("{c}")' for c in cols) + " FROM raw_trips"
        ).fetchone()
        summary = rows(con, profile_q["raw_summary"])[0]
        dup = rows(con, profile_q["duplicate_rows"])[0]["duplicate_rows"]
        for s, n in zip(schema, nulls):
            s["nulls"] = int(n)
            s["null_pct"] = round(100.0 * n / summary["raw_rows"], 3)
        return schema, summary, int(dup)

    schema, raw_summary, duplicate_rows = step("Schema check & raw profiling", profile)
    raw_rows = int(raw_summary["raw_rows"])

    # ---- 2. clean -----------------------------------------------------------------------
    step("Flag & filter anomalous trips (SQL)", lambda: con.execute((cfg.SQL_DIR / "02_clean.sql").read_text()))
    # ---- 3. aggregate -------------------------------------------------------------------
    step("Pre-aggregate cubes & OD flows (SQL)", lambda: con.execute((cfg.SQL_DIR / "03_aggregate.sql").read_text()))
    # ---- 4. zones -----------------------------------------------------------------------
    geojson, zone_attrs, gis_report = step("Taxi zones: reproject, simplify (GeoPandas)", build_zones)
    # ---- 5. quality queries -------------------------------------------------------------
    quality_q = named_queries(cfg.SQL_DIR / "04_quality.sql")

    def quality():
        return (
            {x["rule"]: int(x["n"]) for x in rows(con, quality_q["exclusions"])},
            rows(con, quality_q["outliers_iqr"]),
            rows(con, quality_q["headline_kpis"])[0],
        )

    excl, outliers, kpi = step("Quality queries: exclusions, IQR outliers", quality)
    clean_rows = excl.get("KEPT", 0)
    xcheck = step("Independent re-computation (pandas / NumPy)", lambda: pandas_crosscheck(con))

    # ---- 6. validation ------------------------------------------------------------------
    one = lambda sql: con.execute(sql).fetchone()[0]  # noqa: E731
    zone_ids = set(zone_attrs["zone_id"])
    checks: list[dict] = []

    def check(cid, name, detail, expected, actual, ok=None):
        passed = bool(expected == actual if ok is None else ok)
        checks.append({"id": cid, "name": name, "detail": detail, "expected": str(expected),
                       "actual": str(actual), "pass": passed})

    excluded_total = sum(n for k, n in excl.items() if k != "KEPT")
    check("V01", "Row conservation", "raw rows = clean rows + Σ excluded rows", raw_rows, clean_rows + excluded_total)
    check("V02", "No exact duplicates", "duplicate rows on the natural trip key", 0, duplicate_rows)
    check("V03", "KPI cube is complete", "Σ trips in day-type × hour cube = clean rows", clean_rows, int(one("SELECT sum(trips) FROM agg_cube")))
    check("V04", "Zone pickups reconcile", "Σ pickups over zone × hour = clean rows", clean_rows, int(one("SELECT sum(pickups) FROM agg_zone_hour")))
    check("V05", "Zone drop-offs reconcile", "Σ drop-offs over zone × hour = clean rows", clean_rows, int(one("SELECT sum(dropoffs) FROM agg_zone_hour")))
    check("V06", "Daily series reconciles", "Σ daily trips = clean rows", clean_rows, int(one("SELECT sum(trips) FROM agg_daily")))
    check("V07", "Histogram reconciles", "Σ distance-histogram counts = clean rows", clean_rows, int(one("SELECT sum(trips) FROM agg_dist_hist")))
    check("V08", "Calendar is complete", "distinct pickup dates in the month", 31, int(one("SELECT count(*) FROM agg_daily")))
    check("V09", "All 24 hours present", "distinct pickup hours", 24, int(one("SELECT count(DISTINCT pickup_hour) FROM agg_cube")))
    check("V10", "No NULL keys after cleaning", "NULLs in time / zone / distance / fare", 0,
          int(one("SELECT count(*) FROM trips_clean WHERE pickup_ts IS NULL OR pu_zone IS NULL OR do_zone IS NULL OR distance_mi IS NULL OR fare_amount IS NULL")))
    trip_zones = {z[0] for z in con.execute("SELECT DISTINCT pu_zone FROM trips_clean UNION SELECT DISTINCT do_zone FROM trips_clean").fetchall()}
    check("V11", "Referential integrity", "trip zones without a polygon in the shapefile", 0, len(trip_zones - zone_ids))
    check("V12", "Zone geometry", "unique zone polygons after dissolve", 263, len(zone_ids))
    check("V13", "Threshold bounds hold", "clean rows violating any cleaning threshold", 0, int(one(
        """SELECT count(*) FROM trips_clean WHERE duration_s < getvariable('min_duration_s') OR duration_s > getvariable('max_duration_s')
           OR distance_mi <= 0 OR distance_mi > getvariable('max_distance_mi') OR fare_amount <= 0
           OR fare_amount > getvariable('max_fare_usd') OR speed_mph > getvariable('max_speed_mph')""")))
    check("V14", "OD roll-up is exact", "top all-day OD pair equals a direct COUNT(*)",
          int(one("SELECT trips FROM agg_od WHERE day_type = 0 AND pickup_hour = -1 ORDER BY trips DESC, pu_zone, do_zone LIMIT 1")),
          int(one("SELECT count(*) AS n FROM trips_clean GROUP BY pu_zone, do_zone ORDER BY n DESC LIMIT 1")))
    check("V15", "Cross-engine row count", "clean rows: DuckDB SQL vs independent NumPy filter", clean_rows, xcheck["rows"])
    d_sql, d_np = float(kpi["total_distance_mi"]), xcheck["distance_mi"]
    check("V16", "Cross-engine distance", "Σ distance: DuckDB vs NumPy (relative error < 1e-9)", f"{d_sql:.2f}", f"{d_np:.2f}",
          ok=abs(d_sql - d_np) / d_sql < 1e-9)
    f_sql, f_np = float(kpi["total_fare_usd"]), xcheck["fare_usd"]
    check("V17", "Cross-engine fare", "Σ fare: DuckDB vs NumPy (relative error < 1e-9)", f"{f_sql:.2f}", f"{f_np:.2f}",
          ok=abs(f_sql - f_np) / f_sql < 1e-9)
    retained = clean_rows / raw_rows
    check("V18", "Retention is plausible", "share of raw rows kept is between 85% and 99%", "0.85–0.99", f"{retained:.4f}",
          ok=0.85 <= retained <= 0.99)
    timings.append({"step": "Validation checks", "seconds": 0.0})

    # ---- 7. export ----------------------------------------------------------------------
    t0 = time.perf_counter()
    day_counts = dict(con.execute(
        "SELECT CASE WHEN isodow(pickup_date) <= 5 THEN 1 ELSE 2 END, count(*) FROM agg_daily GROUP BY 1").fetchall())
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sizes = {}
    sizes["summary.json"] = write_json("summary.json", {
        "month": cfg.MONTH,
        "generatedUtc": generated,
        "days": {"weekday": day_counts.get(1, 0), "weekend": day_counts.get(2, 0)},
        "kpis": {k: r(v, 4) for k, v in kpi.items()},
        "cubeColumns": ["dayType", "hour", "trips", "distanceMi", "fareUsd", "totalUsd", "durationMin", "passengers", "passengerRows"],
        "cube": [[a, b, c, r(d, 2), r(e, 2), r(f, 2), r(g, 2), int(h or 0), i]
                 for a, b, c, d, e, f, g, h, i in con.execute("SELECT * FROM agg_cube").fetchall()],
        "daily": [[str(a), b, c, r(d, 1), r(e, 1)] for a, b, c, d, e in con.execute("SELECT * FROM agg_daily").fetchall()],
        "dowHour": [list(x) for x in con.execute("SELECT * FROM agg_dow_hour").fetchall()],
        "distHistMaxBin": cfg.DIST_HIST_MAX_BIN,
        "distHist": [list(x) for x in con.execute("SELECT * FROM agg_dist_hist").fetchall()],
    })
    stats = {z: rest for z, *rest in con.execute("SELECT * FROM agg_zone_stats").fetchall()}
    drop = dict(con.execute("SELECT do_zone, count(*) FROM trips_clean GROUP BY 1").fetchall())
    links: dict[str, dict[str, list]] = {"out": {}, "in": {}}
    for d, z, o, n in con.execute("SELECT * FROM agg_zone_links").fetchall():
        links[d].setdefault(str(z), []).append([o, n])
    zones_out = []
    for z in zone_attrs.itertuples():
        s = stats.get(z.zone_id)
        zones_out.append({
            "id": z.zone_id, "name": z.name, "borough": z.borough, "serviceZone": z.service_zone,
            "centroid": [z.lon, z.lat], "areaSqMi": z.area_sqmi,
            "pickups": s[0] if s else 0, "dropoffs": drop.get(z.zone_id, 0),
            "avgDistanceMi": r(s[1]) if s else None, "avgFareUsd": r(s[2]) if s else None,
            "avgDurationMin": r(s[3]) if s else None, "avgSpeedMph": r(s[4]) if s else None,
        })
    sizes["zones.json"] = write_json("zones.json", {
        "zones": zones_out,
        "zoneHourColumns": ["zoneId", "dayType", "hour", "pickups", "dropoffs"],
        "zoneHour": [list(x) for x in con.execute("SELECT * FROM agg_zone_hour").fetchall()],
        "links": links,
    })
    sizes["od.json"] = write_json("od.json", {
        "topN": cfg.OD_TOP_N,
        "columns": ["dayType", "hour", "puZone", "doZone", "trips", "avgDistanceMi", "avgFareUsd", "avgDurationMin"],
        "rows": [[a, b, c, d, e, r(f), r(g), r(h, 1)] for a, b, c, d, e, f, g, h in con.execute("SELECT * FROM agg_od").fetchall()],
    })
    sizes["zones.geojson"] = write_json("zones.geojson", geojson)
    timings.append({"step": "Export static JSON for the browser", "seconds": round(time.perf_counter() - t0, 3)})

    quality_doc = {
        "month": cfg.MONTH,
        "generatedUtc": generated,
        "sources": list(manifest.values()),
        "landingPage": cfg.LANDING_PAGE,
        "environment": {"python": platform.python_version(), "duckdb": duckdb.__version__,
                        "machine": f"{platform.system()} {platform.machine()}"},
        "rawRows": raw_rows,
        "cleanRows": clean_rows,
        "excludedRows": excluded_total,
        "rawSummary": {k: str(v) for k, v in raw_summary.items()},
        "duplicateRows": duplicate_rows,
        "schema": schema,
        "thresholds": cfg.THRESHOLDS,
        "rules": [{"id": k, "description": v, "excluded": excl.get(k, 0)} for k, v in RULES.items()],
        "outliers": [{k: (r(v, 3) if isinstance(v, float) else v) for k, v in o.items()} for o in outliers],
        "gis": gis_report,
        "checks": checks,
        "timings": timings,
        "totalSeconds": round(sum(t["seconds"] for t in timings), 3),
        "outputBytes": sizes,
        "sql": {p.name: p.read_text() for p in sorted(cfg.SQL_DIR.glob("*.sql"))},
    }
    sizes["quality.json"] = write_json("quality.json", quality_doc)

    print(f"\nraw={raw_rows:,} clean={clean_rows:,} excluded={excluded_total:,} ({100 * excluded_total / raw_rows:.2f}%)")
    for k, v in excl.items():
        print(f"  {k:28s} {v:>10,}")
    failed = [c for c in checks if not c["pass"]]
    print(f"checks: {len(checks) - len(failed)}/{len(checks)} passed; outputs: " + ", ".join(f"{k} {v / 1024:.0f} KB" for k, v in sizes.items()))
    if failed:
        for c in failed:
            print("FAILED", c)
        sys.exit(1)


if __name__ == "__main__":
    main()
