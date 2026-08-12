import { requireLocalUser } from "../../../lib/auth-user";

const SOURCES = ["camera", "album", "historical_import"] as const;

export async function GET(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const url = new URL(request.url);
  let query = user.supabase.from("project_photos").select("*, tracking_projects!inner(name)")
    .eq("user_id", user.id).eq("tracking_projects.user_id", user.id);
  const projectId = url.searchParams.get("projectId");
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (projectId) query = query.eq("project_id", projectId);
  if (date && isDate(date)) query = query.eq("captured_date", date);
  if (from && isDate(from)) query = query.gte("captured_date", from);
  if (to && isDate(to)) query = query.lte("captured_date", to);
  const { data, error } = await query.order("captured_date", { ascending: false })
    .order("captured_time", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(5000);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []).map((row) => ({
    id: row.id, projectId: row.project_id, projectName: relationName(row.tracking_projects),
    capturedDate: row.captured_date, capturedTime: row.captured_time, capturedAt: row.captured_at,
    captureTimeKnown: row.capture_time_known, captureTimeSource: row.capture_time_source,
    uploadedAt: row.uploaded_at, photoSource: row.photo_source, note: row.note ?? "",
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
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
    if (!(photo instanceof File)) return Response.json({ error: "伺服器沒有收到照片檔案", traceId }, { status: 400 });
    if (!photo.type.startsWith("image/")) return Response.json({ error: `照片格式不正確：${photo.type || "格式未知"}`, traceId }, { status: 400 });
    if (photo.size > 800 * 1024) return Response.json({ error: `壓縮後照片仍超過安全上傳上限（${Math.round(photo.size / 1024)}KB）`, traceId }, { status: 413 });
    if (!isDate(capturedDate) || !isTime(capturedTime) || !SOURCES.includes(source as typeof SOURCES[number]))
      return Response.json({ error: "拍攝資料格式不正確", traceId }, { status: 400 });
    stage = "驗證專案權限";
    const { data: project } = await user.supabase.from("tracking_projects").select("id")
      .eq("id", projectId).eq("user_id", user.id).maybeSingle();
    if (!project) return Response.json({ error: "找不到這個專案，或目前帳號沒有權限", traceId }, { status: 404 });
    const now = new Date().toISOString();
    key = `${user.id}/projects/${projectId}/${capturedDate}/${crypto.randomUUID()}.jpg`;
    stage = "寫入照片檔案";
    const { error: uploadError } = await user.supabase.storage.from(storageBucket()).upload(key, photo, { contentType: photo.type });
    if (uploadError) throw uploadError;
    stage = "寫入照片資料";
    const { data: stored, error: insertError } = await user.supabase.from("project_photos").insert({
      user_id: user.id, project_id: projectId, storage_key: key, content_type: photo.type,
      captured_date: capturedDate, captured_time: capturedTime,
      captured_at: `${capturedDate}T${capturedTime}:00+08:00`, capture_time_known: true,
      capture_time_source: String(form.get("captureTimeSource") ?? "manual").slice(0, 40),
      uploaded_at: now, photo_source: source, note: String(form.get("note") ?? "").slice(0, 1000),
      created_at: now, updated_at: now,
    }).select("id").single();
    if (insertError) throw insertError;
    return Response.json({ photo: { id: stored.id, projectId, capturedDate, capturedTime,
      capturedAt: `${capturedDate}T${capturedTime}:00+08:00`, photoSource: source,
      note: String(form.get("note") ?? ""), url: `/api/project-photos/${stored.id}` }, traceId }, { status: 201 });
  } catch (error) {
    if (key) await user.supabase.storage.from(storageBucket()).remove([key]).catch(() => undefined);
    const detail = error instanceof Error ? error.message : "未知伺服器錯誤";
    return Response.json({ error: `${stage}失敗：${detail}`, traceId }, { status: 500 });
  }
}

function relationName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && "name" in row ? String(row.name) : "未命名專案";
}
function withDailyNumbers<T extends { projectId: string; capturedDate: string; capturedTime: string | null; id: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => a.projectId.localeCompare(b.projectId) ||
    a.capturedDate.localeCompare(b.capturedDate) || (a.capturedTime ?? "99:99").localeCompare(b.capturedTime ?? "99:99") || a.id - b.id);
  const counters = new Map<string, number>();
  const numbers = new Map<number, number>();
  for (const row of sorted) { const key = `${row.projectId}:${row.capturedDate}`;
    const value = (counters.get(key) ?? 0) + 1; counters.set(key, value); numbers.set(row.id, value); }
  return rows.map((row) => ({ ...row, dailyNumber: numbers.get(row.id) ?? 1, url: `/api/project-photos/${row.id}` }));
}
function storageBucket() { return process.env.SUPABASE_STORAGE_BUCKET ?? "face-photos"; }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function isTime(value: string) { return /^\d{2}:\d{2}$/.test(value); }
