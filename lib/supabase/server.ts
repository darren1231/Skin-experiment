import { createServerClient } from "@supabase/ssr";
import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

type AuthEnv = { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string };

export function isGoogleAuthConfigured() {
  const authEnv = env as unknown as AuthEnv;
  return Boolean(authEnv.SUPABASE_URL && authEnv.SUPABASE_PUBLISHABLE_KEY);
}

export async function createSupabaseServerClient() {
  const authEnv = env as unknown as AuthEnv;
  if (!authEnv.SUPABASE_URL || !authEnv.SUPABASE_PUBLISHABLE_KEY) return null;
  const cookieStore = await cookies();

  return createServerClient(authEnv.SUPABASE_URL, authEnv.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. Route handlers refresh them.
        }
      },
    },
  });
}

export async function getSupabaseUser() {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}
