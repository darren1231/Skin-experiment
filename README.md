# Skin Notes

以 Next.js App Router 建置，透過 GitHub PR 自動建立 Vercel Preview Deployment。Google 登入、Postgres 資料庫與私人照片儲存沿用同一個 Supabase project。

## Vercel Preview 流程

1. 從 `main` 建立功能分支並開 Pull Request。
2. Vercel Git Integration 會為 PR 建立獨立 Preview URL。
3. 在 Vercel 的 Preview 環境設定 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_STORAGE_BUCKET`。
4. 在 Supabase Authentication 的 Redirect URLs 加入 Preview 網域的 `/auth/callback`；若網域會變動，可使用 Vercel 提供的固定 branch URL。
5. 驗證完成後才合併 PR；合併至 `main` 才會更新 Production。

## Supabase migration

在既有 Supabase project 的 SQL Editor 執行 [`supabase/schema.sql`](supabase/schema.sql)。Migration 只新增 `tracking_projects`、`project_photos`、索引及 RLS policies，不刪除舊表或 Storage 檔案。舊 `face_photos` 會以原本的 `object_key` 對應到預設「臉部肌膚追蹤」專案。

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
