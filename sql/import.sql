BEGIN;
SET search_path TO production;
CREATE TEMP TABLE source_batch (LIKE benchmark_instances) ON COMMIT DROP;
\copy source_batch FROM 'data/processed/benchmark_instances.csv' CSV HEADER
-- Serialize concurrent imports and keep unselected cases intact.
LOCK TABLE benchmark_instances IN SHARE ROW EXCLUSIVE MODE;
DELETE FROM benchmark_instances b USING source_batch s WHERE b.instance_id=s.instance_id;
INSERT INTO benchmark_instances SELECT * FROM source_batch;
\copy jobs FROM 'data/processed/jobs.csv' CSV HEADER
\copy machines FROM 'data/processed/machines.csv' CSV HEADER
\copy operations FROM 'data/processed/operations.csv' CSV HEADER
\copy scheduling_scenarios FROM 'data/processed/scheduling_scenarios.csv' CSV HEADER
\copy schedule_results FROM 'data/processed/schedule_results.csv' CSV HEADER
\ir quality.sql
COMMIT;
