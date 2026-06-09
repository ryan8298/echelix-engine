"use server";

import { requireUser } from "@/lib/supabase/server";
import { dispatchWorkflow } from "@/lib/github/dispatch";

export async function runBulkOnFilter(
  action: "enrich" | "apollo_enrich",
  filters: { industry: string; vertical: string; status: string; tier: string },
): Promise<{ ok?: true; error?: string; runUrl?: string }> {
  await requireUser();
  if (action === "enrich") {
    // Enrich workflow currently supports --industry. Vertical/status/tier filters
    // are dropped server-side for now (TODO: pass through once enrich-loop supports them).
    return dispatchWorkflow("enrich.yml", {
      industry: filters.industry || "",
      force: false,
    });
  }
  // Apollo bulk runs on the same filter set. We dispatch a separate workflow
  // (bulk-apollo.yml — to be added) that re-uses the gate's Apollo step on
  // any account matching the filter, regardless of revenue verdict.
  return { error: "Bulk Apollo enrichment is wired UI-side but the worker job ships in the next commit." };
}
