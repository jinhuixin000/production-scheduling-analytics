CREATE SCHEMA IF NOT EXISTS production;
SET search_path TO production;
CREATE TABLE IF NOT EXISTS benchmark_instances (
    instance_id text PRIMARY KEY,
    source_url text NOT NULL,
    source_commit text NOT NULL CHECK (source_commit ~ '^[0-9a-f]{40}$'),
    downloaded_on date NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    expected_jobs integer NOT NULL CHECK (expected_jobs > 0),
    expected_machines integer NOT NULL CHECK (expected_machines > 0),
    expected_operations integer NOT NULL CHECK (expected_operations > 0),
    precedence_count integer NOT NULL CHECK (precedence_count >= 0)
);
CREATE TABLE IF NOT EXISTS jobs (
    instance_id text REFERENCES benchmark_instances ON DELETE CASCADE,
    job_id integer CHECK (job_id >= 0),
    PRIMARY KEY (instance_id, job_id)
);
CREATE TABLE IF NOT EXISTS machines (
    instance_id text REFERENCES benchmark_instances ON DELETE CASCADE,
    machine_id integer CHECK (machine_id >= 0),
    PRIMARY KEY (instance_id, machine_id)
);
CREATE TABLE IF NOT EXISTS operations (
    instance_id text,
    operation_id integer CHECK (operation_id >= 0),
    job_id integer NOT NULL,
    machine_id integer NOT NULL,
    step integer NOT NULL CHECK (step >= 0),
    duration integer NOT NULL CHECK (duration > 0),
    PRIMARY KEY (instance_id, operation_id),
    UNIQUE (instance_id, job_id, step),
    FOREIGN KEY (instance_id, job_id) REFERENCES jobs ON DELETE CASCADE,
    FOREIGN KEY (instance_id, machine_id) REFERENCES machines ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS scheduling_scenarios (
    instance_id text REFERENCES benchmark_instances ON DELETE CASCADE,
    rule text CHECK (rule IN ('FIFO', 'SPT', 'LPT')),
    policy_version text NOT NULL,
    PRIMARY KEY (instance_id, rule)
);
CREATE TABLE IF NOT EXISTS schedule_results (
    instance_id text,
    rule text,
    operation_id integer,
    start_time integer NOT NULL CHECK (start_time >= 0),
    end_time integer NOT NULL CHECK (end_time > start_time),
    PRIMARY KEY (instance_id, rule, operation_id),
    FOREIGN KEY (instance_id, rule) REFERENCES scheduling_scenarios ON DELETE CASCADE,
    FOREIGN KEY (instance_id, operation_id) REFERENCES operations ON DELETE CASCADE
);
