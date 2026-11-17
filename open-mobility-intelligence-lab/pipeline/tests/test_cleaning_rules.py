"""The cleaning and aggregation SQL, exercised on hand-built rows with known answers."""
from datetime import datetime, timedelta

import duckdb
import pytest

import config as cfg
from run_pipeline import configure, named_queries

T0 = datetime(2026, 5, 4, 8, 0, 0)  # a Monday


def trip(minutes=10.0, miles=2.0, fare=12.0, pu=100, do=200, start=T0, **over):
    row = {
        "VendorID": 1, "tpep_pickup_datetime": start, "tpep_dropoff_datetime": start + timedelta(minutes=minutes),
        "passenger_count": 1, "trip_distance": miles, "PULocationID": pu, "DOLocationID": do,
        "payment_type": 1, "fare_amount": fare, "tip_amount": 0.0, "total_amount": None if fare is None else fare + 1.5,
    }
    row.update(over)
    return row


def run(rows, aggregate=False):
    con = duckdb.connect()
    configure(con)
    con.execute("""CREATE TABLE raw_trips (VendorID INTEGER, tpep_pickup_datetime TIMESTAMP, tpep_dropoff_datetime TIMESTAMP,
        passenger_count BIGINT, trip_distance DOUBLE, PULocationID INTEGER, DOLocationID INTEGER, payment_type BIGINT,
        fare_amount DOUBLE, tip_amount DOUBLE, total_amount DOUBLE)""")
    cols = list(rows[0].keys())
    con.executemany(f"INSERT INTO raw_trips ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                    [[r[c] for c in cols] for r in rows])
    con.execute((cfg.SQL_DIR / "02_clean.sql").read_text())
    if aggregate:
        con.execute((cfg.SQL_DIR / "03_aggregate.sql").read_text())
    return con


def rule_of(row):
    return run([row]).execute("SELECT exclusion_rule FROM trips_flagged").fetchone()[0]


@pytest.mark.parametrize("row, expected", [
    (trip(), None),
    (trip(fare=None), "R01_missing_key_field"),
    (trip(start=datetime(2026, 4, 30, 23, 59, 59)), "R02_outside_month"),
    (trip(start=datetime(2026, 6, 1, 0, 0, 0)), "R02_outside_month"),
    (trip(start=datetime(2008, 12, 31, 23, 5, 53)), "R02_outside_month"),
    (trip(minutes=0), "R03_non_positive_duration"),
    (trip(minutes=-5), "R03_non_positive_duration"),
    (trip(minutes=0.5), "R04_duration_too_short"),
    (trip(minutes=241, miles=30), "R05_duration_too_long"),
    (trip(miles=0), "R06_non_positive_distance"),
    (trip(minutes=200, miles=100.1), "R07_distance_too_long"),
    (trip(fare=0), "R08_non_positive_fare"),
    (trip(fare=-12), "R08_non_positive_fare"),
    (trip(fare=500.01), "R09_fare_too_high"),
    (trip(pu=264), "R10_unknown_zone"),
    (trip(do=265), "R10_unknown_zone"),
    (trip(pu=0), "R10_unknown_zone"),
    (trip(minutes=10, miles=14), "R11_implausible_speed"),  # 84 mph
])
def test_each_rule_fires(row, expected):
    assert rule_of(row) == expected


@pytest.mark.parametrize("row", [
    trip(minutes=1, miles=0.5),           # exactly 60 s
    trip(minutes=240, miles=30),          # exactly 4 h
    trip(minutes=200, miles=100.0),       # exactly 100 mi
    trip(fare=500.0),
    trip(minutes=60, miles=80.0),         # exactly 80 mph
    trip(pu=1, do=263),
    trip(start=datetime(2026, 5, 1, 0, 0, 0)),
    trip(start=datetime(2026, 5, 31, 23, 59, 59)),
])
def test_boundary_values_are_kept(row):
    assert rule_of(row) is None


def test_first_failing_rule_wins():
    # Breaks duration, distance, fare and zone at once: only the earliest rule is reported.
    assert rule_of(trip(minutes=0, miles=0, fare=0, pu=264)) == "R03_non_positive_duration"
    assert rule_of(trip(miles=0, fare=0, pu=264)) == "R06_non_positive_distance"


def test_null_optional_fields_do_not_exclude():
    assert rule_of(trip(passenger_count=None)) is None


def test_row_conservation_and_derived_columns():
    rows = [trip(), trip(minutes=0), trip(fare=0), trip(start=datetime(2026, 5, 9, 23, 30)), trip(pu=265)]
    con = run(rows)
    kept, flagged = con.execute("SELECT (SELECT count(*) FROM trips_clean), (SELECT count(*) FROM trips_flagged WHERE exclusion_rule IS NOT NULL)").fetchone()
    assert kept + flagged == len(rows) and kept == 2
    got = con.execute("SELECT pickup_hour, iso_dow, day_type, round(speed_mph, 6) FROM trips_clean ORDER BY pickup_ts").fetchall()
    assert got == [(8, 1, 1, 12.0), (23, 6, 2, 12.0)]  # Monday = weekday, Saturday = weekend; 2 mi in 10 min


def test_aggregates_reconcile_and_rollups_are_exact():
    sat = datetime(2026, 5, 9, 8, 0)
    rows = ([trip(pu=1, do=2)] * 3 + [trip(pu=2, do=1, miles=4.0, fare=20.0)] * 2
            + [trip(pu=1, do=2, start=sat)] * 4 + [trip(pu=3, do=3, start=T0 + timedelta(hours=1), minutes=60, miles=20.9)])
    con = run(rows, aggregate=True)
    assert con.execute("SELECT sum(trips), sum(distance_mi) FROM agg_cube").fetchone() == (10, pytest.approx(3 * 2 + 2 * 4 + 4 * 2 + 20.9))
    assert con.execute("SELECT trips FROM agg_cube WHERE day_type = 1 AND pickup_hour = 8").fetchone()[0] == 5
    # zone x hour: pickups and drop-offs both add up to all trips
    assert con.execute("SELECT sum(pickups), sum(dropoffs) FROM agg_zone_hour").fetchone() == (10, 10)
    assert con.execute("SELECT sum(dropoffs) FROM agg_zone_hour WHERE zone_id = 2").fetchone()[0] == 7
    # OD roll-ups: all days / all hours come from GROUPING SETS
    od = {(d, h, a, b): n for d, h, a, b, n in con.execute("SELECT day_type, pickup_hour, pu_zone, do_zone, trips FROM agg_od").fetchall()}
    assert od[(0, -1, 1, 2)] == 7
    assert od[(1, -1, 1, 2)] == 3 and od[(2, -1, 1, 2)] == 4
    assert od[(0, 8, 1, 2)] == 7 and od[(2, 8, 1, 2)] == 4
    assert od[(1, 9, 3, 3)] == 1
    # histogram: 1-mile bins with an overflow bin
    hist = dict(con.execute("SELECT bin_mi, sum(trips) FROM agg_dist_hist GROUP BY 1").fetchall())
    assert hist == {2: 7, 4: 2, cfg.DIST_HIST_MAX_BIN: 1}
    links = con.execute("SELECT other_zone, trips FROM agg_zone_links WHERE dir = 'out' AND zone_id = 1").fetchall()
    assert links == [(2, 7)]


def test_od_top_n_is_enforced():
    rows = [trip(pu=1 + i, do=50) for i in range(cfg.OD_TOP_N + 20)] + [trip(pu=1, do=50)]
    con = run(rows, aggregate=True)
    n, top = con.execute("SELECT count(*), max(trips) FROM agg_od WHERE day_type = 0 AND pickup_hour = -1").fetchone()
    assert n == cfg.OD_TOP_N and top == 2


def test_named_queries_parser(tmp_path):
    f = tmp_path / "q.sql"
    f.write_text("-- header\n\n-- name: first\nSELECT 1;\n\n-- name: second\n-- comment\nSELECT 2;\n")
    q = named_queries(f)
    assert list(q) == ["first", "second"]
    assert q["first"] == "SELECT 1;" and q["second"].endswith("SELECT 2;")
