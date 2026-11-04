dispatch <- function(operations, rule) {
  stopifnot(rule %in% c("FIFO", "SPT", "LPT"))
  n <- nrow(operations)
  start <- finish <- rep(NA_integer_, n)
  predecessor <- match(
    paste(operations$job_id, operations$step - 1L),
    paste(operations$job_id, operations$step)
  )
  time <- 0L
  while (anyNA(start)) {
    ready <- finish[predecessor]
    ready[is.na(predecessor)] <- 0L
    busy <- operations$machine_id[which(finish > time)]
    available <- which(is.na(start) & ready <= time &
                         !operations$machine_id %in% busy)

    for (machine in sort(unique(operations$machine_id[available]))) {
      candidates <- available[operations$machine_id[available] == machine]
      duration <- operations$duration[candidates]
      priority <- switch(rule, FIFO = rep(0L, length(candidates)),
                         SPT = duration, LPT = -duration)
      selected <- candidates[order(priority, ready[candidates],
                                   operations$job_id[candidates],
                                   operations$operation_id[candidates])[1]]
      start[selected] <- time
      finish[selected] <- time + operations$duration[selected]
    }
    if (anyNA(start)) {
      events <- finish[which(finish > time)]
      if (!length(events)) stop("No next event; check job chains.")
      time <- min(events)
    }
  }
  data.frame(operation_id = operations$operation_id, start_time = start,
             end_time = finish)
}

validate_schedule <- function(operations, schedule) {
  stopifnot(!anyNA(schedule), !anyDuplicated(schedule$operation_id),
            setequal(operations$operation_id, schedule$operation_id))
  schedule <- schedule[match(operations$operation_id, schedule$operation_id), ]
  stopifnot(all(schedule$start_time >= 0),
            all(schedule$end_time - schedule$start_time == operations$duration))

  for (rows in split(seq_len(nrow(operations)), operations$job_id)) {
    rows <- rows[order(operations$step[rows])]
    stopifnot(all(schedule$start_time[rows[-1L]] >=
                    schedule$end_time[head(rows, -1L)]))
  }
  for (rows in split(seq_len(nrow(operations)), operations$machine_id)) {
    rows <- rows[order(schedule$start_time[rows])]
    stopifnot(all(schedule$start_time[rows[-1L]] >=
                    schedule$end_time[head(rows, -1L)]))
  }
  invisible(TRUE)
}
