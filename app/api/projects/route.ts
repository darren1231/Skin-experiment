import { requireLocalUser } from "../../../lib/auth-user";

export async function GET() {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const { data, error } = await user.supabase.from("tracking_projects").select("*")
    .eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ projects: (data ?? []).map(toProject) });
}

export async function POST(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!name) return Response.json({ error: "請輸入專案名稱" }, { status: 400 });
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), user_id: user.id, name,
    description: String(body.description ?? "").trim().slice(0, 1000),
    enable_face_angle_guidance: body.enableFaceAngleGuidance === true,
    created_at: now, updated_at: now };
  const { data, error } = await user.supabase.from("tracking_projects").insert(row).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ project: toProject(data) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await requireLocalUser();
  if (!user) return Response.json({ error: "請先使用 Google 登入" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id ?? "");
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!id || !name) return Response.json({ error: "專案資料不完整" }, { status: 400 });
  const { data, error } = await user.supabase.from("tracking_projects").update({ name,
    description: String(body.description ?? "").trim().slice(0, 1000),
    enable_face_angle_guidance: body.enableFaceAngleGuidance === true,
    updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "找不到專案" }, { status: 404 });
  return Response.json({ project: toProject(data) });
}

function toProject(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, description: row.description ?? "",
    enableFaceAngleGuidance: row.enable_face_angle_guidance === true,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
