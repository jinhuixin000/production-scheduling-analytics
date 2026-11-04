summary <- read.csv("outputs/rule_comparison.csv")
rules <- c("FIFO", "SPT", "LPT")
cases <- c("ft06", "ft10", "la01")
palette <- c("#536a82", "#168378", "#aa573e")
svg("outputs/makespan.svg", width = 10, height = 4.4)
par(mfrow = c(1, 3), mar = c(4, 4, 3, 1), oma = c(0, 0, 2, 0))
for (id in cases) {
  rows <- summary[summary$instance_id == id, ]
  values <- rows$makespan[match(rules, rows$rule)]
  bars <- barplot(values, names.arg = rules, col = palette, border = NA,
                  ylim = c(0, max(values) * 1.23), main = id,
                  ylab = "Makespan (time units)")
  text(bars, values, values, pos = 3, cex = 0.85)
}
mtext("Dispatch rule comparison | JSPLib benchmark", side = 3, outer = TRUE,
      line = 0.4, font = 2)
invisible(dev.off())
