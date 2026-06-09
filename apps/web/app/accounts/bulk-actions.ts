"use server";

import { requireUser } from "@/lib/supabase/server";
import { dispatchWorkflow } from "@/lib/github/dispatch";

type Filters = { industry: string; source_industry: string; vertical: string; status: string; tier: string };

export async function runBulkOnFilter(
  action: "enrich" | "apollo_enrich",
  filters: Filters,
): Promise<{ ok?: true; error?: string; runUrl?: string }> {
  await requireUser();
  if (action === "enrich") {
    return dispatchWorkflow("enrich.yml", {
      industry: filters.industry || "",
      source_industry: filters.source_industry || "",
      vertical: filters.vertical || "",
      status: filters.status || "",
      force: false,
    });
  }
  return { error: "Bulk Apollo enrichment is wired UI-side but the worker job ships in the next commit." };
}

export async function runSelectOnFilter(
  opts: Filters & { top: string },
): Promise<{ ok?: true; error?: string; runUrl?: string }> {
  await requireUser();
  return dispatchWorkflow("select.yml", {
    industry: opts.industry || "",
    source_industry: opts.source_industry || "",
    vertical: opts.vertical || "",
    status: opts.status || "",
    include_pending: false,
    top: opts.top,
    date: "",
  });
}
