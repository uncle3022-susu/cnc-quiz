# 技能學科練習網站

純前端、可直接部署到 GitHub Pages 的手機優先題庫練習網站。

## 直接放到 GitHub Pages

請把本資料夾內的「全部檔案」放到 GitHub Repository 根目錄，確認 `index.html` 與 `app.js`、`styles.css` 在同一層；不要把 ZIP 檔直接放進 Repository，也不要多包一層 `cnc_quiz_github/` 資料夾。

GitHub → Settings → Pages → Source 選 `Deploy from a branch` → Branch 選 `main`、Folder 選 `/ (root)` → Save。

本網站不需要 npm、Vite 或後端。

## 個人資料與版本遷移

錯題、最近 3 筆測驗紀錄，以及每一科「本輪已測驗題目」會保存在使用者自己的瀏覽器 LocalStorage。

目前資料格式版本為 **v2**。程式會先檢查 v2；如果發現舊版 `skill-quiz-state-v1`，會自動把舊的錯題與測驗紀錄遷移到 v2，並補上新的本輪出題紀錄，不會因版本更新直接清空舊資料。

## 本輪出題規則

- CNC銑床、機工類：70% 單選、30% 複選，單選先出、複選後出。
- 職業安全、工作倫理、環境保護、節能減碳：100% 單選。
- 同一次測驗不重複。
- 正常測驗完成或中斷時，已作答題目會記為本輪已測驗，不再出現於後續一般測驗。
- 本輪全部測完時，可選擇重新隨機；只會重置該科「本輪已測驗題目」紀錄，不會刪除個人錯題。

## 題目圖片

PDF 圖片題會使用由原始 PDF 頁面裁切的題目圖，網站內可直接點擊圖片放大。原始 PDF 也保留於 `pdfs/`，圖片題若需要核對原頁可直接開啟 PDF。

## 題庫

題庫位於 `data/questions.json`；題庫統計位於 `data/stats.json`。圖片題圖檔位於 `images/`。
