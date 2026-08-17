import DailyDashboard from "./daily-dashboard";
import Landing from "./landing";
import { getSupabaseUser, isGoogleAuthConfigured } from "../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = isGoogleAuthConfigured();
  const user = await getSupabaseUser();
  if (!user) return <Landing configured={configured} />;
  const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "我的肌膚日誌");
  return <DailyDashboard userName={name} userEmail={user.email ?? ""} />;
}
