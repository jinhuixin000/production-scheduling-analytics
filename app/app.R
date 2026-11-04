library(shiny)
library(plotly)

read_result <- function(name) {
  read.csv(file.path("data", paste0(name, ".csv")))
}
profile <- read_result("case_profile")
summary <- read_result("rule_comparison")
detail <- read_result("schedule_detail")
capacity <- read_result("machine_capacity")
jobs <- read_result("job_performance")
gaps <- read_result("high_load_gaps")
policies <- c("FIFO", "SPT", "LPT")
colors <- c("#17588a", "#31796a", "#a64e28", "#8055a2", "#ad345c",
            "#587629", "#3455b1", "#087e87", "#965c10", "#5a6172")
percentage <- function(x) sprintf("%.1f%%", 100 * x)
rule_order <- function(rows) rows[order(match(rows$rule, policies)), ]

card <- function(label, value) div(class = "metric", span(label), strong(value))
ui <- fluidPage(
  tags$head(tags$link(rel = "stylesheet", href = "dashboard.css")),
  div(class = "hero", span(class = "eyebrow", "製造營運分析　/　JSPLIB"),
      h1("生產排程與產能利用率分析"),
      p("同一批工序、三種派工規則。比較完工跨度、機台空檔與工件等待。")),
  div(class = "filters",
      selectInput("case", "基準案例", profile$instance_id,
                  selected = intersect(c("ft10", profile$instance_id), profile$instance_id)[1]),
      selectInput("rule", "派工規則", policies)),
  tabsetPanel(id = "section",
    tabPanel("總覽", div(class = "panel", h2("所選情境"),
      uiOutput("metrics"),
      p("時間單位沿用基準案例。所有工件於 0 釋出，機台在整個完工跨度內可用。"),
      p("JSPLib 公開基準資料與模擬排程。"))),
    tabPanel("生產排程", div(class = "panel", h2("機台甘特圖"),
      div(class = "filters", uiOutput("machines"), uiOutput("job_filter")),
      p("色彩代表工件。移至區段查看原始工序 ID、機台、就緒、開工與完成時間。"),
      plotlyOutput("gantt", height = "490px"), tableOutput("operations"))),
    tabPanel("產能與負荷", div(class = "panel", h2("機台加工與閒置"),
      p("加工負荷在規則之間固定。最高加工負荷機台列為後續分析候選。"),
      plotlyOutput("load", height = "370px"), tableOutput("capacity"),
      h3("最高負荷候選機台的空檔"), tableOutput("gaps"))),
    tabPanel("規則比較", div(class = "panel", h2("同一案例的三種規則"),
      p("FIFO 為基準。改善率為（FIFO 完工跨度 − 方案完工跨度）÷ FIFO 完工跨度。"),
      tableOutput("comparison"),
      selectInput("job_metric", "工件指標", c("完工時間" = "completion_time",
                                                "總等待時間" = "total_wait")),
      plotlyOutput("jobs", height = "390px"))),
    tabPanel("作品說明", div(class = "panel prose", h2("資料與重現"),
      p("Fisher–Thompson（1963）與 Lawrence（1984）案例，由 ScheduleOpt JSPLib 提供。"),
      p(tags$a("基準資料來源", href = "https://scheduleopt.github.io/benchmarks/jsplib"),
        "　", tags$a("資料授權 CC BY-SA 4.0", href = "https://creativecommons.org/licenses/by-sa/4.0/")),
      p("原始 JSON 保留上游編號。R 檢查先後關係並生成排程，PostgreSQL 驗證並匯出 CSV，Shiny 讀取已驗證結果。重現命令見專案 README。"),
      p("加工不可中斷，工序機台固定，未建模換線、停機、到期日及人員。三種規則均屬啟發式派工。")))
  )
)

