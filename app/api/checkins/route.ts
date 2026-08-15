import { requireLocalUser } from "../../../lib/auth-user";

export async function GET(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const url = new URL(request.url);
  let recordsQuery = user.supabase.from("checkins").select("*").eq("user_id", user.id);
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date");
  if (date) recordsQuery = recordsQuery.eq("entry_date", date);
  else if (month && /^\d{4}-\d{2}$/.test(month)) recordsQuery = recordsQuery.gte("entry_date", `${month}-01`).lt("entry_date", nextMonth(month));
  const [{ data: records, error }, { data: photos, error: photoError }] = await Promise.all([
    recordsQuery.order("entry_date", { ascending: false }).limit(2000),
    user.supabase.from("face_photos").select("id, entry_date, angle, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (error || photoError) return Response.json({ error: error?.message ?? photoError?.message }, { status: 500 });
  return Response.json({ records: (records ?? []).map(toRecord), photos: (photos ?? []).map((photo) => ({
    id: photo.id, entryDate: photo.entry_date, angle: photo.angle, createdAt: photo.created_at,
  })) });
}

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const entryDate = String(body.entryDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return Response.json({ error: "日期格式不正確" }, { status: 400 });
  const row = { user_id: user.id, owner_email: user.email, entry_date: entryDate,
    metrics: JSON.stringify(body.metrics ?? {}), sleep: clamp(Number(body.sleep ?? 0), 0, 24),
    stress: clamp(Number(body.stress ?? 0), 0, 5), note: String(body.note ?? "").slice(0, 1000),
    whole_routine: String(body.wholeRoutine ?? "").slice(0, 500),
    left_routine: String(body.leftRoutine ?? "").slice(0, 500), right_routine: String(body.rightRoutine ?? "").slice(0, 500),
    updated_at: new Date().toISOString() };
  const { data, error } = await user.supabase.from("checkins").upsert(row, { onConflict: "user_id,entry_date" }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ record: toRecord(data) }, { status: 201 });
}

function toRecord(row: Record<string, unknown>) {
  return { id: row.id, entryDate: row.entry_date, metrics: row.metrics, sleep: row.sleep, stress: row.stress,
    note: row.note, wholeRoutine: row.whole_routine, leftRoutine: row.left_routine, rightRoutine: row.right_routine,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
function nextMonth(month: string) { const [year, value] = month.split("-").map(Number); return new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 7) + "-01"; }
