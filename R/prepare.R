if (dir.exists(".r-library")) .libPaths(c(".r-library", .libPaths()))
source("R/schedule.R")

read_instance <- function(meta) {
  path <- file.path("data/raw", paste0(meta$instance_id, ".json"))
  stopifnot(digest::digest(readBin(path, "raw", n = file.size(path)), algo = "sha256", serialize = FALSE) == meta$sha256)
  raw <- jsonlite::fromJSON(path)
  operations <- setNames(
    raw$operations[c("operation", "job", "machine", "step", "duration")],
    c("operation_id", "job_id", "machine_id", "step", "duration")
  )
  edges <- raw$precedences
  stopifnot(raw$instance == meta$instance_id, raw$jobs == meta$expected_jobs,
            raw$machines == meta$expected_machines, !anyNA(operations),
            all(raw$operations$option == 0L), all(operations$duration > 0L),
            nrow(operations) == meta$expected_operations,
            !anyDuplicated(operations$operation_id),
            setequal(operations$job_id, seq_len(raw$jobs) - 1L),
            setequal(operations$machine_id, seq_len(raw$machines) - 1L))
  expected <- do.call(rbind, lapply(split(operations, operations$job_id), function(job) {
    job <- job[order(job$step), ]
    stopifnot(identical(job$step, seq_len(nrow(job)) - 1L))
    data.frame(before = head(job$operation_id, -1L), after = job$operation_id[-1L])
  }))
  stopifnot(nrow(edges) == meta$precedence_count, !anyNA(edges),
            nrow(edges) == nrow(expected),
            setequal(paste(edges$before, edges$after),
                     paste(expected$before, expected$after)))
  operations
}

check_dispatch <- function() {
  # Two jobs released together, same machine. Touching intervals are legal.
  operations <- data.frame(operation_id = 0:1, job_id = 0:1,
                           machine_id = 0L, step = 0L, duration = c(4L, 1L))
  fifo <- dispatch(operations, "FIFO")
  spt <- dispatch(operations, "SPT")
  stopifnot(identical(fifo$start_time, c(0L, 4L)),
            identical(spt$start_time, c(1L, 0L)),
            identical(dispatch(operations, "LPT"), fifo))
  validate_schedule(operations, spt)
  spt$start_time[1] <- 0L
  spt$end_time[1] <- 4L
  stopifnot(inherits(try(validate_schedule(operations, spt), silent = TRUE), "try-error"))
}

check_dispatch()
metadata <- read.csv("data/raw/sources.csv")
case <- commandArgs(trailingOnly = TRUE)
if (length(case)) {
  stopifnot(all(case %in% metadata$instance_id))
  metadata <- metadata[metadata$instance_id %in% case, ]
}
tables <- list(benchmark_instances = metadata)
rules <- c("FIFO", "SPT", "LPT")
for (i in seq_len(nrow(metadata))) {
  meta <- metadata[i, ]
  id <- meta$instance_id
  operations <- read_instance(meta)
  schedules <- lapply(rules, function(rule) {
    result <- dispatch(operations, rule)
    validate_schedule(operations, result)
    data.frame(instance_id = id, rule, result)
  })
  # Hand check: ft06 operation 0 (job 0) wins the FIFO release tie on machine 2.
  if (id == "ft06") {
    first <- schedules[[1]][schedules[[1]]$operation_id == 0L, ]
    stopifnot(first$start_time == 0L, first$end_time == 1L)
  }
  rows <- list(
    jobs = data.frame(instance_id = id, job_id = sort(unique(operations$job_id))),
    machines = data.frame(instance_id = id, machine_id = sort(unique(operations$machine_id))),
    operations = data.frame(instance_id = id, operations),
    scheduling_scenarios = data.frame(instance_id = id, rule = rules, policy_version = "1"),
    schedule_results = do.call(rbind, schedules)
  )
  for (name in names(rows)) tables[[name]] <- rbind(tables[[name]], rows[[name]])
  message(id, ": ", nrow(operations), " operations; FIFO/SPT/LPT makespans = ",
          paste(vapply(schedules, function(x) max(x$end_time), integer(1)), collapse = "/"))
}
dir.create("data/processed", recursive = TRUE, showWarnings = FALSE)
for (name in names(tables)) {
  write.csv(tables[[name]], file.path("data/processed", paste0(name, ".csv")),
            row.names = FALSE)
}


