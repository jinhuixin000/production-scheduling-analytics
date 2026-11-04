BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET search_path TO production;
\ir quality.sql
\copy (SELECT * FROM case_profile ORDER BY 1,2) TO 'outputs/case_profile.csv' CSV HEADER
\copy (SELECT * FROM job_load ORDER BY 1,2) TO 'outputs/job_load.csv' CSV HEADER
\copy (SELECT * FROM machine_load ORDER BY 1,2) TO 'outputs/machine_load.csv' CSV HEADER
\copy (SELECT * FROM machine_work ORDER BY 1,2) TO 'outputs/machine_work.csv' CSV HEADER
\copy (SELECT * FROM long_operations ORDER BY 1,2) TO 'outputs/long_operations.csv' CSV HEADER
\copy (SELECT * FROM machine_capacity ORDER BY 1,2) TO 'outputs/machine_capacity.csv' CSV HEADER
\copy (SELECT * FROM machine_gaps ORDER BY 1,2) TO 'outputs/machine_gaps.csv' CSV HEADER
\copy (SELECT * FROM load_imbalance ORDER BY 1,2) TO 'outputs/load_imbalance.csv' CSV HEADER
\copy (SELECT * FROM scenario_summary ORDER BY 1,2) TO 'outputs/scenario_summary.csv' CSV HEADER
\copy (SELECT * FROM job_performance ORDER BY 1,2) TO 'outputs/job_performance.csv' CSV HEADER
\copy (SELECT * FROM rule_comparison ORDER BY 1,2) TO 'outputs/rule_comparison.csv' CSV HEADER
\copy (SELECT * FROM high_load_gaps ORDER BY 1,2) TO 'outputs/high_load_gaps.csv' CSV HEADER
\copy (SELECT * FROM schedule_detail ORDER BY instance_id,rule,machine_id,start_time) TO 'outputs/schedule_detail.csv' CSV HEADER
COMMIT;
