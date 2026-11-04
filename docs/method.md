# 方法、資料與限制

## 來源與授權

資料取自 [ScheduleOpt benchmarks 的 JSPLib](https://scheduleopt.github.io/benchmarks/jsplib)，固定 commit `8a6e36ef31263d36975e56fb481e0ba04e188d6f`，下載日期 2026-11-04。每案網址、SHA-256、筆數與下載日期見 [sources.csv](../data/raw/sources.csv)。案例出自 Fisher 與 Thompson（1963）的 ft06／ft10，以及 Lawrence（1984）的 la01。完整來源清單與書目見 [JSPLib 官方頁](https://scheduleopt.github.io/benchmarks/jsplib)。

上游資料以 [CC BY-SA 4.0](https://github.com/ScheduleOpt/benchmarks/blob/8a6e36ef31263d36975e56fb481e0ba04e188d6f/LICENSE) 提供。JSON 原樣保存。改作包括欄位重新命名、正規化、加入 R 產生的排程時刻、SQL 聚合及視覺化。隨附資料與含資料改作的匯出及圖表沿用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。公開轉載保留案例作者、ScheduleOpt 來源、版本、授權與修改說明。

三案原始 JSON 的工序全為 option 0，使用固定機台。保留原始零起算 job、machine、operation、step。R 以每個工件的相鄰 step 生成預期邊，比對全部 precedences 的 before、after，分別通過 30／90／40 條。JSON 陣列的排列本身不作為先後順序的依據。

## 派工

- 初始所有工件首道工序可在時間 0 進入佇列。後續工序在前道完工的同一時間就緒。
- 每個事件先由全部已到達的完工時間判定機台釋放與工序就緒，再對每台空閒機台安排一個已就緒且指定到該機台的候選。加工時間為正，故同一事件新開工的工序不會立即解鎖後續工序。
- FIFO 依就緒時間由早到晚。SPT 以當道加工時間由短到長。LPT 由長到短。SPT／LPT 平手先取較早就緒者。之後按原始工件 ID、工序 ID 升序。
- 開工後連續加工至完工。若仍有未排工序，時鐘跳到下一個完工事件。允許相鄰區間在端點相接。
- 全部機台從 0 到 Makespan 均可用，無換線、搬運、班次、到期日、停機與人員。三種派工均為啟發式。最高負荷用來挑選後續分析對象，完整瓶頸判定需要額外證據。基準可用於排程方法比較，實際 OEE、交期與成本成效需要對應營運資料。

## 指標口徑

| 指標 | 計算 |
|---|---|
| Makespan | 最後完工時點減去時間 0 |
| 機台利用率 | 該機台加工總時間 ÷ 情境 Makespan |
| 平均利用率 | 同情境各機台利用率的算術平均 |
| 機台閒置 | Makespan − 該機台加工量 |
| 開頭／中間／結尾空檔 | 0 至首道開工／兩道之間／最後完工至 Makespan |
| 工序等待 | 開工 − 就緒，首道工序就緒為 0 |
| 工件完工 | 工件最後一道工序完工時點 |
| 改善率 | （FIFO Makespan − 方案 Makespan）÷ FIFO Makespan |
| 負荷不均衡 CV | 機台加工量母體標準差 ÷ 平均加工量 |

## 驗證分工

資料庫複合鍵、外鍵、非空與 CHECK 保護識別碼、唯一性、有效工時與時點。R 先驗證 SHA-256、原始欄位、先後邊、排程合法性，並抽查 ft06 工序 0 在 FIFO 下的機台 2、開工 0 與完工 1。人工構造雙工件同機台測試平手、同端點相接及重疊拒絕。SQL 匯入交易再次檢查筆數、規則完整性、步驟連續性、原始工時、工件順序與同機台重疊。R 從匯出檔重新核對 Makespan、利用率、機台空檔、工件等待、CV 和相對改善率。
