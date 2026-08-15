import { requireLocalUser } from "../../../../lib/auth-user";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const { data: photo } = await user.supabase.from("project_photos").select("storage_key, content_type")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  const { data: object, error } = await user.supabase.storage.from(storageBucket()).download(photo.storage_key);
  if (error || !object) return Response.json({ error: "照片不存在" }, { status: 404 });
  return new Response(object.stream(), { headers: { "content-type": photo.content_type,
    "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const body = await request.json() as Record<string, unknown>;
  const capturedDate = String(body.capturedDate ?? "");
  const capturedTime = String(body.capturedTime ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedDate) || !/^\d{2}:\d{2}$/.test(capturedTime))
    return Response.json({ error: "日期或時間格式不正確" }, { status: 400 });
  const { data, error } = await user.supabase.from("project_photos").update({ captured_date: capturedDate,
    captured_time: capturedTime, captured_at: `${capturedDate}T${capturedTime}:00+08:00`,
    capture_time_known: true, capture_time_source: "manual", note: String(body.note ?? "").slice(0, 1000),
    updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "照片不存在" }, { status: 404 });
  return Response.json({ photo: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const { data: photo } = await user.supabase.from("project_photos").select("storage_key")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  const { error: storageError } = await user.supabase.storage.from(storageBucket()).remove([photo.storage_key]);
  if (storageError) return Response.json({ error: storageError.message }, { status: 500 });
  const { error } = await user.supabase.from("project_photos").delete().eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deleted: true });
}

function storageBucket() { return process.env.SUPABASE_STORAGE_BUCKET ?? "face-photos"; }
