"use server";

import { getAdminSupabase, requireUser } from "@/lib/supabase/server";
import { createDraft, refreshAccessToken } from "@/lib/outlook";

async function getValidAccessToken(): Promise<string | null> {
  const sb = getAdminSupabase();
  const { data } = await sb.from("outlook_tokens").select("*").limit(1).maybeSingle();
  if (!data) return null;
  const row = data as { refresh_token: string; access_token: string | null; expires_at: string | null; user_email: string };
  const stillFresh = row.access_token && row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000;
  if (stillFresh) return row.access_token!;
  // Refresh
  const refreshed = await refreshAccessToken(row.refresh_token);
  await sb.from("outlook_tokens").update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: new Date(refreshed.expires_at).toISOString(),
  }).eq("user_email", row.user_email);
  return refreshed.access_token;
}

export async function sendOutreachToOutlookDrafts(outreachId: string): Promise<{ ok?: true; error?: string; draftWebLink?: string }> {
  await requireUser();
  const sb = getAdminSupabase();
  const { data: row } = await sb.from("outreach").select("*, briefs(brief_date, pdf_path, account_id, accounts(company_name))").eq("id", outreachId).maybeSingle();
  if (!row) return { error: "Outreach not found" };
  type Outreach = {
    id: string; recipient: string | null; subject: string | null; body: string | null;
    channel: "microsoft" | "prospect";
    briefs: { brief_date: string; pdf_path: string | null; account_id: string; accounts: { company_name: string } | null } | null;
  };
  const r = row as unknown as Outreach;
  if (!r.recipient) return { error: "No recipient — fill the To field first" };
  if (!r.subject || !r.body) return { error: "Subject + body required" };

  const accessToken = await getValidAccessToken();
  if (!accessToken) return { error: "Outlook not connected. Go to Settings → Connect Outlook." };

  // Attach the PDF for Microsoft co-sell drafts when one exists.
  let attach: { name: string; signedUrl: string } | undefined;
  if (r.channel === "microsoft" && r.briefs?.pdf_path) {
    const { data: signed } = await sb.storage.from("briefs").createSignedUrl(r.briefs.pdf_path, 60);
    if (signed?.signedUrl) {
      const company = r.briefs.accounts?.company_name ?? "Account";
      attach = { name: `Echelix_${company.replace(/[^\w]+/g, "_")}_CoSell_Brief.pdf`, signedUrl: signed.signedUrl };
    }
  }

  try {
    const draft = await createDraft({
      access_token: accessToken,
      to: r.recipient,
      subject: r.subject,
      body: r.body,
      bodyType: "Text",
      attachmentPdfUrl: attach,
    });
    await sb.from("outreach").update({ status: "approved", external_id: draft.id }).eq("id", outreachId);
    return { ok: true, draftWebLink: draft.webLink };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
