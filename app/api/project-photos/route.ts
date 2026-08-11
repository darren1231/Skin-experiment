import { env } from "cloudflare:workers";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { requireLocalUser } from "../../../lib/auth-user";
import { getDb } from "../../../db";
import { projectPhotos, trackingProjects } from "../../../db/schema";

const SOURCES = ["camera", "album", "historical_import"] as const;

export async function GET(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const url = new URL(request.url);
  const filters: SQL[] = [eq(projectPhotos.userId, user.id)];
  const projectId = url.searchParams.get("projectId");
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (projectId) filters.push(eq(projectPhotos.projectId, projectId));
  if (date && isDate(date)) filters.push(eq(projectPhotos.capturedDate, date));
  if (from && isDate(from)) filters.push(gte(projectPhotos.capturedDate, from));
  if (to && isDate(to)) filters.push(lte(projectPhotos.capturedDate, to));
  const rows = await getDb().select({
    id: projectPhotos.id,
    projectId: projectPhotos.projectId,
    projectName: trackingProjects.name,
    capturedDate: projectPhotos.capturedDate,
    capturedTime: projectPhotos.capturedTime,
    capturedAt: projectPhotos.capturedAt,
    captureTimeKnown: projectPhotos.captureTimeKnown,
    captureTimeSource: projectPhotos.captureTimeSource,
    uploadedAt: projectPhotos.uploadedAt,
    photoSource: projectPhotos.photoSource,
    note: projectPhotos.note,
    createdAt: projectPhotos.createdAt,
    updatedAt: projectPhotos.updatedAt,
  }).from(projectPhotos).innerJoin(trackingProjects, and(
    eq(projectPhotos.projectId, trackingProjects.id),
    eq(trackingProjects.userId, user.id),
  )).where(and(...filters)).orderBy(desc(projectPhotos.capturedDate), desc(projectPhotos.capturedTime), desc(projectPhotos.id)).limit(5000);
  return Response.json({ photos: withDailyNumbers(rows) });
}

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  let traceId = crypto.randomUUID().slice(0, 8);
  let stage = "讀取上傳資料";
  let key = "";
  try {
    const form = await request.formData();
    traceId = String(form.get("traceId") ?? traceId).slice(0, 40);
    const photo = form.get("photo");
    const projectId = String(form.get("projectId") ?? "");
    const capturedDate = String(form.get("capturedDate") ?? "");
    const capturedTime = String(form.get("capturedTime") ?? "");
    const source = String(form.get("photoSource") ?? "");
    stage = "驗證照片";
    if (!(photo instanceof File)) {
      return Response.json({ error: "伺服器沒有收到照片檔案", traceId }, { status: 400 });
    }
    if (!photo.type.startsWith("image/")) {
      return Response.json({ error: `照片格式不正確：${photo.type || "格式未知"}`, traceId }, { status: 400 });
    }
    if (photo.size > 800 * 1024) {
      return Response.json({ error: `壓縮後照片仍超過安全上傳上限（${Math.round(photo.size / 1024)}KB）`, traceId }, { status: 413 });
    }
    if (!isDate(capturedDate) || !isTime(capturedTime) || !SOURCES.includes(source as typeof SOURCES[number])) {
      return Response.json({ error: `拍攝資料格式不正確（日期 ${capturedDate || "空白"}、時間 ${capturedTime || "空白"}、來源 ${source || "空白"}）`, traceId }, { status: 400 });
    }
    stage = "驗證專案權限";
    const [project] = await getDb().select({ id: trackingProjects.id }).from(trackingProjects)
      .where(and(eq(trackingProjects.id, projectId), eq(trackingProjects.userId, user.id))).limit(1);
    if (!project) return Response.json({ error: "找不到這個專案，或目前帳號沒有權限", traceId }, { status: 404 });
    const now = new Date().toISOString();
    const capturedAt = `${capturedDate}T${capturedTime}:00+08:00`;
    key = `${user.id}/projects/${projectId}/${capturedDate}/${crypto.randomUUID()}`;
    stage = "寫入照片檔案";
    await env.FACE_PHOTOS.put(key, photo.stream(), { httpMetadata: { contentType: photo.type } });
    stage = "寫入照片資料";
    const [stored] = await getDb().insert(projectPhotos).values({
      userId: user.id,
      projectId,
      storageKey: key,
      contentType: photo.type,
      capturedDate,
      capturedTime,
      capturedAt,
      captureTimeKnown: true,
      captureTimeSource: String(form.get("captureTimeSource") ?? "manual").slice(0, 40),
      uploadedAt: now,
      photoSource: source,
      note: String(form.get("note") ?? "").slice(0, 1000),
      createdAt: now,
      updatedAt: now,
    }).returning({ id: projectPhotos.id });
    return Response.json({ photo: { id: stored.id, projectId, capturedDate, capturedTime, capturedAt, photoSource: source, note: String(form.get("note") ?? ""), url: `/api/project-photos/${stored.id}` }, traceId }, { status: 201 });
  } catch (error) {
    if (key) await env.FACE_PHOTOS.delete(key).catch(() => undefined);
    const detail = error instanceof Error ? error.message : "未知伺服器錯誤";
    return Response.json({ error: `${stage}失敗：${detail}`, traceId }, { status: 500 });
  }
}

function withDailyNumbers<T extends { projectId: string; capturedDate: string; capturedTime: string | null; id: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) =>
    a.projectId.localeCompare(b.projectId) || a.capturedDate.localeCompare(b.capturedDate) ||
    (a.capturedTime ?? "99:99").localeCompare(b.capturedTime ?? "99:99") || a.id - b.id);
  const counters = new Map<string, number>();
  const numbers = new Map<number, number>();
  for (const row of sorted) {
    const key = `${row.projectId}:${row.capturedDate}`;
    const value = (counters.get(key) ?? 0) + 1;
    counters.set(key, value);
    numbers.set(row.id, value);
  }
  return rows.map((row) => ({ ...row, dailyNumber: numbers.get(row.id) ?? 1, url: `/api/project-photos/${row.id}` }));
}

function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function isTime(value: string) { return /^\d{2}:\d{2}$/.test(value); }
