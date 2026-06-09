"use server";

import { getAdminSupabase, requireUser } from "@/lib/supabase/server";

export async function uploadBriefPdf(fd: FormData): Promise<{ ok?: true; error?: string }> {
  await requireUser();
  const file = fd.get("file") as File | null;
  const briefId = String(fd.get("brief_id") ?? "");
  if (!file || !briefId) return { error: "Missing file or brief_id" };
  const sb = getAdminSupabase();
  const { data: brief } = await sb.from("briefs").select("id,brief_date,account_id").eq("id", briefId).maybeSingle();
  if (!brief) return { error: "Brief not found" };
  const path = `${brief.brief_date}/${brief.account_id}.pdf`;
  const arrayBuf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage.from("briefs").upload(path, new Uint8Array(arrayBuf), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return { error: upErr.message };
  const { error: dbErr } = await sb.from("briefs").update({ pdf_path: path, status: "draft" }).eq("id", briefId);
  if (dbErr) return { error: dbErr.message };
  return { ok: true };
}

export async function setBriefStatus(briefId: string, status: "draft" | "reviewed" | "sent"): Promise<{ error?: string }> {
  await requireUser();
  const sb = getAdminSupabase();
  const { error } = await sb.from("briefs").update({ status }).eq("id", briefId);
  return error ? { error: error.message } : {};
}
