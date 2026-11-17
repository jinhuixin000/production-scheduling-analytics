"""GIS step: reproject, simplify and export the TLC taxi zones for the web map."""
from __future__ import annotations

import json

import geopandas as gpd
import pandas as pd
import shapely

from config import RAW_DIR, SIMPLIFY_TOLERANCE_FT


def build_zones() -> tuple[dict, pd.DataFrame, dict]:
    """Return (geojson dict, zone attribute frame, GIS report)."""
    shp = next((RAW_DIR / "zones").rglob("*.shp"))
    gdf = gpd.read_file(shp)
    lookup = pd.read_csv(RAW_DIR / "taxi_zone_lookup.csv")
    report = {
        "source_crs": str(gdf.crs),
        "target_crs": "EPSG:4326",
        "features": int(len(gdf)),
        "unique_location_ids": int(gdf["LocationID"].nunique()),
        "invalid_geometries": int((~gdf.is_valid).sum()),
        "vertices_before": int(shapely.get_num_coordinates(gdf.geometry.values).sum()),
        "simplify_tolerance_ft": SIMPLIFY_TOLERANCE_FT,
    }
    gdf["geometry"] = gdf.geometry.make_valid()
    gdf = gdf.dissolve(by="LocationID", as_index=False)  # guards against duplicated IDs in older releases

    # Simplify in the projected CRS (feet). coverage_simplify keeps shared borders shared,
    # so neighbouring zones do not open gaps; fall back to per-polygon simplification.
    try:
        simplified = shapely.coverage_simplify(gdf.geometry.values, SIMPLIFY_TOLERANCE_FT)
        report["simplify_method"] = "shapely.coverage_simplify"
    except Exception:  # noqa: BLE001 - invalid coverage in the source data
        simplified = gdf.geometry.simplify(SIMPLIFY_TOLERANCE_FT, preserve_topology=True).values
        report["simplify_method"] = "per-polygon Douglas-Peucker"
    gdf["geometry"] = simplified

    # Area and label point are computed in the projected CRS, then everything goes to WGS84.
    gdf["area_sqmi"] = gdf.geometry.area / (5280.0**2)
    label_pts = gpd.GeoSeries(gdf.geometry.representative_point(), crs=gdf.crs).to_crs(4326)
    gdf = gdf.to_crs(4326)
    gdf["geometry"] = shapely.set_precision(gdf.geometry.values, 1e-5)
    gdf["lon"] = label_pts.x.round(5).values
    gdf["lat"] = label_pts.y.round(5).values
    report["vertices_after"] = int(shapely.get_num_coordinates(gdf.geometry.values).sum())

    gdf = gdf.merge(lookup[["LocationID", "service_zone"]], on="LocationID", how="left")
    report["zones_missing_in_lookup"] = int(gdf["service_zone"].isna().sum())
    attrs = pd.DataFrame(
        {
            "zone_id": gdf["LocationID"].astype(int),
            "name": gdf["zone"],
            "borough": gdf["borough"],
            "service_zone": gdf["service_zone"].fillna("N/A"),
            "lon": gdf["lon"],
            "lat": gdf["lat"],
            "area_sqmi": gdf["area_sqmi"].round(4),
        }
    ).sort_values("zone_id")

    features = [
        {
            "type": "Feature",
            "id": int(r.LocationID),
            "properties": {"id": int(r.LocationID), "name": r.zone, "borough": r.borough},
            "geometry": json.loads(shapely.to_geojson(r.geometry)),
        }
        for r in gdf.itertuples()
    ]
    return {"type": "FeatureCollection", "features": features}, attrs, report
