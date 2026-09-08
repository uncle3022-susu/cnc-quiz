# 技能學科練習網站

這是一個純前端、Mobile First 的技能檢定學科刷題網站，無需 Node / npm / 後端即可部署到 GitHub Pages。

## 最簡單的 GitHub Pages 部署方式

1. 在 GitHub 建立一個新的 Repository。
2. 將這個專案裡的所有檔案與資料夾全部上傳到 Repository 根目錄。
3. 進入 Repository → Settings → Pages。
4. 在 Build and deployment 選擇 `Deploy from a branch`。
5. Branch 選 `main`，資料夾選 `/ (root)`，儲存。
6. 等待 GitHub Pages 部署完成後，使用 GitHub 顯示的網址開啟即可。

本專案沒有 React、Vite、npm build 流程，因此不需要 `npm run dev` 或 `npm run build`。

## 題庫

題庫位於 `data/questions.json`，統計位於 `data/stats.json`。
PDF 原始檔案位於 `pdfs/`，網站可在圖示題中開啟對應 PDF 頁面。

## 六科固定順序

1. CNC銑床
2. 機工類
3. 職業安全
4. 工作倫理
5. 環境保護
6. 節能減碳

## 出題規則

CNC銑床、機工類：70% 單選、30% 複選，且單選先出、複選後出。
其餘四科：100% 單選。
同次測驗不重複出題；複選題需答案集合完全一致才算答對。

## 本次題庫轉換結果

- CNC銑床：773 題（原題目 775 題，刪除 2 題）
- 機工類：475 題（原題目 479 題，刪除 4 題）
- 職業安全：100 題
- 工作倫理：100 題
- 環境保護：95 題（原題目 100 題，刪除 5 題）
- 節能減碳：100 題

共 1643 題。

部分 PDF 題目是圖片選項，文字抽取無法完整還原；網站會保留 `imageRequired` 標記，並在測驗中提供「開啟 PDF 原頁」功能。
