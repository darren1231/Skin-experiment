import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Google OAuth uses PKCE and keeps account identity visible", async () => {
  const [login, callback, server, page, dashboard] = await Promise.all([
    read("app/auth/google/route.ts"), read("app/auth/callback/route.ts"), read("lib/supabase/server.ts"),
    read("app/page.tsx"), read("app/dashboard.tsx"),
  ]);
  assert.match(login, /provider:\s*["']google["']/);
  assert.match(login, /prompt:\s*["']select_account["']/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(server, /getUser\(\)/);
  assert.match(page, /userEmail=\{user\.email/);
  assert.match(dashboard, /<small>\{userEmail\}<\/small>/);
});

test("projects accept custom names and explicit face-guidance checkbox only", async () => {
  const [schema, route, dashboard] = await Promise.all([
    read("supabase/schema.sql"), read("app/api/projects/route.ts"), read("app/dashboard.tsx"),
  ]);
  assert.match(schema, /tracking_projects/);
  assert.match(schema, /enable_face_angle_guidance/);
  assert.match(route, /const name = String\(body\.name/);
  assert.match(route, /enable_face_angle_guidance:\s*body\.enableFaceAngleGuidance === true/);
  assert.match(dashboard, /type="checkbox" checked=\{guidance\}/);
  assert.match(dashboard, /預設不勾選，也不依專案名稱自動判斷/);
  assert.doesNotMatch(route, /臉|頭皮|手臂|includes\(|keyword/i);
});

test("each photo is independent with capture and upload timestamps", async () => {
  const [schema, route] = await Promise.all([read("supabase/schema.sql"), read("app/api/project-photos/route.ts")]);
  for (const field of ["project_id", "storage_key", "captured_date", "captured_time", "captured_at", "uploaded_at", "photo_source", "note"]) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(route, /captured_at:\s*`\$\{capturedDate\}T\$\{capturedTime\}/);
  assert.match(route, /uploaded_at:\s*now/);
  assert.match(route, /SOURCES = \["camera", "album", "historical_import"\]/);
  assert.doesNotMatch(schema, /unique\s*\(project_id,\s*captured_date\)/);
});

test("same project and day can contain arbitrary counts with dynamic numbering", async () => {
  const [route, dashboard] = await Promise.all([read("app/api/project-photos/route.ts"), read("app/dashboard.tsx")]);
  assert.match(route, /function withDailyNumbers/);
  assert.match(route, /a\.projectId\.localeCompare\(b\.projectId\)/);
  assert.match(route, /a\.capturedDate\.localeCompare\(b\.capturedDate\)/);
  assert.match(route, /capturedTime \?\? "99:99"/);
  assert.match(route, /counters\.set\(key, value\)/);
  assert.match(dashboard, /第 \{photo\.dailyNumber\} 張/);
  assert.match(dashboard, /數量不受限制/);
});

test("new capture supports repeated shots, retake, delete and editable metadata", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.match(dashboard, /繼續拍攝/);
  assert.match(dashboard, /重拍/);
  assert.match(dashboard, /刪除/);
  assert.match(dashboard, /儲存並結束/);
  assert.match(dashboard, /type="date" value=\{draft\.capturedDate\}/);
  assert.match(dashboard, /type="time" value=\{draft\.capturedTime\}/);
  assert.match(dashboard, /照片備註/);
  assert.match(dashboard, /for \(const draft of drafts\)/);
});

test("historical multi-upload always permits manual date and time", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.match(dashboard, /hidden multiple type="file"/);
  assert.match(dashboard, /acceptPhotos\(Array\.from\(event\.target\.files \?\? \[\]\), "historical_import"\)/);
  assert.match(dashboard, /suggestCaptureDateTime/);
  assert.match(dashboard, /file\.lastModified/);
  assert.match(dashboard, /每張照片的日期與時間都可手動修改/);
  assert.match(dashboard, /上傳時間不會當作拍攝時間/);
});

test("face guidance is conditional and preserves corrected user-face directions", async () => {
  const [dashboard, camera] = await Promise.all([read("app/dashboard.tsx"), read("app/face-angle-camera.tsx")]);
  assert.match(dashboard, /selectedProject\?\.enableFaceAngleGuidance/);
  assert.match(dashboard, /selectedProject\.enableFaceAngleGuidance &&/);
  assert.match(dashboard, /!props\.selectedProject\.enableFaceAngleGuidance/);
  assert.match(dashboard, /historical \? props\.chooseAlbum\(\) : props\.startCamera\(\)/);
  assert.match(camera, /left:\s*-35,\s*right:\s*35/);
  assert.match(camera, /difference > 0 \? "再向右轉一點" : "再向左轉一點"/);
  assert.match(camera, /yaw: clamp\(-toDegrees\(yawRadians\)/);
  assert.match(camera, /pitch: clamp\(-toDegrees\(pitchRadians\)/);
});

test("library filters and sorts by actual capture metadata", async () => {
  const [dashboard, route] = await Promise.all([read("app/dashboard.tsx"), read("app/api/project-photos/route.ts")]);
  assert.match(dashboard, /全部專案/);
  assert.match(dashboard, /單一日期/);
  assert.match(dashboard, /起始日期/);
  assert.match(dashboard, /結束日期/);
  assert.match(dashboard, /SOURCE_LABEL\[photo\.photoSource\]/);
  assert.match(route, /order\("captured_date"/);
  assert.match(route, /order\("captured_time"/);
});

test("comparison permits any two photos with project, date, thumbnail and time selectors", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.match(dashboard, /function ComparePhotos/);
  assert.match(dashboard, /左側／基準照片/);
  assert.match(dashboard, /右側／對照照片/);
  assert.match(dashboard, /1\. 選擇專案/);
  assert.match(dashboard, /2\. 選擇日期/);
  assert.match(dashboard, /3\. 選擇當日照片/);
  assert.match(dashboard, /<img src=\{photo\.url\} alt=""/);
  assert.match(dashboard, /<small>\{displayTime\(photo\)\}<\/small>/);
  assert.match(dashboard, /photo-compare-board free-compare/);
});

test("calendar shows every same-day photo ordered by actual time", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.match(dashboard, /photos\.filter\(\(photo\) => photo\.capturedDate === selectedDate\)\.sort\(sortCapturedAscending\)/);
  assert.match(dashboard, /\{count\} 張照片/);
  assert.match(dashboard, /<PhotoGrid photos=\{dayPhotos\}/);
  assert.match(dashboard, /function JournalManager/);
  assert.match(dashboard, /fetch\("\/api\/checkins"/);
});

test("migration is additive and maps legacy photos without guessing capture time", async () => {
  const migration = await read("supabase/schema.sql");
  assert.match(migration, /create table if not exists public\.tracking_projects/i);
  assert.match(migration, /create table if not exists public\.project_photos/i);
  assert.match(migration, /'臉部肌膚追蹤'/);
  assert.match(migration, /'legacy-face-'\|\|id/);
  assert.match(migration, /object_key/);
  assert.match(migration, /'legacy_created_at_fallback'/);
  assert.match(migration, /captured_time/);
  assert.match(migration, /capture_time_known/);
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:drop table|delete from)\b/i);
  assert.doesNotMatch(migration, /FACE_PHOTOS|R2/);
});

test("all project, photo and binary APIs enforce verified user ownership", async () => {
  const [projects, photos, binary, checkins] = await Promise.all([
    read("app/api/projects/route.ts"), read("app/api/project-photos/route.ts"),
    read("app/api/project-photos/[id]/route.ts"), read("app/api/checkins/route.ts"),
  ]);
  for (const source of [projects, photos, binary, checkins]) {
    assert.match(source, /requireLocalUser/);
    assert.match(source, /user\.id/);
  }
  assert.match(projects, /eq\("user_id", user\.id\)/);
  assert.match(photos, /eq\("user_id", user\.id\)/);
  assert.match(binary, /eq\("user_id", user\.id\)/);
});

test("mobile layout keeps comparison side by side and provides all main entrances", async () => {
  const [dashboard, css] = await Promise.all([read("app/dashboard.tsx"), read("app/globals.css")]);
  for (const label of ["拍攝新照片", "上傳歷史照片", "查看照片庫", "比較照片", "管理專案"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(css, /\.free-compare/);
  assert.match(css, /\.photo-compare-board\.free-compare\{grid-template-columns:1fr 1fr\}/);
  assert.match(css, /@media\(max-width:560px\)/);
});

test("photo compression and server-confirmed upload remain enabled", async () => {
  const [dashboard, route, css] = await Promise.all([
    read("app/dashboard.tsx"), read("app/api/project-photos/route.ts"), read("app/globals.css"),
  ]);
  assert.match(dashboard, /PHOTO_TARGET_BYTES = 650 \* 1024/);
  assert.match(dashboard, /PHOTO_MAX_COMPRESSION_ATTEMPTS = 6/);
  assert.match(dashboard, /await preparePhotoForUpload\(file\)/);
  assert.match(dashboard, /await uploadPreparedPhoto\(draft, selectedProjectId\)/);
  assert.match(dashboard, /import\("heic2any"\)/);
  assert.match(dashboard, /toType: "image\/jpeg"/);
  assert.match(dashboard, /canvas\.toBlob/);
  assert.match(dashboard, /if \(!response\.ok\)/);
  assert.match(dashboard, /錯誤代碼/);
  assert.match(dashboard, /browserCanDecode/);
  assert.match(route, /traceId/);
  assert.match(route, /stage = "寫入照片檔案"/);
  assert.match(dashboard, /已安全保存/);
  assert.match(route, /photo\.size > 800 \* 1024/);
  assert.match(css, /\.paper-card button\.primary/);
  assert.match(css, /-webkit-text-fill-color:#fff/);
});

test("logged-out visitors receive a landing page without demo data", async () => {
  const [page, landing, dashboard] = await Promise.all([
    read("app/page.tsx"), read("app/landing.tsx"), read("app/dashboard.tsx"),
  ]);
  assert.match(page, /if \(!user\) return <Landing/);
  assert.match(landing, /使用 Google/);
  assert.doesNotMatch(dashboard, /const demos=/);
});
