# Skin Notes

使用 Next.js App Router 建置並部署至 Vercel。Google 登入、Postgres 資料庫與私人照片儲存皆沿用同一個 Supabase project。

## 本機開發

需要 Node.js 22.13 或更新版本。

```bash
npm install
copy .env.example .env.local
npm run dev
```

環境變數：

- `SUPABASE_URL`：既有 Supabase project URL
- `SUPABASE_PUBLISHABLE_KEY`：Supabase publishable key
- `SUPABASE_STORAGE_BUCKET`：可省略，預設為 `face-photos`

## Supabase 初始化

在 Supabase SQL Editor 執行 [`supabase/schema.sql`](supabase/schema.sql)。它會建立：

- `users`、`checkins`、`face_photos` 資料表
- 每位登入者只能存取自己資料的 RLS policies
- 私有 `face-photos` Storage bucket 及使用者目錄 policies

Supabase Authentication 需啟用 Google provider，並將正式網址的 `/auth/callback` 加到 Redirect URLs。

## Vercel 部署

Vercel 會自動辨識 Next.js，使用 `npm run build`。請在 Production、Preview 與 Development 環境設定上述三個環境變數。`SUPABASE_PUBLISHABLE_KEY` 可以安全地用於應用程式，但仍建議由 Vercel Environment Variables 管理而不是寫入 Git。

## 指令

- `npm run dev`：啟動本機開發伺服器
- `npm run build`：執行 production build
- `npm run lint`：執行 ESLint
- `npm test`：執行 production build 與應用程式測試
