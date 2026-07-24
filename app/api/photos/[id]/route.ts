import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { requireLocalUser } from "../../../../lib/auth-user";
import { getDb } from "../../../../db";
import { facePhotos } from "../../../../db/schema";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "照片不存在" }, { status: 404 });
  const [photo] = await getDb().select().from(facePhotos).where(and(eq(facePhotos.id, id), eq(facePhotos.userId, user.id))).limit(1);
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  const object = await env.FACE_PHOTOS.get(photo.objectKey);
  if (!object) return Response.json({ error: "照片不存在" }, { status: 404 });
  return new Response(object.body, { headers: { "content-type": photo.contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const db = getDb();
  const [photo] = await db.select().from(facePhotos).where(and(eq(facePhotos.id, id), eq(facePhotos.userId, user.id))).limit(1);
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  await env.FACE_PHOTOS.delete(photo.objectKey);
  await db.delete(facePhotos).where(and(eq(facePhotos.id, id), eq(facePhotos.userId, user.id)));
  return Response.json({ deleted: true });
}
