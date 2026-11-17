-- 01 · Profile the raw file before touching it.
-- raw_trips is a view over the untouched official Parquet file.

-- name: raw_summary
SELECT
  count(*)                    AS raw_rows,
  min(tpep_pickup_datetime)   AS min_pickup,
  max(tpep_pickup_datetime)   AS max_pickup,
  count(DISTINCT VendorID)    AS vendors
FROM raw_trips;

-- name: duplicate_rows
-- Exact duplicates on the natural key of a trip record.
SELECT coalesce(sum(n - 1), 0) AS duplicate_rows
FROM (
  SELECT count(*) AS n
  FROM raw_trips
  GROUP BY VendorID, tpep_pickup_datetime, tpep_dropoff_datetime,
           PULocationID, DOLocationID, trip_distance, total_amount
  HAVING count(*) > 1
);
