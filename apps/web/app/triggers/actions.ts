"use server";

import { requireUser } from "@/lib/supabase/server";
import { dispatchWorkflow } from "@/lib/github/dispatch";

export async function triggerEnrich(opts: { industry: string; force: boolean }) {
  await requireUser();
  return dispatchWorkflow("enrich.yml", {
    industry: opts.industry,
    force: opts.force,
  });
}

export async function triggerSelect(opts: { industry: string; date: string; includePending: boolean; top: string }) {
  await requireUser();
  return dispatchWorkflow("select.yml", {
    industry: opts.industry,
    date: opts.date,
    include_pending: opts.includePending,
    top: opts.top,
  });
}

export async function triggerGate(opts: { edgarOnly: boolean; dryRun: boolean; limit: string }) {
  await requireUser();
  return dispatchWorkflow("gate.yml", {
    edgar_only: opts.edgarOnly,
    dry_run: opts.dryRun,
    limit: opts.limit,
  });
}
