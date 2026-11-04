if (dir.exists(".r-library")) .libPaths(c(".r-library", .libPaths()))
setwd("app")
app <- new.env()
sys.source("app.R", envir = app)
shiny::testServer(app$server, {
  for (id in c("ft06", "ft10", "la01")) {
    for (rule in c("FIFO", "SPT", "LPT")) {
      session$setInputs(case = id, rule = rule, machine = "all", job = "all",
                        job_metric = "completion_time")
      gantt <- jsonlite::fromJSON(output$gantt, simplifyVector = FALSE)$x$data
      stopifnot(length(gantt) > 0, all(vapply(gantt, function(trace) {
        length(trace$hovertext) > 0 &&
          all(unlist(trace$textposition, use.names = FALSE) == "none") &&
          all(unlist(trace$hovertemplate, use.names = FALSE) == "%{hovertext}<extra></extra>") &&
          length(trace$textposition) > 0 && length(trace$hovertemplate) > 0
      }, logical(1))))
      stopifnot(nrow(filtered()) == app$profile$operations[app$profile$instance_id == id],
                nchar(output$metrics$html) > 0, nchar(output$comparison) > 0,
                nchar(output$gantt) > 0, nchar(output$load) > 0,
                nchar(output$jobs) > 0, nchar(output$capacity) > 0,
                nchar(output$gaps) > 0, nchar(output$operations) > 0)
    }
  }
  session$setInputs(machine = "0", job = "0", job_metric = "total_wait")
  stopifnot(nrow(filtered()) == 1, nchar(output$gantt) > 0, nchar(output$jobs) > 0)
})
message("All nine Shiny scenarios and combined filters rendered.")
