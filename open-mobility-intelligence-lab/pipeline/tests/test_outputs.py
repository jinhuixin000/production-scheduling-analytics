"""The published JSON must be internally consistent. Skipped until the pipeline has been run."""
import json

import pytest

import config as cfg

pytestmark = pytest.mark.skipif(not (cfg.OUT_DIR / "quality.json").exists(), reason="run pipeline/run_pipeline.py first")


def load(name):
    return json.loads((cfg.OUT_DIR / name).read_text())


def test_all_validation_checks_passed():
    q = load("quality.json")
    assert len(q["checks"]) >= 18
    assert [c["id"] for c in q["checks"] if not c["pass"]] == []


def test_row_conservation():
    q = load("quality.json")
    assert q["rawRows"] == q["cleanRows"] + sum(r["excluded"] for r in q["rules"])
    assert q["excludedRows"] == q["rawRows"] - q["cleanRows"]


def test_cube_matches_headline_kpis():
    s, q = load("summary.json"), load("quality.json")
    assert sum(c[2] for c in s["cube"]) == q["cleanRows"] == s["kpis"]["total_trips"]
    assert sum(c[3] for c in s["cube"]) == pytest.approx(s["kpis"]["total_distance_mi"], rel=1e-6)
    assert len(s["cube"]) == 2 * 24
    assert s["days"]["weekday"] + s["days"]["weekend"] == 31


def test_zones_and_geojson_agree():
    z, g = load("zones.json"), load("zones.geojson")
    ids = {f["properties"]["id"] for f in g["features"]}
    assert len(ids) == 263 and ids == {x["id"] for x in z["zones"]}
    for x in z["zones"]:
        lon, lat = x["centroid"]
        assert -74.3 < lon < -73.6 and 40.4 < lat < 41.0  # inside the NYC bounding box


def test_payload_is_small_enough_for_a_static_site():
    assert sum(p.stat().st_size for p in cfg.OUT_DIR.glob("*.*json")) < 2_000_000


def test_sources_have_checksums():
    for s in load("quality.json")["sources"]:
        assert len(s["sha256"]) == 64 and s["url"].startswith("https://d37ci6vzurychx.cloudfront.net/")
