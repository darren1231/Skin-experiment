import { and, desc, eq, gte, lt } from "drizzle-orm";
import { requireLocalUser } from "../../../lib/auth-user";
import { getDb } from "../../../db";
import { checkins, facePhotos } from "../../../db/schema";

export async function GET(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date");
  try {
    const db = getDb();
    const filter = date
      ? and(eq(checkins.userId, user.id), eq(checkins.entryDate, date))
      : month && /^\d{4}-\d{2}$/.test(month)
        ? and(eq(checkins.userId, user.id), gte(checkins.entryDate, `${month}-01`), lt(checkins.entryDate, nextMonth(month)))
        : eq(checkins.userId, user.id);
    const records = await db.select().from(checkins).where(filter).orderBy(desc(checkins.entryDate)).limit(2000);
    const photos = await db.select({ id: facePhotos.id, entryDate: facePhotos.entryDate, angle: facePhotos.angle, createdAt: facePhotos.createdAt })
      .from(facePhotos).where(eq(facePhotos.userId, user.id)).orderBy(desc(facePhotos.createdAt));
    return Response.json({ records, photos });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法讀取每日紀錄" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const entryDate = String(body.entryDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return Response.json({ error: "日期格式不正確" }, { status: 400 });
  const values = {
    userId: user.id, ownerEmail: user.email, entryDate, metrics: JSON.stringify(body.metrics ?? {}),
    sleep: clamp(Number(body.sleep ?? 0), 0, 24), stress: clamp(Number(body.stress ?? 0), 0, 5),
    note: String(body.note ?? "").slice(0, 1000), wholeRoutine: String(body.wholeRoutine ?? "").slice(0, 500),
    leftRoutine: String(body.leftRoutine ?? "").slice(0, 500), rightRoutine: String(body.rightRoutine ?? "").slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  try {
    const db = getDb();
    await db.insert(checkins).values(values).onConflictDoUpdate({ target: [checkins.userId, checkins.entryDate], set: values });
    const [record] = await db.select().from(checkins).where(and(eq(checkins.userId, user.id), eq(checkins.entryDate, entryDate))).limit(1);
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "無法儲存每日紀錄" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "日期格式不正確" }, { status: 400 });
  const db = getDb();
  const photos = await db.select().from(facePhotos).where(and(eq(facePhotos.userId, user.id), eq(facePhotos.entryDate, date)));
  const { env } = await import("cloudflare:workers");
  await Promise.all(photos.map((photo) => env.FACE_PHOTOS.delete(photo.objectKey)));
  await db.delete(facePhotos).where(and(eq(facePhotos.userId, user.id), eq(facePhotos.entryDate, date)));
  await db.delete(checkins).where(and(eq(checkins.userId, user.id), eq(checkins.entryDate, date)));
  return Response.json({ deleted: true });
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
function nextMonth(month: string) { const [year, value] = month.split("-").map(Number); const date = new Date(Date.UTC(year, value, 1)); return date.toISOString().slice(0, 7) + "-01"; }
