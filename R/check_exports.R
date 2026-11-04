if (dir.exists(".r-library")) .libPaths(c(".r-library", .libPaths()))
source("R/schedule.R")
read_output <- function(name) read.csv(file.path("outputs", paste0(name, ".csv")))
comparison <- read_output("rule_comparison")
capacity <- read_output("machine_capacity")
detail <- read_output("schedule_detail")
gaps <- read_output("machine_gaps")
jobs <- read_output("job_performance")
imbalance <- read_output("load_imbalance")
operations <- read.csv("data/processed/operations.csv")
profile <- read_output("case_profile")
stopifnot(nrow(comparison) == nrow(profile) * 3L)
for (i in seq_len(nrow(comparison))) {
  s <- comparison[i, ]
  select <- function(x) x[x$instance_id == s$instance_id & x$rule == s$rule, ]
  o <- operations[operations$instance_id == s$instance_id, ]
  d <- select(detail)
  m <- select(capacity)
  g <- select(gaps)
  j <- select(jobs)
  p <- profile[profile$instance_id == s$instance_id, ]
  stopifnot(nrow(m) == p$machines, nrow(j) == p$jobs)
  validate_schedule(o, d[c("operation_id", "start_time", "end_time")])
  span <- max(d$end_time)
  busy <- vapply(m$machine_id, function(id) sum(o$duration[o$machine_id == id]), integer(1))
  idle <- vapply(m$machine_id, function(id) sum(g$gap[g$machine_id == id]), integer(1))
  wait <- vapply(j$job_id, function(id) sum(o$duration[o$job_id == id]), integer(1))
  fifo <- comparison$makespan[comparison$instance_id == s$instance_id &
                               comparison$rule == "FIFO"]
  cv <- sqrt(mean((busy - mean(busy))^2)) / mean(busy)
  stopifnot(span == s$makespan, all(busy == m$busy), all(idle == m$idle),
            all(idle + busy == span), sum(idle) == s$total_idle,
            isTRUE(all.equal(sum(busy) / (span * nrow(m)), s$avg_utilization)),
            isTRUE(all.equal((fifo - span) / fifo, s$improvement)),
            isTRUE(all.equal(cv, imbalance$load_cv[imbalance$instance_id == s$instance_id])),
            all(j$completion_time - wait == j$total_wait))
}
print(comparison, row.names = FALSE)
message("R and SQL outputs agree.")
