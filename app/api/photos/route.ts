import { env } from "cloudflare:workers";
import { requireLocalUser } from "../../../lib/auth-user";
import { getDb } from "../../../db";
import { facePhotos } from "../../../db/schema";

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const form = await request.formData();
  const photo = form.get("photo");
  const angle = String(form.get("angle") ?? "");
  const date = String(form.get("entryDate") ?? new Date().toISOString().slice(0, 10));
  if (!(photo instanceof File) || !["front", "left", "right"].includes(angle) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "照片資料不正確" }, { status: 400 });
  }
  if (photo.size > 10 * 1024 * 1024 || !photo.type.startsWith("image/")) return Response.json({ error: "照片需為 10MB 以下的圖片" }, { status: 400 });
  const key = `${user.id}/${date}/${angle}-${crypto.randomUUID()}`;
  try {
    await env.FACE_PHOTOS.put(key, photo.stream(), { httpMetadata: { contentType: photo.type } });
    const [stored] = await getDb().insert(facePhotos).values({ userId: user.id, ownerEmail: user.email, entryDate: date, angle, objectKey: key, contentType: photo.type }).returning({ id: facePhotos.id });
    return Response.json({ photo: { id: stored.id, entryDate: date, angle, url: `/api/photos/${stored.id}` } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法上傳照片" }, { status: 500 });
  }
}
