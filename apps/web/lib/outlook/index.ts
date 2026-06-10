/**
 * Microsoft Graph — Outlook drafts integration.
 *
 * Creates messages in the user's Outlook Drafts folder, not auto-send.
 * The engine drafts → drops into Drafts → user reviews + clicks Send in Outlook.
 *
 * Auth: Azure AD app registration, delegated permission Mail.ReadWrite,
 * refresh-token stored per-user in `outlook_tokens` table.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TENANT = process.env.MICROSOFT_TENANT_ID ?? "common"; // 'common' supports both work & personal
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI; // e.g. https://echelix-engine-web.vercel.app/auth/outlook/callback

export const OUTLOOK_SCOPES = ["offline_access", "Mail.ReadWrite", "User.Read"].join(" ");

export function buildAuthorizeUrl(state: string): string {
  if (!CLIENT_ID || !REDIRECT_URI) throw new Error("Outlook OAuth env vars not set");
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: OUTLOOK_SCOPES,
    state,
  });
  return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params}`;
}

export type TokenSet = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms epoch
  account_email: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) throw new Error("Outlook OAuth env vars not set");
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  // Pull the account email from /me
  const meRes = await fetch(`${GRAPH_BASE}/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
  const me = (await meRes.json()) as { mail?: string; userPrincipalName?: string };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    account_email: (me.mail ?? me.userPrincipalName ?? "").toLowerCase(),
  };
}

export async function refreshAccessToken(refresh_token: string): Promise<{ access_token: string; expires_at: number; refresh_token: string }> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Outlook OAuth env vars not set");
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 };
}

/**
 * Create a draft message in the user's Outlook Drafts folder.
 * Returns the Graph message id so we can deep-link the user back into the draft.
 */
export async function createDraft(opts: {
  access_token: string;
  to: string;
  subject: string;
  body: string;
  bodyType?: "Text" | "HTML";
  cc?: string[];
  attachmentPdfUrl?: { name: string; signedUrl: string };
}): Promise<{ id: string; webLink: string }> {
  const recipients = [{ emailAddress: { address: opts.to } }];
  const ccRecipients = (opts.cc ?? []).map((a) => ({ emailAddress: { address: a } }));
  const message: Record<string, unknown> = {
    subject: opts.subject,
    body: { contentType: opts.bodyType ?? "Text", content: opts.body },
    toRecipients: recipients,
    ccRecipients,
  };

  // Optional PDF attachment — for the MS email we include the brief PDF.
  if (opts.attachmentPdfUrl) {
    const pdfRes = await fetch(opts.attachmentPdfUrl.signedUrl);
    if (!pdfRes.ok) throw new Error(`Failed to fetch PDF for attachment: ${pdfRes.status}`);
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    message.attachments = [
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: opts.attachmentPdfUrl.name,
        contentBytes: buf.toString("base64"),
        contentType: "application/pdf",
      },
    ];
  }

  const res = await fetch(`${GRAPH_BASE}/me/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Draft create failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; webLink: string };
  return { id: data.id, webLink: data.webLink };
}
