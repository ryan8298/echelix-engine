"use server";

import { requireUser } from "@/lib/supabase/server";
import { dispatchWorkflow } from "@/lib/github/dispatch";

export async function refreshApolloForAccount(tpid: number): Promise<{ ok?: true; error?: string }> {
  await requireUser();
  const r = await dispatchWorkflow("apollo-refresh.yml" as never, { tpid: String(tpid) });
  return r.error ? { error: r.error } : { ok: true };
}
