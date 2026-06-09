import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtScore, fmtUsd, fmtRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

const INDUSTRY_LABEL: Record<string, string> = {
  utilities: "Utilities",
  oil_and_gas: "Oil & Gas",
  distribution_transportation: "Distribution & Transportation",
  manufacturing: "Manufacturing",
  financial_services: "Financial Services",
  other: "Other (out of rotation)",
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ industry?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const sb = getAdminSupabase();
  let q = sb.from("accounts")
    .select("id,tpid,company_name,industry,status,tier,score,annual_revenue_usd,last_researched,last_surfaced_date")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(200);
  if (sp.industry) q = q.eq("industry", sp.industry);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.q) q = q.ilike("company_name", `%${sp.q}%`);
  const { data: rows } = await q;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="muted mt-1 text-sm">{rows?.length ?? 0} shown (top 200 by score)</p>
      </div>

      <form className="flex flex-wrap items-center gap-2 text-sm">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="search name" className="input w-56" />
        <select name="industry" defaultValue={sp.industry ?? ""} className="input">
          <option value="">All industries</option>
          {Object.entries(INDUSTRY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="input">
          <option value="">All status</option>
          <option value="active">active</option>
          <option value="pending">pending</option>
          <option value="out_of_range">out_of_range</option>
          <option value="out_of_rotation">out_of_rotation</option>
        </select>
        <button className="btn">Filter</button>
      </form>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs muted">
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Industry</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2 text-right">Score</th>
              <th className="px-4 py-2 text-right">Revenue</th>
              <th className="px-4 py-2">Researched</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-neutral-900/40">
                <td className="px-4 py-2 font-medium"><Link href={`/accounts/${r.tpid}`} className="hover:underline">{r.company_name}</Link></td>
                <td className="px-4 py-2 muted">{INDUSTRY_LABEL[r.industry as string] ?? r.industry}</td>
                <td className="px-4 py-2"><span className="badge">{r.status as string}</span></td>
                <td className="px-4 py-2 muted">{r.tier as string}</td>
                <td className="px-4 py-2 text-right">{fmtScore(r.score as number | null)}</td>
                <td className="px-4 py-2 text-right">{fmtUsd(r.annual_revenue_usd as number | null)}</td>
                <td className="px-4 py-2 muted">{fmtRelative(r.last_researched as string | null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
