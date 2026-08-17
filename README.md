# Skin Notes

以 Next.js App Router 建置，透過 GitHub PR 自動建立 Vercel Preview Deployment。Google 登入、Postgres 資料庫與私人照片儲存沿用同一個 Supabase project。

## Vercel Preview 流程

1. 從 `main` 建立功能分支並開 Pull Request。
2. Vercel Git Integration 會為 PR 建立獨立 Preview URL。
3. 在 Vercel 的 Preview 環境設定 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_STORAGE_BUCKET`。
4. 在 Supabase Authentication 的 Redirect URLs 加入 Preview 網域的 `/auth/callback`；若網域會變動，可使用 Vercel 提供的固定 branch URL。
5. 驗證完成後才合併 PR；合併至 `main` 才會更新 Production。

## Supabase migration

在既有 Supabase project 的 SQL Editor 執行 [`supabase/schema.sql`](supabase/schema.sql)。Migration 採加法式更新，不刪除舊表或 Storage 檔案，而且可以安全重複執行。

目前 migration 會：

- 保留既有 `checkins`、`face_photos`。
- 建立 `tracking_projects`、`project_photos`。
- 建立 `project_checkins`，用 `(user_id, project_id, entry_date)` 將每日日誌與專案綁定。
- 將既有 `face_photos` 與 `checkins` 複製到預設「臉部肌膚追蹤」專案；舊資料本身不會被刪除。
- 建立對應 RLS policies，使用者只能讀寫自己的專案資料。

新版首頁以「專案 + 日期」為每日紀錄索引，同一頁顯示該日照片與日誌。原本照片庫、照片比較、角度提示與專案管理仍可從「完整工具」進入。

若 Preview 已部署但尚未執行 migration，照片功能仍可讀取，專案日誌會顯示 migration 提示並暫停儲存，避免整個 Preview 因缺少新資料表而失敗。

## 環境變數

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_STORAGE_BUCKET`（預設 `face-photos`）

## 驗證

```bash
npm install
npm run typecheck
npm run lint
npm test
```
