import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Google OAuth routes use PKCE callback and server-side sessions", async () => {
  const [login, callback, server] = await Promise.all([
    read("app/auth/google/route.ts"),
    read("app/auth/callback/route.ts"),
    read("lib/supabase/server.ts"),
  ]);
  assert.match(login, /provider:\s*["']google["']/);
  assert.match(login, /auth\/callback/);
  assert.match(login, /prompt:\s*["']select_account["']/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(server, /getUser\(\)/);
  assert.doesNotMatch(server, /localStorage|sessionStorage/);
});

test("signed-in account identity stays visible on mobile", async () => {
  const [page, dashboard, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/dashboard.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(page, /userEmail=\{user\.email/);
  assert.match(dashboard, /目前登入：\$\{userEmail\}/);
  assert.match(dashboard, /<small>\{userEmail\}<\/small>/);
  assert.match(css, /\.account-chip/);
});

test("all skin records are isolated by verified user id", async () => {
  const [schema, checkins, photos] = await Promise.all([
    read("db/schema.ts"),
    read("app/api/checkins/route.ts"),
    read("app/api/photos/[id]/route.ts"),
  ]);
  assert.match(schema, /checkins_user_date_idx/);
  assert.match(checkins, /eq\(checkins\.userId, user\.id\)/);
  assert.match(photos, /eq\(facePhotos\.userId, user\.id\)/);
  assert.doesNotMatch(checkins, /local-preview@/);
});

test("logged-out visitors receive a public landing page without demo records", async () => {
  const [page, landing, dashboard] = await Promise.all([
    read("app/page.tsx"),
    read("app/landing.tsx"),
    read("app/dashboard.tsx"),
  ]);
  assert.match(page, /if \(!user\) return <Landing/);
  assert.match(landing, /使用 Google/);
  assert.doesNotMatch(dashboard, /const demos=/);
});

test("dashboard date formatting is compatible with the Cloudflare runtime", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.doesNotMatch(dashboard, /dateStyle:\s*["']long["'][^}]*weekday:/);
  assert.match(dashboard, /timeZone:\s*["']Asia\/Taipei["']/);
  assert.doesNotThrow(() => new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Taipei",
  }).format(new Date()));
});

test("photo uploads show server-confirmed status instead of silent local previews", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.match(dashboard, /await fetch\("\/api\/photos"/);
  assert.match(dashboard, /response\.ok/);
  assert.match(dashboard, /上傳中…/);
  assert.match(dashboard, /已安全保存/);
  assert.match(dashboard, /上傳失敗/);
});

test("calendar review and arbitrary two-date comparison use stored records and photos", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.match(dashboard, /onClick=\{\(\) => setSelectedDate\(key\)\}/);
  assert.match(dashboard, /function CompareView/);
  assert.match(dashboard, /aria-label="基準日期"/);
  assert.match(dashboard, /aria-label="對照日期"/);
  assert.match(dashboard, /`\/api\/photos\/\$\{photo\.id\}`/);
});
