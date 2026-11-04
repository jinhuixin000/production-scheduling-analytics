SET search_path TO production;
DO $quality$
BEGIN
  IF EXISTS (
    SELECT FROM case_profile WHERE jobs<>expected_jobs OR machines<>expected_machines
      OR operations<>expected_operations
  ) THEN RAISE EXCEPTION 'Instance counts differ from source'; END IF;

  IF EXISTS (
    SELECT FROM benchmark_instances b CROSS JOIN (VALUES ('FIFO'),('SPT'),('LPT')) AS policy(rule)
    LEFT JOIN scheduling_scenarios s USING(instance_id,rule)
    LEFT JOIN schedule_results r USING(instance_id,rule)
    GROUP BY b.instance_id,policy.rule,b.expected_operations,s.rule
    HAVING s.rule IS NULL OR count(r.operation_id)<>b.expected_operations
  ) THEN RAISE EXCEPTION 'Incomplete scenario'; END IF;

  IF EXISTS (
    SELECT FROM (
      SELECT step,row_number() OVER (PARTITION BY instance_id,job_id ORDER BY step)-1 AS expected
      FROM operations
    ) steps WHERE step<>expected
  ) THEN RAISE EXCEPTION 'Missing job step'; END IF;

  IF EXISTS (SELECT FROM schedule_detail WHERE start_time<ready_time
              OR end_time-start_time<>duration)
  THEN RAISE EXCEPTION 'Invalid job order or processing duration'; END IF;

  IF EXISTS (
    SELECT FROM (
      SELECT start_time,lag(end_time) OVER
        (PARTITION BY instance_id,rule,machine_id ORDER BY start_time,operation_id) AS previous_end
      FROM schedule_detail
    ) lanes WHERE start_time<previous_end
  ) THEN RAISE EXCEPTION 'Machine overlap'; END IF;
END
$quality$;
