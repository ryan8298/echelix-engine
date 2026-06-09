"use server";

import { getAdminSupabase, requireUser } from "@/lib/supabase/server";
import { draftMicrosoftEmail } from "@/lib/outreach/microsoft";
import { draftProspectEmail } from "@/lib/outreach/prospect";
import type { Offering, Reference, SignalForMatch } from "@/lib/outreach/offerings";
import { headers } from "next/headers";

async function inferBaseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "echelix-engine-web.vercel.app";
  return `${proto}://${host}`;
}

async function loadCorpus(sb: ReturnType<typeof getAdminSupabase>): Promise<{ offerings: Offering[]; references: Reference[] }> {
  const [ores, rres] = await Promise.all([
    sb.from("echelix_offerings").select("*"),
    sb.from("echelix_references").select("*"),
  ]);
  return {
    offerings: ((ores.data as Offering[] | null) ?? []),
    references: ((rres.data as Reference[] | null) ?? []),
  };
}

async function loadBriefWithContext(briefId: string) {
  const sb = getAdminSupabase();
  const { data: brief, error } = await sb.from("briefs")
    .select("id,brief_date,account_id,accounts(company_name,industry,microsoft_team)")
    .eq("id", briefId).maybeSingle();
  if (error) throw error;
  if (!brief) throw new Error("Brief not found");
  const account = (brief.accounts as unknown) as { company_name: string; industry: string; microsoft_team: Parameters<typeof draftMicrosoftEmail>[0]["account"]["microsoft_team"] } | null;
  if (!account) throw new Error("Account missing on brief");
  const { data: signalRows } = await sb.from("signals")
    .select("signal_type,signal_date,headline,relevance_tags")
    .eq("account_id", brief.account_id as string)
    .order("signal_date", { ascending: false, nullsFirst: false })
    .limit(60);
  const signals = ((signalRows ?? []) as unknown as SignalForMatch[]).map((s) => ({
    ...s,
    relevance_tags: s.relevance_tags ?? [],
  }));
  return { sb, brief, account, signals };
}

export async function draftMicrosoftOutreach(briefId: string): Promise<{ ok?: true; error?: string }> {
  await requireUser();
  try {
    const { sb, brief, account, signals } = await loadBriefWithContext(briefId);
    const { offerings, references } = await loadCorpus(sb);
    const baseUrl = await inferBaseUrl();
    const draft = draftMicrosoftEmail({
      account, brief: { id: brief.id as string, brief_date: brief.brief_date as string },
      signals, offerings, references, briefBaseUrl: baseUrl,
    });
    const { error } = await sb.from("outreach").insert({
      account_id: brief.account_id, brief_id: brief.id, channel: "microsoft",
      recipient: draft.recipient_email, subject: draft.subject, body: draft.body, status: "draft",
    });
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function draftProspectOutreach(briefId: string): Promise<{ ok?: true; error?: string }> {
  await requireUser();
  try {
    const { sb, brief, account, signals } = await loadBriefWithContext(briefId);
    const { offerings, references } = await loadCorpus(sb);
    const draft = draftProspectEmail({
      account, signals, offerings, references, contact: null,
    });
    const { error } = await sb.from("outreach").insert({
      account_id: brief.account_id, brief_id: brief.id, channel: "prospect",
      recipient: draft.recipient_email, subject: draft.subject, body: draft.body, status: "draft",
    });
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function updateOutreach(id: string, fields: { subject?: string; body?: string; recipient?: string }): Promise<{ error?: string }> {
  await requireUser();
  const sb = getAdminSupabase();
  const { error } = await sb.from("outreach").update(fields).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function approveOutreach(id: string): Promise<{ error?: string }> {
  await requireUser();
  const sb = getAdminSupabase();
  const { error } = await sb.from("outreach").update({ status: "approved" }).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function markSentOutreach(id: string): Promise<{ error?: string }> {
  await requireUser();
  const sb = getAdminSupabase();
  const { error } = await sb.from("outreach").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function deleteOutreach(id: string): Promise<{ error?: string }> {
  await requireUser();
  const sb = getAdminSupabase();
  const { error } = await sb.from("outreach").delete().eq("id", id);
  return error ? { error: error.message } : {};
}
