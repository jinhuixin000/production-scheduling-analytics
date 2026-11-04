# 十二項 SQL 分析

在 DBeaver 開啟 `sql/analysis.sql`。每題的完整計算式在 `sql/views.sql` 同名 VIEW。VIEW 是可重複查詢的命名 SQL，不會複製基礎資料。

## 1. 案例規模與完整性

先各自聚合，避免工件與機台相乘。核對來源清單的三種筆數。

```sql
SELECT * FROM production.case_profile ORDER BY 1,2;
```

## 2. 工件加工需求排名

GROUP BY 彙總工件，DENSE_RANK 保留並列。各工件總和等於全案加工量。

```sql
SELECT * FROM production.job_load ORDER BY 1,2;
```

## 3. 各機台負荷與占比

LEFT JOIN 保留所有機台。視窗 SUM 取得案例分母。占比加總為 100%。

```sql
SELECT * FROM production.machine_load ORDER BY 1,2;
```

## 4. 各機台工序數與平均工時

從機台負荷 VIEW 選取工序統計。以原始工序筆數與工時除法抽核。

```sql
SELECT * FROM production.machine_work ORDER BY 1,2;
```

## 5. 最長的十道工序

ROW_NUMBER 以 duration 降冪，原始 ID 打破平手。核對每案十列且首列為最大值。

```sql
SELECT * FROM production.long_operations ORDER BY 1,2;
```

## 6. 情境利用率與閒置

JOIN 固定加工量與實際完工跨度，將最高負荷列為候選。逐列核對 busy + idle = makespan。

```sql
SELECT * FROM production.machine_capacity ORDER BY 1,2;
```

## 7. 開頭、中間、結尾空檔

LAG 找前一段結束。CASE WHEN 分類，UNION ALL 加入最後一段。依機台加總 gap，應與 idle 相同。

```sql
SELECT * FROM production.machine_gaps ORDER BY 1,2;
```

## 8. 案例負荷不均衡

用母體標準差除以平均值取得無量綱 CV。以 R 的母體標準差公式交叉核對。

```sql
SELECT * FROM production.load_imbalance ORDER BY 1,2;
```

## 9. 情境完工跨度與平均利用率

以機台粒度平均利用率並加總閒置。R 以總加工量除以機台數乘跨度核對。

```sql
SELECT * FROM production.scenario_summary ORDER BY 1,2;
```

## 10. 工件完工與排隊等待

利用工序 VIEW 的前工序完工時間，按工件彙總。首道等待為開工時間。完工減加工總和等於總等待。

```sql
SELECT * FROM production.job_performance ORDER BY 1,2;
```

## 11. 相對 FIFO 改善率

自我 JOIN 取同案例 FIFO 分母，保留負值。FIFO 為零，較慢方案為負。

```sql
SELECT * FROM production.rule_comparison ORDER BY 1,2;
```

## 12. 高負荷候選機台空檔變化

用 FILTER 彙總空檔種類。LEFT JOIN 保留無空檔機台。三類空檔總和等於該機台 idle。

```sql
SELECT * FROM production.high_load_gaps ORDER BY 1,2;
```
