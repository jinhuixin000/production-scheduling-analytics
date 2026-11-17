-- 02 · Type, flag and filter.
-- Each raw row is assigned the FIRST rule it violates, so exclusion counts are
-- mutually exclusive and add up exactly: raw = clean + Σ excluded.

CREATE OR REPLACE TABLE trips_flagged AS
WITH typed AS (
  SELECT
    VendorID                      AS vendor_id,
    tpep_pickup_datetime          AS pickup_ts,
    tpep_dropoff_datetime         AS dropoff_ts,
    PULocationID                  AS pu_zone,
    DOLocationID                  AS do_zone,
    passenger_count,
    trip_distance                 AS distance_mi,
    fare_amount,
    tip_amount,
    total_amount,
    payment_type,
    date_diff('second', tpep_pickup_datetime, tpep_dropoff_datetime) AS duration_s
  FROM raw_trips
)
SELECT
  *,
  CASE
    WHEN pickup_ts IS NULL OR dropoff_ts IS NULL OR pu_zone IS NULL OR do_zone IS NULL
      OR distance_mi IS NULL OR fare_amount IS NULL          THEN 'R01_missing_key_field'
    WHEN pickup_ts <  getvariable('month_start')::TIMESTAMP
      OR pickup_ts >= getvariable('month_end')::TIMESTAMP    THEN 'R02_outside_month'
    WHEN duration_s <= 0                                     THEN 'R03_non_positive_duration'
    WHEN duration_s <  getvariable('min_duration_s')         THEN 'R04_duration_too_short'
    WHEN duration_s >  getvariable('max_duration_s')         THEN 'R05_duration_too_long'
    WHEN distance_mi <= 0                                    THEN 'R06_non_positive_distance'
    WHEN distance_mi >  getvariable('max_distance_mi')       THEN 'R07_distance_too_long'
    WHEN fare_amount <= 0                                    THEN 'R08_non_positive_fare'
    WHEN fare_amount >  getvariable('max_fare_usd')          THEN 'R09_fare_too_high'
    WHEN pu_zone NOT BETWEEN 1 AND getvariable('max_zone_id')
      OR do_zone NOT BETWEEN 1 AND getvariable('max_zone_id') THEN 'R10_unknown_zone'
    WHEN distance_mi / (duration_s / 3600.0)
         > getvariable('max_speed_mph')                      THEN 'R11_implausible_speed'
  END AS exclusion_rule
FROM typed;

CREATE OR REPLACE TABLE trips_clean AS
SELECT
  pickup_ts,
  dropoff_ts,
  CAST(pickup_ts AS DATE)                               AS pickup_date,
  hour(pickup_ts)                                       AS pickup_hour,
  isodow(pickup_ts)                                     AS iso_dow,       -- 1 = Monday … 7 = Sunday
  CASE WHEN isodow(pickup_ts) <= 5 THEN 1 ELSE 2 END    AS day_type,      -- 1 = weekday, 2 = weekend
  pu_zone,
  do_zone,
  passenger_count,
  distance_mi,
  fare_amount,
  tip_amount,
  total_amount,
  payment_type,
  duration_s,
  distance_mi / (duration_s / 3600.0)                   AS speed_mph
FROM trips_flagged
WHERE exclusion_rule IS NULL;
