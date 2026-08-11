import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { requireLocalUser } from "../../../../lib/auth-user";
import { getDb } from "../../../../db";
import { checkins, facePhotos } from "../../../../db/schema";

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sourceDate = String(body.sourceDate ?? "");
  const targetDate = String(body.targetDate ?? "");
  if (!isDateKey(sourceDate) || !isDateKey(targetDate) || targetDate !== previousDateKey(sourceDate)) {
    return Response.json({ error: "只能將今天的測試資料複製到昨天" }, { status: 400 });
  }

  const db = getDb();
  const [source] = await db.select().from(checkins)
    .where(and(eq(checkins.userId, user.id), eq(checkins.entryDate, sourceDate))).limit(1);
  if (!source) return Response.json({ error: "今天還沒有可複製的紀錄" }, { status: 404 });

  const [existing] = await db.select({ id: checkins.id }).from(checkins)
    .where(and(eq(checkins.userId, user.id), eq(checkins.entryDate, targetDate))).limit(1);
  if (existing) return Response.json({ error: "昨天已經有紀錄，不會覆蓋原有資料" }, { status: 409 });

  const sourcePhotos = await db.select().from(facePhotos)
    .where(and(eq(facePhotos.userId, user.id), eq(facePhotos.entryDate, sourceDate)))
    .orderBy(desc(facePhotos.createdAt));
  const latestByAngle = [...new Map(sourcePhotos.map((photo) => [photo.angle, photo])).values()];
  const copiedKeys: string[] = [];

  try {
    const copiedPhotos: Array<{ id: number; entryDate: string; angle: string; createdAt?: string }> = [];
    for (const photo of latestByAngle) {
      const object = await env.FACE_PHOTOS.get(photo.objectKey);
      if (!object) continue;
      const key = `${user.id}/${targetDate}/${photo.angle}-${crypto.randomUUID()}`;
      await env.FACE_PHOTOS.put(key, object.body, { httpMetadata: { contentType: photo.contentType } });
      copiedKeys.push(key);
      const [stored] = await db.insert(facePhotos).values({
        userId: user.id,
        ownerEmail: user.email,
        entryDate: targetDate,
        angle: photo.angle,
        objectKey: key,
        contentType: photo.contentType,
      }).returning({ id: facePhotos.id, createdAt: facePhotos.createdAt });
      copiedPhotos.push({ id: stored.id, entryDate: targetDate, angle: photo.angle, createdAt: stored.createdAt });
    }

    const [record] = await db.insert(checkins).values({
      userId: user.id,
      ownerEmail: user.email,
      entryDate: targetDate,
      metrics: source.metrics,
      sleep: source.sleep,
      stress: source.stress,
      note: `${source.note}${source.note ? " " : ""}（由今天複製的測試資料）`,
      wholeRoutine: source.wholeRoutine,
      leftRoutine: source.leftRoutine,
      rightRoutine: source.rightRoutine,
      updatedAt: new Date().toISOString(),
    }).returning();
    return Response.json({ record, photos: copiedPhotos }, { status: 201 });
  } catch (error) {
    await Promise.all(copiedKeys.map((key) => env.FACE_PHOTOS.delete(key)));
    await db.delete(facePhotos).where(and(eq(facePhotos.userId, user.id), eq(facePhotos.entryDate, targetDate)));
    await db.delete(checkins).where(and(eq(checkins.userId, user.id), eq(checkins.entryDate, targetDate)));
    return Response.json({ error: error instanceof Error ? error.message : "無法建立昨天的測試副本" }, { status: 500 });
  }
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function previousDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}
