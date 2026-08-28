import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("project daily entries are keyed by user, project and date", async () => {
  const [schema, route] = await Promise.all([read("supabase/schema.sql"), read("app/api/project-checkins/route.ts")]);
  assert.match(schema, /create table if not exists public\.project_checkins/);
  assert.match(schema, /unique \(user_id, project_id, entry_date\)/);
  assert.match(route, /onConflict:\s*"user_id,project_id,entry_date"/);
  assert.match(route, /\.eq\("id", projectId\)\.eq\("user_id", user\.id\)/);
});

test("legacy journals are copied additively into the legacy project", async () => {
  const schema = await read("supabase/schema.sql");
  assert.match(schema, /insert into public\.project_checkins/);
  assert.match(schema, /select user_id,'legacy-face-'\|\|user_id,entry_date/);
  assert.match(schema, /from public\.checkins/);
  assert.match(schema, /on conflict \(user_id,project_id,entry_date\) do nothing/);
  assert.doesNotMatch(schema, /drop table/i);
});

test("daily dashboard joins photos and journals by the same project and date", async () => {
  const dashboard = await read("app/daily-dashboard.tsx");
  assert.match(dashboard, /photo\.projectId === projectId && photo\.capturedDate === selectedDate/);
  assert.match(dashboard, /item\.projectId === projectId && item\.entryDate === selectedDate/);
  assert.match(dashboard, /照片與日誌不再分成兩套/);
  assert.match(dashboard, /body\.append\("projectId", projectId\)/);
  assert.match(dashboard, /body\.append\("capturedDate", selectedDate\)/);
  assert.match(dashboard, /JSON\.stringify\(\{ projectId, entryDate, sleep, stress, note, metrics \}\)/);
});

test("daily record is the signed-in home while existing tools stay accessible", async () => {
  const [page, dashboard] = await Promise.all([read("app/page.tsx"), read("app/daily-dashboard.tsx")]);
  assert.match(page, /import DailyDashboard from "\.\/daily-dashboard"/);
  assert.match(page, /<DailyDashboard userName=\{name\} userEmail=\{user\.email/);
  assert.match(dashboard, /import Dashboard from "\.\/dashboard"/);
  assert.match(dashboard, /完整工具/);
  assert.match(dashboard, /<Dashboard userName=\{userName\} userEmail=\{userEmail\}/);
});

test("preview remains readable before the Supabase migration is applied", async () => {
  const [route, dashboard] = await Promise.all([read("app/api/project-checkins/route.ts"), read("app/daily-dashboard.tsx")]);
  assert.match(route, /migrationRequired: true/);
  assert.match(route, /PGRST205/);
  assert.match(dashboard, /照片功能仍可正常使用/);
  assert.match(dashboard, /disabled=\{migrationRequired\}/);
});
