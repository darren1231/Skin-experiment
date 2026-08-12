import { requireLocalUser } from "../../../lib/auth-user";

export async function GET(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date");

  try {
    let query = user.supabase.from("checkins").select("*").eq("user_id", user.id);
    if (date) query = query.eq("entry_date", date);
    else if (month && /^\d{4}-\d{2}$/.test(month)) {
      query = query.gte("entry_date", `${month}-01`).lt("entry_date", nextMonth(month));
    }
    const [{ data: records, error: recordsError }, { data: photos, error: photosError }] = await Promise.all([
      query.order("entry_date", { ascending: false }).limit(2000),
      user.supabase.from("face_photos").select("id, entry_date, angle, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (recordsError) throw recordsError;
    if (photosError) throw photosError;
    return Response.json({ records: (records ?? []).map(toCheckin), photos: (photos ?? []).map(toPhoto) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法讀取紀錄" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const entryDate = String(body.entryDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return Response.json({ error: "日期格式不正確" }, { status: 400 });
  const values = {
    user_id: user.id,
    owner_email: user.email,
    entry_date: entryDate,
    metrics: JSON.stringify(body.metrics ?? {}),
    sleep: clamp(Number(body.sleep ?? 0), 0, 24),
    stress: clamp(Number(body.stress ?? 0), 0, 5),
    note: String(body.note ?? "").slice(0, 1000),
    whole_routine: String(body.wholeRoutine ?? "").slice(0, 500),
    left_routine: String(body.leftRoutine ?? "").slice(0, 500),
    right_routine: String(body.rightRoutine ?? "").slice(0, 500),
    updated_at: new Date().toISOString(),
  };
  try {
    const { data, error } = await user.supabase.from("checkins").upsert(values, { onConflict: "user_id,entry_date" }).select("*").single();
    if (error) throw error;
    return Response.json({ record: toCheckin(data) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法儲存紀錄" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "日期格式不正確" }, { status: 400 });
  const { data: photos, error: photoError } = await user.supabase.from("face_photos").select("object_key").eq("user_id", user.id).eq("entry_date", date);
  if (photoError) throw photoError;
  const keys = (photos ?? []).map((photo) => photo.object_key);
  if (keys.length) {
    const { error } = await user.supabase.storage.from(storageBucket()).remove(keys);
    if (error) throw error;
  }
  const { error: photosDeleteError } = await user.supabase.from("face_photos").delete().eq("user_id", user.id).eq("entry_date", date);
  if (photosDeleteError) throw photosDeleteError;
  const { error: checkinDeleteError } = await user.supabase.from("checkins").delete().eq("user_id", user.id).eq("entry_date", date);
  if (checkinDeleteError) throw checkinDeleteError;
  return Response.json({ deleted: true });
}

function toCheckin(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    ownerEmail: row.owner_email,
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

function toPhoto(row: Record<string, unknown>) {
  return { id: row.id, entryDate: row.entry_date, angle: row.angle, createdAt: row.created_at };
}

function storageBucket() { return process.env.SUPABASE_STORAGE_BUCKET ?? "face-photos"; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
function nextMonth(month: string) { const [year, value] = month.split("-").map(Number); return new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 7) + "-01"; }
