import "./globals.css";
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

export const metadata = { title: "Echelix Engine" };

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/briefs", label: "Briefs" },
  { href: "/accounts", label: "Accounts" },
  { href: "/runs", label: "Runs" },
  { href: "/triggers", label: "Triggers" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <html lang="en">
      <body className="min-h-screen">
        {user ? (
          <div className="border-b border-border bg-surface">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
              <div className="flex items-center gap-6">
                <Link href="/" className="font-semibold tracking-tight">Echelix Engine</Link>
                <nav className="flex items-center gap-4 text-sm muted">
                  {NAV.map((n) => (
                    <Link key={n.href} href={n.href} className="hover:text-neutral-200">{n.label}</Link>
                  ))}
                </nav>
              </div>
              <div className="flex items-center gap-3 text-xs muted">
                <span>{user.email}</span>
                <LogoutButton />
              </div>
            </div>
          </div>
        ) : null}
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
