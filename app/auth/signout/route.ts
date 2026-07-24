import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  if (client) await client.auth.signOut();
  return Response.redirect(new URL("/", request.url));
}
