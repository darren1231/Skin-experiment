import { and, desc, eq } from "drizzle-orm";
import { requireLocalUser } from "../../../lib/auth-user";
import { getDb } from "../../../db";
import { trackingProjects } from "../../../db/schema";

export async function GET() {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const projects = await getDb().select().from(trackingProjects)
    .where(eq(trackingProjects.userId, user.id)).orderBy(desc(trackingProjects.updatedAt));
  return Response.json({ projects });
}

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!name) return Response.json({ error: "請輸入專案名稱" }, { status: 400 });
  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    userId: user.id,
    name,
    description: String(body.description ?? "").trim().slice(0, 1000),
    enableFaceAngleGuidance: body.enableFaceAngleGuidance === true,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(trackingProjects).values(project);
  return Response.json({ project }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id ?? "");
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!id || !name) return Response.json({ error: "專案資料不完整" }, { status: 400 });
  const values = {
    name,
    description: String(body.description ?? "").trim().slice(0, 1000),
    enableFaceAngleGuidance: body.enableFaceAngleGuidance === true,
    updatedAt: new Date().toISOString(),
  };
  const [project] = await getDb().update(trackingProjects).set(values)
    .where(and(eq(trackingProjects.id, id), eq(trackingProjects.userId, user.id))).returning();
  if (!project) return Response.json({ error: "找不到專案" }, { status: 404 });
  return Response.json({ project });
}
