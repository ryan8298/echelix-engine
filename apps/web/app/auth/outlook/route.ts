import { requireUser } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/outlook";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export async function GET() {
  await requireUser();
  const state = randomBytes(16).toString("hex");
  // We don't persist state (single-user). If multi-user, store in DB keyed by user.
  const url = buildAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
