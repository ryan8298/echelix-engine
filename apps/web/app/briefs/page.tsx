import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtDate, fmtScore } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const sb = getAdminSupabase();
  const { data: rows } = await sb.from("briefs")
    .select("id,brief_date,status,pdf_path,score_at_pick,account_id,accounts(company_name,industry)")
    .order("brief_date", { ascending: false })
    .order("score_at_pick", { ascending: false, nullsFirst: false })
    .limit(60);

  type Row = {
    id: string; brief_date: string; status: string; pdf_path: string | null;
    score_at_pick: number | null;
    accounts: { company_name: string; industry: string } | null;
  };
  const byDate = new Map<string, Row[]>();
  for (const r of (rows ?? []) as unknown as Row[]) {
    if (!byDate.has(r.brief_date)) byDate.set(r.brief_date, []);
    byDate.get(r.brief_date)!.push(r);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Briefs</h1>
        <p className="muted mt-1 text-sm">Recent picks across all rotation days. Pending generation rows wait for you to run the skill.</p>
      </div>
      {byDate.size === 0 ? (
        <div className="card muted text-sm">
          No briefs yet. Run <code className="rounded bg-neutral-800 px-1.5 py-0.5">pnpm select</code> for today's industry.
        </div>
      ) : (
        [...byDate.entries()].map(([date, items]) => (
          <section key={date}>
            <h2 className="label mb-3">{fmtDate(date)}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((b) => {
                const stage = !b.pdf_path ? "Pending generation" : b.status === "draft" ? "Draft — review" : b.status;
                return (
                  <Link key={b.id} href={`/briefs/${b.id}`} className="card hover:bg-neutral-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{b.accounts?.company_name ?? "—"}</div>
                      <span className="badge">{stage}</span>
                    </div>
                    <div className="mt-1 text-xs muted">
                      {b.accounts?.industry ?? ""} · score {fmtScore(b.score_at_pick)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
