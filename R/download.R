if (dir.exists(".r-library")) .libPaths(c(".r-library", .libPaths()))
sources <- read.csv("data/raw/sources.csv")
for (i in seq_len(nrow(sources))) {
  row <- sources[i, ]
  target <- file.path("data/raw", paste0(row$instance_id, ".json"))
  temporary <- tempfile(fileext = ".json")
  download.file(row$source_url, temporary, mode = "wb")
  stopifnot(digest::digest(readBin(temporary, "raw", n = file.size(temporary)), algo = "sha256", serialize = FALSE) == row$sha256)
  stopifnot(file.copy(temporary, target, overwrite = TRUE))
  unlink(temporary)
}

