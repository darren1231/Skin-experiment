import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { requireLocalUser } from "../../../../lib/auth-user";
import { getDb } from "../../../../db";
import { projectPhotos } from "../../../../db/schema";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const [photo] = await getDb().select().from(projectPhotos)
    .where(and(eq(projectPhotos.id, id), eq(projectPhotos.userId, user.id))).limit(1);
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  const object = await env.FACE_PHOTOS.get(photo.storageKey);
  if (!object) return Response.json({ error: "照片不存在" }, { status: 404 });
  return new Response(object.body, { headers: { "content-type": photo.contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const body = await request.json() as Record<string, unknown>;
  const capturedDate = String(body.capturedDate ?? "");
  const capturedTime = String(body.capturedTime ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedDate) || !/^\d{2}:\d{2}$/.test(capturedTime)) {
    return Response.json({ error: "日期或時間格式不正確" }, { status: 400 });
  }
  const [photo] = await getDb().update(projectPhotos).set({
    capturedDate,
    capturedTime,
    capturedAt: `${capturedDate}T${capturedTime}:00+08:00`,
    captureTimeKnown: true,
    captureTimeSource: "manual",
    note: String(body.note ?? "").slice(0, 1000),
    updatedAt: new Date().toISOString(),
  }).where(and(eq(projectPhotos.id, id), eq(projectPhotos.userId, user.id))).returning();
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  return Response.json({ photo });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const id = Number((await context.params).id);
  const db = getDb();
  const [photo] = await db.select().from(projectPhotos)
    .where(and(eq(projectPhotos.id, id), eq(projectPhotos.userId, user.id))).limit(1);
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  await env.FACE_PHOTOS.delete(photo.storageKey);
  await db.delete(projectPhotos).where(and(eq(projectPhotos.id, id), eq(projectPhotos.userId, user.id)));
  return Response.json({ deleted: true });
}
