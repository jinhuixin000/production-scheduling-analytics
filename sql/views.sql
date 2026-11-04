SET search_path TO production;

CREATE OR REPLACE VIEW schedule_detail AS
SELECT r.instance_id,r.rule,r.operation_id,o.job_id,o.machine_id,o.step,o.duration,
       r.start_time,r.end_time,
       lag(r.end_time,1,0) OVER
         (PARTITION BY r.instance_id,r.rule,o.job_id ORDER BY o.step) AS ready_time
FROM schedule_results r JOIN operations o USING(instance_id,operation_id);

CREATE OR REPLACE VIEW scenario_span AS
SELECT instance_id,rule,max(end_time) AS makespan
FROM schedule_results GROUP BY 1,2;

CREATE OR REPLACE VIEW case_profile AS
SELECT b.instance_id, b.expected_jobs, b.expected_machines, b.expected_operations,
       (SELECT count(*) FROM jobs j WHERE j.instance_id=b.instance_id) AS jobs,
       (SELECT count(*) FROM machines m WHERE m.instance_id=b.instance_id) AS machines,
       (SELECT count(*) FROM operations o WHERE o.instance_id=b.instance_id) AS operations
FROM benchmark_instances b;

CREATE OR REPLACE VIEW job_load AS
WITH loads AS (
  SELECT instance_id, job_id, sum(duration) AS busy FROM operations GROUP BY 1,2
)
SELECT *, dense_rank() OVER (PARTITION BY instance_id ORDER BY busy DESC) AS load_rank
FROM loads;

CREATE OR REPLACE VIEW machine_load AS
WITH loads AS (
  SELECT m.instance_id,m.machine_id,coalesce(sum(o.duration),0) AS busy,
         count(o.operation_id) AS operation_count,avg(o.duration) AS avg_duration
  FROM machines m LEFT JOIN operations o USING (instance_id,machine_id)
  GROUP BY 1,2
)
SELECT *, busy::numeric / sum(busy) OVER (PARTITION BY instance_id) AS load_share,
       dense_rank() OVER (PARTITION BY instance_id ORDER BY busy DESC) AS load_rank
FROM loads;

CREATE OR REPLACE VIEW machine_work AS
SELECT instance_id,machine_id,operation_count,avg_duration FROM machine_load;

CREATE OR REPLACE VIEW long_operations AS
WITH ranked AS (
  SELECT *, row_number() OVER
    (PARTITION BY instance_id ORDER BY duration DESC,operation_id) AS position
  FROM operations
)
SELECT * FROM ranked WHERE position <= 10;

CREATE OR REPLACE VIEW machine_capacity AS
SELECT s.instance_id,s.rule,m.machine_id,m.busy,s.makespan,
       m.busy::numeric / s.makespan AS utilization,s.makespan-m.busy AS idle,
       m.load_rank=1 AS high_load
FROM scenario_span s JOIN machine_load m USING(instance_id);

CREATE OR REPLACE VIEW machine_gaps AS
WITH intervals AS (
  SELECT *,lag(end_time,1,0) OVER w AS previous_end,
           row_number() OVER w AS position
  FROM schedule_detail
  WINDOW w AS (PARTITION BY instance_id,rule,machine_id ORDER BY start_time,operation_id)
), tails AS (
  SELECT c.instance_id,c.rule,c.machine_id,c.makespan,coalesce(max(d.end_time),0) AS last_end
  FROM machine_capacity c LEFT JOIN schedule_detail d USING(instance_id,rule,machine_id)
  GROUP BY 1,2,3,4
)
SELECT instance_id,rule,machine_id,
       CASE WHEN position=1 THEN 'leading' ELSE 'internal' END AS gap_type,
       previous_end AS gap_start,start_time AS gap_end,start_time-previous_end AS gap
FROM intervals WHERE start_time>previous_end
UNION ALL
SELECT instance_id,rule,machine_id,'trailing',last_end,makespan,makespan-last_end
FROM tails WHERE makespan>last_end;

CREATE OR REPLACE VIEW load_imbalance AS
SELECT instance_id,max(busy)-min(busy) AS load_range,
       stddev_pop(busy)/nullif(avg(busy),0) AS load_cv
FROM machine_load GROUP BY 1;

CREATE OR REPLACE VIEW scenario_summary AS
SELECT instance_id,rule,makespan,avg(utilization) AS avg_utilization,
       sum(idle) AS total_idle
FROM machine_capacity GROUP BY 1,2,3;

CREATE OR REPLACE VIEW job_performance AS
SELECT instance_id,rule,job_id,max(end_time) AS completion_time,
       sum(start_time-ready_time) AS total_wait
FROM schedule_detail GROUP BY 1,2,3;

CREATE OR REPLACE VIEW rule_comparison AS
SELECT s.*, (f.makespan-s.makespan)::numeric / f.makespan AS improvement
FROM scenario_summary s JOIN scenario_summary f USING(instance_id)
WHERE f.rule='FIFO';

CREATE OR REPLACE VIEW high_load_gaps AS
SELECT c.instance_id,c.rule,c.machine_id,c.busy,c.idle,
       coalesce(sum(g.gap) FILTER (WHERE g.gap_type='leading'),0) AS leading,
       coalesce(sum(g.gap) FILTER (WHERE g.gap_type='internal'),0) AS internal,
       coalesce(sum(g.gap) FILTER (WHERE g.gap_type='trailing'),0) AS trailing
FROM machine_capacity c LEFT JOIN machine_gaps g USING(instance_id,rule,machine_id)
WHERE c.high_load
GROUP BY 1,2,3,4,5;
