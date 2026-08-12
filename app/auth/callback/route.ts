import { syncLocalUser } from "../../../lib/auth-user";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const client = await createSupabaseServerClient();
  if (!client || !code) return Response.redirect(new URL("/?auth_error=callback", request.url));
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.user) return Response.redirect(new URL("/?auth_error=callback", request.url));
  await syncLocalUser(data.user);
  return Response.redirect(new URL("/", request.url));
}
