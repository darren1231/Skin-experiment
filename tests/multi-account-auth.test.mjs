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
  const [dashboard, route] = await Promise.all([
    read("app/dashboard.tsx"),
    read("app/api/photos/route.ts"),
  ]);
  assert.match(dashboard, /await fetch\("\/api\/photos"/);
  assert.match(dashboard, /response\.ok/);
  assert.match(dashboard, /PHOTO_TARGET_BYTES = 1\.8 \* 1024 \* 1024/);
  assert.match(dashboard, /PHOTO_MAX_COMPRESSION_ATTEMPTS = 4/);
  assert.match(dashboard, /PHOTO_UPLOAD_ATTEMPTS = 3/);
  assert.match(dashboard, /await compressPhoto\(file\)/);
  assert.match(dashboard, /canvas\.toBlob/);
  assert.match(dashboard, /await loadPhotoImage\(file\)/);
  assert.match(dashboard, /手機無法讀取這種照片格式/);
  assert.match(dashboard, /await uploadPhotoWithRetry/);
  assert.match(dashboard, /上傳失敗：\{status\.message/);
  assert.match(route, /photo\.size > 4 \* 1024 \* 1024/);
  assert.match(dashboard, /正在縮小照片…/);
  assert.match(dashboard, /上傳中…/);
  assert.match(dashboard, /已安全保存/);
  assert.match(dashboard, /上傳失敗/);
});

test("guided camera reports 3D face pose and contour fit", async () => {
  const [dashboard, camera] = await Promise.all([
    read("app/dashboard.tsx"),
    read("app/face-angle-camera.tsx"),
  ]);
  assert.match(dashboard, /<FaceAngleCamera/);
  assert.match(camera, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(camera, /outputFacialTransformationMatrixes: true/);
  assert.match(camera, /facialTransformationMatrixes\[0\]/);
  assert.match(camera, /rotationMatrixToEuler/);
  assert.match(camera, /yaw: clamp\(-toDegrees\(yawRadians\)/);
  assert.match(camera, /pitch: clamp\(-toDegrees\(pitchRadians\)/);
  assert.match(camera, /MIN_FACE_FIT = 0\.8/);
  assert.match(camera, /calculateFaceFit/);
  assert.match(camera, /correctedWidthScale = widthScale \/ projectedWidth/);
  assert.match(camera, /angle === "front" \? 6 : 10/);
  assert.match(camera, /輪廓吻合度/);
  assert.doesNotMatch(camera, /眼睛高度/);
  assert.doesNotMatch(camera, /臉部中心/);
  assert.doesNotMatch(camera, /0\.42 - noseRatio/);
  assert.match(camera, /目標角度/);
  assert.match(camera, /角度與臉部大小都已對齊/);
  assert.match(camera, /left:\s*-35,\s*right:\s*35/);
  assert.match(camera, /difference > 0 \? "再向右轉一點" : "再向左轉一點"/);
  assert.match(camera, /改用系統相機/);
});

test("calendar review and arbitrary two-date comparison use stored records and photos", async () => {
  const dashboard = await read("app/dashboard.tsx");
  assert.match(dashboard, /onClick=\{\(\) => setSelectedDate\(key\)\}/);
  assert.match(dashboard, /function CompareView/);
  assert.match(dashboard, /aria-label="基準日期"/);
  assert.match(dashboard, /aria-label="對照日期"/);
  assert.match(dashboard, /`\/api\/photos\/\$\{photo\.id\}`/);
  assert.match(dashboard, /className="photo-compare-board"/);
  assert.match(dashboard, /aria-label="選擇比較角度"/);
  assert.match(dashboard, /<details className="compare-details">/);
  assert.match(dashboard, /查看分數與生活保養細節/);
});
