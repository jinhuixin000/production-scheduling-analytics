# 免費公開部署

查核日期 2026-11-04。以 **Posit Connect Cloud Free + 公開 GitHub 專案** 為目標。部署包是 `app/`，包含 `app.R`、`renv.lock`、樣式與已驗證的 SQL CSV。雲端從快照讀取，省去資料庫主機與對外連線成本。

| 服務 | 額度、休眠與公開設定 |
|---|---|
| Posit Connect Cloud Free | US$0、5 個 App、每月 20 credits、每 App 上限 1 CPU／4 GB。1 CPU／1 GB 用 1 credit／小時。預設閒置 worker 在無連線後 5 秒停止，瀏覽器連線閒置預設 60 分鐘。依 Posit 說明，2026-11-01 起開始的使用週期將執行額度上限，超額則 App 暫停到下一週期。免費層內容公開，訪客可用連結開啟。 |
| shinyapps.io Free | US$0、5 個 App、25 active hours。預設閒置 15 分鐘後休眠，閒置計入、休眠不計。免費層公開，訪客驗證在 Standard／Professional。官方安排自 2027-01-28 遷移免費帳戶至 Connect Cloud。 |

[Connect Cloud 方案](https://connect.posit.cloud/plans?feature=cpu&selectedPlan=current) · [額度](https://docs.posit.co/connect-cloud/user/usage.html) · [休眠](https://docs.posit.co/connect-cloud/user/manage/content_settings.html) · [分享](https://docs.posit.co/connect-cloud/user/share/) · [shinyapps.io 方案](https://www.shinyapps.io/) · [使用時間與外部資料庫](https://docs.posit.co/shinyapps.io/guide/applications/) · [驗證](https://docs.posit.co/shinyapps.io/guide/authentication_and_user_management/) · [遷移](https://docs.posit.co/shinyapps.io/guide/migration/)

兩平台均有外部資料庫連線文件。若日後改成即時 PostgreSQL，須另行驗證可路由的資料庫主機、平台出口 IP、資料庫防火牆、TLS 與憑證。Connect Cloud 有加密 secret variables。雲端的 localhost 指向雲端執行環境。本作品直接使用 SQL 匯出的 CSV，無須為這個作品對外開放 Windows 上的 PostgreSQL。[Connect Cloud 網路](https://docs.posit.co/connect-cloud/user/platform/system.html) · [秘密變數與資料庫](https://docs.posit.co/connect-cloud/user/platform/security.html)

## 資料流程與發布範圍

公開基準 JSON → R 排程與合法性檢查 → 本機 PostgreSQL 分析及匯出 → `outputs/` → `R/check_exports.R` 交叉核對 → `R/publish_data.R` 將六份 CSV 複製到 `app/data/` → Shiny 讀取快照。PostgreSQL 只用於重新產生分析結果。瀏覽器連到雲端 Shiny，雲端不連到本機資料庫。

Connect Cloud 的主檔為 `app/app.R`，同目錄的 `renv.lock` 固定 R 套件版本。部署需要 `app/data/` 和 `app/www/`。公開 GitHub 前檢查待提交清單，只納入公開基準、分析成果、程式與文件。排除本機資料庫目錄、套件快取、日誌、憑證、個資及企業機密。

## 從 GitHub 發布

1. 登入 GitHub，在 New repository 建立空的公開 repo，例如 `production-scheduling-analytics`。建立後保留 GitHub 顯示的 HTTPS repo 網址。
2. 在專案根目錄用 `git status --short --untracked-files=all` 檢查待公開檔案。再用 `git add README.md .gitignore .gitattributes .Renviron.example run-sql.ps1 R sql app docs data outputs` 與 `git commit -m "Build production scheduling analytics portfolio"`。Git 若要求身份設定，請先選擇要公開的 commit 名稱和 GitHub noreply 信箱。
3. 以實際 HTTPS repo 網址執行 `git remote add origin <repo-url>`，再執行 `git push -u origin main`，依提示完成 GitHub 登入。
4. 登入 Connect Cloud，選 Publish → Shiny。首次會提示安裝 GitHub App，授權作品所在 repo。選 main 分支及主檔 `app/app.R`，發佈。部署會使用同目錄的 `renv.lock`。 [官方發布步驟](https://docs.posit.co/connect-cloud/how-to/r/shiny-r.html)
5. 發佈成功後，以無痕視窗打開平台提供的 URL，確認免登入。選 ft10 / SPT，核對完工跨度 1,074、平均機台利用率 47.6%、總閒置 5,631 與相對 FIFO 改善率 9.3%。確認甘特圖沒有常駐工序文字，懸停會顯示細節，機台與工件篩選可操作，規則比較保留三個方案。通過後再把 GitHub 與 Dashboard 實測網址放進 README 與 Shiny 作品說明。

更新時重跑 README 管線、提交新的 `app/data/`，再由 Connect Cloud 手動發佈或啟用推送自動發佈。