server <- function(input, output, session) {
  by_case <- function(rows) rows[rows$instance_id == input$case, , drop = FALSE]
  by_rule <- function(rows) {
    selected <- by_case(rows)
    selected[selected$rule == input$rule, , drop = FALSE]
  }
  current <- reactive(by_rule(detail))
  output$metrics <- renderUI({
    p <- by_case(profile)
    s <- by_rule(summary)
    div(class = "metrics",
        card("工件／機台／工序", paste(p$jobs, p$machines, p$operations, sep = " / ")),
        card("完工跨度", s$makespan),
        card("平均機台利用率", percentage(s$avg_utilization)),
        card("總機台閒置", s$total_idle),
        card("相對 FIFO 改善率", percentage(s$improvement)))
  })
  output$machines <- renderUI({
    ids <- sort(unique(current()$machine_id))
    selectInput("machine", "機台", c("全部" = "all", setNames(ids, paste0("M", ids))))
  })
  output$job_filter <- renderUI({
    ids <- sort(unique(current()$job_id))
    selectInput("job", "工件", c("全部" = "all", setNames(ids, paste0("J", ids))))
  })
  filtered <- reactive({
    rows <- current()
    machine <- input$machine
    job <- input$job
    if (!is.null(machine) && machine != "all") rows <- rows[rows$machine_id == machine, ]
    if (!is.null(job) && job != "all") rows <- rows[rows$job_id == job, ]
    rows
  })
  output$gantt <- renderPlotly({
    d <- filtered()
    validate(need(nrow(d), "所選條件沒有工序。"))
    d$job <- paste0("J", d$job_id)
    d$machine <- paste0("M", d$machine_id)
    d$width <- d$end_time - d$start_time
    d$tooltip <- sprintf("工件 %s · 機台 %s<br>工序 ID %d · 步驟 %d<br>就緒 %d · 開工 %d · 完成 %d<br>加工 %d",
                         d$job, d$machine, d$operation_id, d$step,
                         d$ready_time, d$start_time, d$end_time, d$duration)
    p <- plot_ly()
    for (id in sort(unique(d$job_id))) {
      rows <- d[d$job_id == id, ]
      p <- add_bars(p, data = rows, x = ~width, base = ~start_time, y = ~machine,
                    orientation = "h", name = paste0("J", id),
                    marker = list(color = colors[id + 1L]), textposition = "none",
                    hovertext = ~tooltip, hovertemplate = "%{hovertext}<extra></extra>")
    }
    layout(p, barmode = "overlay", hovermode = "closest",
           xaxis = list(title = "時間單位", range = c(0, by_rule(summary)$makespan)),
           yaxis = list(title = "機台", categoryorder = "array",
                        categoryarray = paste0("M", sort(unique(d$machine_id), decreasing = TRUE))),
           legend = list(orientation = "h", y = -0.22))
  })
  output$operations <- renderTable({
    d <- filtered()
    data.frame(工件 = d$job_id, 工序ID = d$operation_id, 步驟 = d$step,
               機台 = d$machine_id, 就緒 = d$ready_time, 開工 = d$start_time,
               完成 = d$end_time, 加工 = d$duration, 等待 = d$start_time - d$ready_time)
  }, digits = 0)
  output$load <- renderPlotly({
    d <- by_rule(capacity)
    d$machine <- paste0("M", d$machine_id)
    plot_ly(d, x = ~machine) |>
      add_bars(y = ~busy, name = "加工", marker = list(color = "#17588a")) |>
      add_bars(y = ~idle, name = "閒置", marker = list(color = "#d2dce6")) |>
      layout(barmode = "stack", xaxis = list(title = "機台"),
             yaxis = list(title = "時間單位"))
  })
  output$capacity <- renderTable({
    d <- by_rule(capacity)
    d <- d[order(d$machine_id), ]
    data.frame(機台 = d$machine_id, 加工負荷 = d$busy,
               利用率 = percentage(d$utilization), 閒置 = d$idle,
               高負荷候選 = ifelse(d$high_load == "t", "是", ""))
  }, digits = 0)
  output$gaps <- renderTable({
    d <- rule_order(by_case(gaps))
    data.frame(規則 = d$rule, 機台 = d$machine_id, 開頭 = d$leading,
               中間 = d$internal, 結尾 = d$trailing, 總閒置 = d$idle)
  }, digits = 0)
  output$comparison <- renderTable({
    d <- rule_order(by_case(summary))
    data.frame(規則 = d$rule, 完工跨度 = d$makespan, 平均利用率 = percentage(d$avg_utilization),
               總閒置 = d$total_idle, 相對FIFO = percentage(d$improvement))
  }, digits = 0)
  output$jobs <- renderPlotly({
    d <- rule_order(by_case(jobs))
    d$job <- paste0("J", d$job_id)
    d$value <- d[[input$job_metric]]
    d$rule <- factor(d$rule, levels = policies)
    plot_ly(d, x = ~job, y = ~value, color = ~rule, colors = colors[1:3], type = "bar") |>
      layout(barmode = "group", xaxis = list(title = "工件"),
             yaxis = list(title = "時間單位"))
  })
}

shinyApp(ui, server)
