import type { User } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { checkins, facePhotos, users } from "../db/schema";
import { getSupabaseUser } from "./supabase/server";

export async function syncLocalUser(user: User) {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error("Google 帳號沒有可用的 Email");
  const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? email);
  const avatarUrl = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
  const db = getDb();

  await db.insert(users).values({ id: user.id, email, displayName: name, avatarUrl, lastLoginAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: users.id, set: { email, displayName: name, avatarUrl, lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });

  // Existing ChatGPT-login records are claimed once by the same verified email.
  await db.update(checkins).set({ userId: user.id }).where(and(eq(checkins.ownerEmail, email), isNull(checkins.userId)));
  await db.update(facePhotos).set({ userId: user.id }).where(and(eq(facePhotos.ownerEmail, email), isNull(facePhotos.userId)));
  return { id: user.id, email, displayName: name, avatarUrl };
}

export async function requireLocalUser() {
  const authUser = await getSupabaseUser();
  if (!authUser) return null;
  return syncLocalUser(authUser);
}
