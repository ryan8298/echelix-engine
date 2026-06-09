"use server";

import { getAdminSupabase, requireUser } from "@/lib/supabase/server";

export async function saveConfig(key: string, value: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const sb = getAdminSupabase();
  const { error } = await sb.from("engine_config").update({
    value,
    updated_by: user.email ?? null,
  }).eq("key", key);
  if (error) return { error: error.message };
  return {};
}
