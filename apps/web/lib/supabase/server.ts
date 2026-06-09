import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client tied to the user's session cookies.
 * Used by server components / server actions for auth + RLS-aware reads.
 */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        try { for (const { name, value, options } of toSet) cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]); }
        catch { /* called from a server component — ignore */ }
      },
    },
  });
}

/**
 * Server-only admin client using the service role key. Bypasses RLS.
 * NEVER expose this to the browser. Use it inside server components or
 * server actions after you've verified the user is authenticated.
 */
let adminCached: ReturnType<typeof createClient<Database>> | null = null;
export function getAdminSupabase() {
  if (adminCached) return adminCached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  adminCached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminCached;
}

/** Require an authed user. Throws if not — middleware should redirect first. */
export async function requireUser() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  return user;
}
