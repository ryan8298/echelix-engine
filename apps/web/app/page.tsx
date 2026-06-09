import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtRelative } from "@/lib/format";

const INDUSTRY_BY_WEEKDAY: Record<number, string | null> = {
  0: null, 1: "utilities", 2: "oil_and_gas", 3: "distribution_transportation",
  4: "manufacturing", 5: "financial_services", 6: null,
};
const INDUSTRY_LABEL: Record<string, string> = {
  utilities: "Utilities",
  oil_and_gas: "Oil & Gas",
  distribution_transportation: "Distribution & Transportation",
  manufacturing: "Manufacturing",
  financial_services: "Financial Services",
};

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const sb = getAdminSupabase();
  const today = new Date();
  const todayInd = INDUSTRY_BY_WEEKDAY[today.getDay()];

  type RunRow = { id: string; loop_name: string; started_at: string; finished_at: string | null; status: string; accounts_touched: number | null };
  type BriefRow = { id: string; account_id: string; status: string; pdf_path: string | null; score_at_pick: number | null; accounts: { company_name: string; industry: string } | null };

  const statusByIndustry = await sb.from("accounts").select("industry, status").neq("industry", "other");
  const todayBriefsRes = todayInd
    ? await sb.from("briefs")
        .select("id, account_id, status, pdf_path, score_at_pick, accounts(company_name, industry)")
        .eq("brief_date", today.toISOString().slice(0, 10))
        .order("score_at_pick", { ascending: false })
    : { data: [] };
  const recentRunsRes = await sb.from("run_log")
    .select("id, loop_name, started_at, finished_at, status, accounts_touched")
    .order("started_at", { ascending: false })
    .limit(8);
  const todayBriefs = { data: (todayBriefsRes.data ?? []) as unknown as BriefRow[] };
  const recentRuns = { data: (recentRunsRes.data ?? []) as unknown as RunRow[] };

  const counts: Record<string, { active: number; pending: number; out_of_range: number; total: number }> = {};
  for (const row of (statusByIndustry.data ?? []) as Array<{ industry: string; status: string }>) {
    if (!counts[row.industry]) counts[row.industry] = { active: 0, pending: 0, out_of_range: 0, total: 0 };
    counts[row.industry]!.total++;
    if (row.status === "active") counts[row.industry]!.active++;
    else if (row.status === "pending") counts[row.industry]!.pending++;
    else if (row.status === "out_of_range") counts[row.industry]!.out_of_range++;
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="label">Today · {today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {todayInd ? INDUSTRY_LABEL[todayInd] : "Weekend — no rotation"}
        </h1>
      </div>

      <section>
        <h2 className="label mb-3">Today's brief queue</h2>
        {!todayInd ? (
          <div className="card muted text-sm">No industry rotation on weekends.</div>
        ) : (todayBriefs.data ?? []).length === 0 ? (
          <div className="card muted text-sm">
            No briefs queued for today. Run <code className="rounded bg-neutral-800 px-1.5 py-0.5">pnpm select</code> for today's industry.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {todayBriefs.data.map((b) => (
              <Link key={b.id} href={`/briefs/${b.id}`} className="card hover:bg-neutral-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{b.accounts?.company_name ?? "—"}</div>
                  <span className="badge">{b.pdf_path ? b.status : "pending generation"}</span>
                </div>
                <div className="mt-1 text-xs muted">score {b.score_at_pick?.toFixed(1) ?? "—"}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="label mb-3">Population by industry</h2>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs muted">
              <th className="px-4 py-2">Industry</th><th className="px-4 py-2 text-right">Active</th>
              <th className="px-4 py-2 text-right">Pending</th><th className="px-4 py-2 text-right">Out of range</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr></thead>
            <tbody>
              {Object.entries(counts).sort().map(([ind, c]) => (
                <tr key={ind} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2"><Link href={`/accounts?industry=${ind}`} className="hover:underline">{INDUSTRY_LABEL[ind] ?? ind}</Link></td>
                  <td className="px-4 py-2 text-right">{c.active}</td>
                  <td className="px-4 py-2 text-right">{c.pending}</td>
                  <td className="px-4 py-2 text-right muted">{c.out_of_range}</td>
                  <td className="px-4 py-2 text-right">{c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="label mb-3">Recent runs</h2>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs muted">
              <th className="px-4 py-2">Loop</th><th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Touched</th><th className="px-4 py-2">When</th>
            </tr></thead>
            <tbody>
              {recentRuns.data.map((r) => (
                <tr key={r.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs"><Link href={`/runs/${r.id}`} className="hover:underline">{r.loop_name}</Link></td>
                  <td className="px-4 py-2"><span className="badge">{r.status}</span></td>
                  <td className="px-4 py-2">{r.accounts_touched ?? "—"}</td>
                  <td className="px-4 py-2 muted">{fmtRelative(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
