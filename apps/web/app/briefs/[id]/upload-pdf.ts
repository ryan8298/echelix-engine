"use server";

import { getAdminSupabase, requireUser } from "@/lib/supabase/server";

export async function uploadBriefPdf(briefId: string, fileName: string, fileBytes: Buffer): Promise<{ ok?: true; error?: string }> {
  await requireUser();
  const sb = getAdminSupabase();

  // Fetch the brief to get account_id and date
  const { data: brief, error: briefErr } = await sb.from("briefs")
    .select("id, account_id, brief_date").eq("id", briefId).maybeSingle();
  if (briefErr || !brief) return { error: "Brief not found" };

  const storagePath = `${brief.brief_date}/${brief.account_id}.pdf`;

  try {
    // Upload to Storage
    const { error: uploadErr } = await sb.storage
      .from("briefs")
      .upload(storagePath, fileBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) return { error: `Storage upload failed: ${uploadErr.message}` };

    // Update brief row with pdf_path
    const { error: updateErr } = await sb.from("briefs")
      .update({ pdf_path: storagePath, updated_at: new Date().toISOString() })
      .eq("id", briefId);
    if (updateErr) return { error: `Database update failed: ${updateErr.message}` };

    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
