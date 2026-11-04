dir.create("app/data", recursive = TRUE, showWarnings = FALSE)
files <- paste0(c("case_profile", "rule_comparison", "schedule_detail",
                  "machine_capacity", "job_performance", "high_load_gaps"), ".csv")
stopifnot(all(file.exists(file.path("outputs", files))))
stopifnot(all(file.copy(file.path("outputs", files), "app/data", overwrite = TRUE)))
