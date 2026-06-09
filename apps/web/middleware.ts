import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          for (const { name, value, options } of toSet) {
            res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]);
          }
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();

  // Email allowlist — server-side enforcement that survives even if signups
  // accidentally get re-enabled in Supabase. Comma-separated env var.
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const emailOk = user?.email
    ? (allowed.length === 0 || allowed.includes(user.email.toLowerCase()))
    : false;

  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));
  if ((!user || !emailOk) && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    if (user && !emailOk) url.searchParams.set("reason", "not_allowed");
    // If they have a session but aren't allowed, drop the session so they
    // don't see a stale "Sign out" affordance on /login.
    if (user && !emailOk) await supabase.auth.signOut();
    return NextResponse.redirect(url);
  }
  if (user && emailOk && req.nextUrl.pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
