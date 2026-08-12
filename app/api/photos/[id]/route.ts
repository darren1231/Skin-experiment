import { requireLocalUser } from "../../../../lib/auth-user";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const { data: photo } = await user.supabase.from("face_photos").select("object_key, content_type")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!photo) return Response.json({ error: "找不到照片" }, { status: 404 });
  const { data: object, error } = await user.supabase.storage.from(storageBucket()).download(photo.object_key);
  if (error || !object) return Response.json({ error: "找不到照片" }, { status: 404 });
  return new Response(object.stream(), { headers: { "content-type": photo.content_type,
    "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const { data: photo } = await user.supabase.from("face_photos").select("object_key")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!photo) return Response.json({ error: "找不到照片" }, { status: 404 });
  const { error: storageError } = await user.supabase.storage.from(storageBucket()).remove([photo.object_key]);
  if (storageError) return Response.json({ error: storageError.message }, { status: 500 });
  const { error } = await user.supabase.from("face_photos").delete().eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deleted: true });
}
function storageBucket() { return process.env.SUPABASE_STORAGE_BUCKET ?? "face-photos"; }
