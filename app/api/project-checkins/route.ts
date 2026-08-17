import { requireLocalUser } from "../../../lib/auth-user";

export async function GET(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const url = new URL(request.url);
  let query = user.supabase.from("project_checkins").select("*, tracking_projects!inner(name)")
    .eq("user_id", user.id).eq("tracking_projects.user_id", user.id);
  const projectId = url.searchParams.get("projectId");
  const date = url.searchParams.get("date");
  if (projectId) query = query.eq("project_id", projectId);
  if (date && isDate(date)) query = query.eq("entry_date", date);
  const { data, error } = await query.order("entry_date", { ascending: false }).limit(2000);
  if (error) {
    if (isMissingMigration(error)) return Response.json({ records: [], migrationRequired: true });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ records: (data ?? []).map(toRecord), migrationRequired: false });
}

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const projectId = String(body.projectId ?? "");
  const entryDate = String(body.entryDate ?? "");
  if (!projectId) return Response.json({ error: "請先選擇追蹤專案" }, { status: 400 });
  if (!isDate(entryDate)) return Response.json({ error: "日期格式不正確" }, { status: 400 });

  const { data: project, error: projectError } = await user.supabase.from("tracking_projects").select("id")
    .eq("id", projectId).eq("user_id", user.id).maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "找不到這個專案，或目前帳號沒有權限" }, { status: 404 });

  const now = new Date().toISOString();
  const row = {
    user_id: user.id,
    project_id: projectId,
    entry_date: entryDate,
    metrics: JSON.stringify(body.metrics ?? {}),
    sleep: clamp(Number(body.sleep ?? 0), 0, 24),
    stress: clamp(Number(body.stress ?? 0), 0, 5),
    note: String(body.note ?? "").slice(0, 2000),
    whole_routine: String(body.wholeRoutine ?? "").slice(0, 1000),
    left_routine: String(body.leftRoutine ?? "").slice(0, 1000),
    right_routine: String(body.rightRoutine ?? "").slice(0, 1000),
    updated_at: now,
  };
  const { data, error } = await user.supabase.from("project_checkins").upsert(row, {
    onConflict: "user_id,project_id,entry_date",
  }).select("*, tracking_projects!inner(name)").single();
  if (error) {
    if (isMissingMigration(error)) return Response.json({ error: "請先執行此版本的 Supabase migration" }, { status: 503 });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ record: toRecord(data) }, { status: 201 });
}

function toRecord(row: Record<string, unknown>) {
  const relation = Array.isArray(row.tracking_projects) ? row.tracking_projects[0] : row.tracking_projects;
  const projectName = relation && typeof relation === "object" && "name" in relation ? String(relation.name) : "未命名專案";
  return {
    id: row.id,
    projectId: row.project_id,
    projectName,
    entryDate: row.entry_date,
    metrics: row.metrics,
    sleep: row.sleep,
    stress: row.stress,
    note: row.note,
    wholeRoutine: row.whole_routine,
    leftRoutine: row.left_routine,
    rightRoutine: row.right_routine,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function isMissingMigration(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /project_checkins.*(does not exist|schema cache)/i.test(error.message ?? "");
}
