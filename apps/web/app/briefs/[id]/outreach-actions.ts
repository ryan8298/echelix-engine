"use server";

import { getAdminSupabase, requireUser } from "@/lib/supabase/server";
import { draftMicrosoftEmail, type SignalForEmail } from "@/lib/outreach/microsoft";
import { headers } from "next/headers";

async function inferBaseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "echelix-engine-web.vercel.app";
  return `${proto}://${host}`;
}

export async function draftMicrosoftOutreach(briefId: string): Promise<{ ok?: true; error?: string }> {
  await requireUser();
  const sb = getAdminSupabase();

  const { data: brief, error: be } = await sb.from("briefs")
    .select("id,brief_date,account_id,accounts(company_name,industry,microsoft_team)")
    .eq("id", briefId).maybeSingle();
  if (be) return { error: be.message };
  if (!brief) return { error: "Brief not found" };

  const account = (brief.accounts as unknown) as {
    company_name: string; industry: string;
    microsoft_team: Parameters<typeof draftMicrosoftEmail>[0]["account"]["microsoft_team"];
  } | null;
  if (!account) return { error: "Account missing on brief" };

  const { data: signalRows } = await sb.from("signals")
    .select("signal_type,signal_date,headline,relevance_tags")
    .eq("account_id", brief.account_id as string)
    .order("signal_date", { ascending: false, nullsFirst: false })
    .limit(40);
  const signals = ((signalRows ?? []) as unknown as SignalForEmail[]);

  const baseUrl = await inferBaseUrl();
  const draft = draftMicrosoftEmail({
    account: { company_name: account.company_name, industry: account.industry, microsoft_team: account.microsoft_team },
    brief: { id: brief.id as string, brief_date: brief.brief_date as string },
    signals,
    briefBaseUrl: baseUrl,
  });

  const { error: ie } = await sb.from("outreach").insert({
    account_id: brief.account_id,
    brief_id: brief.id,
    channel: "microsoft",
    recipient: draft.recipient_email,
    subject: draft.subject,
    body: draft.body,
    status: "draft",
  });
  if (ie) return { error: ie.message };
  return { ok: true };
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
