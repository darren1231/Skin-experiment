import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase/server";

export async function syncLocalUser(user: User, existingClient?: SupabaseClient) {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error("Google 帳號沒有可用的 Email");
  const displayName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? email);
  const avatarUrl = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
  const client = existingClient ?? await createSupabaseServerClient();
  if (!client) throw new Error("Supabase 尚未設定");
  const now = new Date().toISOString();
  const { error } = await client.from("users").upsert({
    id: user.id,
    email,
    display_name: displayName,
    avatar_url: avatarUrl,
    last_login_at: now,
    updated_at: now,
  }, { onConflict: "id" });
  if (error) throw error;
  return { id: user.id, email, displayName, avatarUrl, supabase: client };
}

export async function requireLocalUser() {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return syncLocalUser(data.user, client);
}
