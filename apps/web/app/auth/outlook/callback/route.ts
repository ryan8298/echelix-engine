import { getAdminSupabase, requireUser } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/outlook";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  await requireUser();
  const code = new URL(req.url).searchParams.get("code");
  const errParam = new URL(req.url).searchParams.get("error_description");
  if (errParam) return NextResponse.redirect(`${new URL(req.url).origin}/settings?outlook_error=${encodeURIComponent(errParam)}`);
  if (!code) return NextResponse.redirect(`${new URL(req.url).origin}/settings?outlook_error=no_code`);

  try {
    const tokens = await exchangeCodeForTokens(code);
    const sb = getAdminSupabase();
    await sb.from("outlook_tokens").upsert({
      user_email: tokens.account_email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: new Date(tokens.expires_at).toISOString(),
      scopes: "Mail.ReadWrite offline_access User.Read",
    }, { onConflict: "user_email" });
    return NextResponse.redirect(`${new URL(req.url).origin}/settings?outlook_connected=${encodeURIComponent(tokens.account_email)}`);
  } catch (e) {
    return NextResponse.redirect(`${new URL(req.url).origin}/settings?outlook_error=${encodeURIComponent((e as Error).message)}`);
  }
}
