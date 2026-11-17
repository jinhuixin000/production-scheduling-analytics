-- 03 · Pre-aggregate for the browser. The front end never sees a single raw trip:
-- 4.09 M rows collapse into a few thousand cells that are safe to ship as static JSON.

-- KPI cube: every dashboard KPI is a sum/ratio over these additive measures.
CREATE OR REPLACE TABLE agg_cube AS
SELECT
  day_type,
  pickup_hour,
  count(*)                    AS trips,
  sum(distance_mi)            AS distance_mi,
  sum(fare_amount)            AS fare_usd,
  sum(total_amount)           AS total_usd,
  sum(duration_s) / 60.0      AS duration_min,
  sum(passenger_count)        AS passengers,
  count(passenger_count)      AS passenger_rows
FROM trips_clean
GROUP BY ALL
ORDER BY ALL;

CREATE OR REPLACE TABLE agg_daily AS
SELECT pickup_date, any_value(iso_dow) AS iso_dow, count(*) AS trips,
       sum(distance_mi) AS distance_mi, sum(fare_amount) AS fare_usd
FROM trips_clean GROUP BY pickup_date ORDER BY pickup_date;

CREATE OR REPLACE TABLE agg_dow_hour AS
SELECT iso_dow, pickup_hour, count(*) AS trips,
       count(DISTINCT pickup_date) AS days
FROM trips_clean GROUP BY ALL ORDER BY ALL;

CREATE OR REPLACE TABLE agg_dist_hist AS
SELECT day_type, pickup_hour,
       least(floor(distance_mi)::INT, getvariable('dist_hist_max_bin')) AS bin_mi,
       count(*) AS trips
FROM trips_clean GROUP BY ALL ORDER BY ALL;

-- Zone × hour demand, pickups and drop-offs side by side.
CREATE OR REPLACE TABLE agg_zone_hour AS
WITH pu AS (
  SELECT pu_zone AS zone_id, day_type, pickup_hour, count(*) AS pickups
  FROM trips_clean GROUP BY ALL
), d AS (
  SELECT do_zone AS zone_id, day_type, pickup_hour, count(*) AS dropoffs
  FROM trips_clean GROUP BY ALL
)
SELECT zone_id, day_type, pickup_hour,
       coalesce(pickups, 0)  AS pickups,
       coalesce(dropoffs, 0) AS dropoffs
FROM pu FULL JOIN d USING (zone_id, day_type, pickup_hour)
ORDER BY ALL;

CREATE OR REPLACE TABLE agg_zone_stats AS
SELECT pu_zone AS zone_id,
       count(*)                 AS pickups,
       avg(distance_mi)         AS avg_distance_mi,
       avg(fare_amount)         AS avg_fare_usd,
       avg(duration_s) / 60.0   AS avg_duration_min,
       avg(speed_mph)           AS avg_speed_mph
FROM trips_clean GROUP BY pu_zone ORDER BY pu_zone;

-- Origin–destination flows. GROUPING SETS computes the "all days" and "all hours"
-- roll-ups exactly, instead of summing truncated top-N lists in the browser.
CREATE OR REPLACE TABLE agg_od AS
WITH g AS (
  SELECT
    CASE WHEN grouping(day_type) = 1 THEN 0 ELSE day_type END       AS day_type,    -- 0 = all days
    CASE WHEN grouping(pickup_hour) = 1 THEN -1 ELSE pickup_hour END AS pickup_hour, -- -1 = all hours
    pu_zone, do_zone,
    count(*)               AS trips,
    avg(distance_mi)       AS avg_distance_mi,
    avg(fare_amount)       AS avg_fare_usd,
    avg(duration_s) / 60.0 AS avg_duration_min
  FROM trips_clean
  GROUP BY GROUPING SETS (
    (pu_zone, do_zone),
    (day_type, pu_zone, do_zone),
    (pickup_hour, pu_zone, do_zone),
    (day_type, pickup_hour, pu_zone, do_zone)
  )
)
SELECT *
FROM g
QUALIFY row_number() OVER (
  PARTITION BY day_type, pickup_hour ORDER BY trips DESC, pu_zone, do_zone
) <= getvariable('od_top_n')
ORDER BY day_type, pickup_hour, trips DESC, pu_zone, do_zone;

-- Top destinations (dir = 'out') and top origins (dir = 'in') of every zone.
CREATE OR REPLACE TABLE agg_zone_links AS
WITH pairs AS (
  SELECT pu_zone, do_zone, count(*) AS trips FROM trips_clean GROUP BY ALL
), o AS (
  SELECT 'out' AS dir, pu_zone AS zone_id, do_zone AS other_zone, trips FROM pairs
  QUALIFY row_number() OVER (PARTITION BY pu_zone ORDER BY trips DESC, do_zone) <= getvariable('zone_top_n')
), i AS (
  SELECT 'in' AS dir, do_zone AS zone_id, pu_zone AS other_zone, trips FROM pairs
  QUALIFY row_number() OVER (PARTITION BY do_zone ORDER BY trips DESC, pu_zone) <= getvariable('zone_top_n')
)
SELECT * FROM o UNION ALL SELECT * FROM i
ORDER BY dir, zone_id, trips DESC, other_zone;
