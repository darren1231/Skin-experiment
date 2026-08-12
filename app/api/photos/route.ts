import { requireLocalUser } from "../../../lib/auth-user";

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const form = await request.formData();
  const photo = form.get("photo");
  const angle = String(form.get("angle") ?? "");
  const date = String(form.get("entryDate") ?? new Date().toISOString().slice(0, 10));
  if (!(photo instanceof File) || !["front", "left", "right"].includes(angle) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: "照片資料不正確" }, { status: 400 });
  if (photo.size > 4 * 1024 * 1024 || !photo.type.startsWith("image/"))
    return Response.json({ error: "照片需為 4MB 以下的圖片" }, { status: 400 });
  const key = `${user.id}/${date}/${angle}-${crypto.randomUUID()}`;
  try {
    const { error: uploadError } = await user.supabase.storage.from(storageBucket()).upload(key, photo, { contentType: photo.type });
    if (uploadError) throw uploadError;
    const { data, error } = await user.supabase.from("face_photos").insert({ user_id: user.id,
      owner_email: user.email, entry_date: date, angle, object_key: key, content_type: photo.type })
      .select("id").single();
    if (error) { await user.supabase.storage.from(storageBucket()).remove([key]); throw error; }
    return Response.json({ photo: { id: data.id, entryDate: date, angle, url: `/api/photos/${data.id}` } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法上傳照片" }, { status: 500 });
  }
}
function storageBucket() { return process.env.SUPABASE_STORAGE_BUCKET ?? "face-photos"; }
