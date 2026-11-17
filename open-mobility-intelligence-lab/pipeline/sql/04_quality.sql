-- 04 · Quality evidence shown on the Data Engineering page.

-- name: exclusions
SELECT coalesce(exclusion_rule, 'KEPT') AS rule, count(*) AS n
FROM trips_flagged GROUP BY 1 ORDER BY 1;

-- name: outliers_iqr
-- Tukey fences on the cleaned table. These rows are FLAGGED, not removed:
-- a $70 airport fare is a statistical outlier but a perfectly valid trip.
WITH q AS (
  SELECT
    quantile_cont(distance_mi, [0.25, 0.5, 0.75, 0.99]) AS d,
    quantile_cont(fare_amount, [0.25, 0.5, 0.75, 0.99]) AS f,
    quantile_cont(duration_s / 60.0, [0.25, 0.5, 0.75, 0.99]) AS t,
    quantile_cont(speed_mph, [0.25, 0.5, 0.75, 0.99]) AS s
  FROM trips_clean
), m AS (
  SELECT 'distance_mi' AS metric, d AS q FROM q UNION ALL
  SELECT 'fare_usd', f FROM q UNION ALL
  SELECT 'duration_min', t FROM q UNION ALL
  SELECT 'speed_mph', s FROM q
)
SELECT
  metric,
  q[1] AS p25, q[2] AS p50, q[3] AS p75, q[4] AS p99,
  q[3] + 1.5 * (q[3] - q[1]) AS upper_fence,
  CASE metric
    WHEN 'distance_mi'  THEN (SELECT count(*) FROM trips_clean WHERE distance_mi       > m.q[3] + 1.5 * (m.q[3] - m.q[1]))
    WHEN 'fare_usd'     THEN (SELECT count(*) FROM trips_clean WHERE fare_amount       > m.q[3] + 1.5 * (m.q[3] - m.q[1]))
    WHEN 'duration_min' THEN (SELECT count(*) FROM trips_clean WHERE duration_s / 60.0 > m.q[3] + 1.5 * (m.q[3] - m.q[1]))
    ELSE                     (SELECT count(*) FROM trips_clean WHERE speed_mph         > m.q[3] + 1.5 * (m.q[3] - m.q[1]))
  END AS flagged_rows
FROM m;

-- name: headline_kpis
SELECT
  count(*)                               AS total_trips,
  sum(distance_mi)                       AS total_distance_mi,
  avg(distance_mi)                       AS avg_distance_mi,
  avg(fare_amount)                       AS avg_fare_usd,
  sum(fare_amount)                       AS total_fare_usd,
  avg(duration_s) / 60.0                 AS avg_duration_min,
  sum(distance_mi) / (sum(duration_s) / 3600.0) AS avg_speed_mph
FROM trips_clean;
