import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) return Response.redirect(new URL("/?auth_error=not_configured", request.url));
  const origin = new URL(request.url).origin;
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return Response.redirect(new URL("/?auth_error=google", request.url));
  return Response.redirect(data.url);
}
