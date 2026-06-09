import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtScore, fmtUsd, fmtRelative } from "@/lib/format";
import { BulkActionBar } from "./bulk-action-bar";

export const dynamic = "force-dynamic";

const INDUSTRY_LABEL: Record<string, string> = {
  utilities: "Utilities",
  oil_and_gas: "Oil & Gas",
  distribution_transportation: "Distribution & Transportation",
  manufacturing: "Manufacturing",
  financial_services: "Financial Services",
  other: "Other (out of rotation)",
};

const PAGE_SIZE = 100;

type SP = {
  industry?: string;
  vertical?: string;
  status?: string;
  tier?: string;
  rev_min?: string;
  rev_max?: string;
  q?: string;
  sort?: "score" | "revenue" | "name" | "researched";
  page?: string;
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = getAdminSupabase();

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Distinct verticals — populates the dropdown.
  const verticalsRes = await sb.from("accounts").select("source_vertical").not("source_vertical", "is", null).limit(2000);
  const verticals = Array.from(new Set((verticalsRes.data as Array<{ source_vertical: string | null }> | null ?? []).map((r) => r.source_vertical).filter(Boolean) as string[])).sort();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any): any {
    if (sp.industry) q = q.eq("industry", sp.industry);
    if (sp.vertical) q = q.eq("source_vertical", sp.vertical);
    if (sp.status) q = q.eq("status", sp.status);
    if (sp.tier) q = q.eq("tier", sp.tier);
    if (sp.rev_min && !isNaN(Number(sp.rev_min))) q = q.gte("annual_revenue_usd", Number(sp.rev_min) * 1_000_000);
    if (sp.rev_max && !isNaN(Number(sp.rev_max))) q = q.lte("annual_revenue_usd", Number(sp.rev_max) * 1_000_000);
    if (sp.q) q = q.ilike("company_name", `%${sp.q}%`);
    return q;
  }

  const sort = sp.sort ?? "score";
  const orderCol = sort === "revenue" ? "annual_revenue_usd" : sort === "name" ? "company_name" : sort === "researched" ? "last_researched" : "score";
  const ascending = sort === "name";

  const countRes = await applyFilters(sb.from("accounts").select("id", { count: "exact", head: true }));
  const total: number = countRes.count ?? 0;

  const pageRes = await applyFilters(
    sb.from("accounts")
      .select("id,tpid,company_name,industry,source_vertical,status,tier,score,annual_revenue_usd,last_researched")
      .order(orderCol, { ascending, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1),
  );
  const rows = pageRes.data as Array<Record<string, unknown>> | null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);

  // Pagination link builder
  function pageUrl(n: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, String(v));
    params.set("page", String(n));
    return `?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="muted mt-1 text-sm">
          {total.toLocaleString()} match{total === 1 ? "" : "es"} — showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()}
        </p>
      </div>

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="search name" className="input" />
        <select name="industry" defaultValue={sp.industry ?? ""} className="input">
          <option value="">All industries</option>
          {Object.entries(INDUSTRY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="vertical" defaultValue={sp.vertical ?? ""} className="input">
          <option value="">All verticals</option>
          {verticals.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="input">
          <option value="">All status</option>
          <option value="active">active</option>
          <option value="pending">pending</option>
          <option value="out_of_range">out_of_range</option>
          <option value="out_of_rotation">out_of_rotation</option>
          <option value="paused">paused</option>
          <option value="closed">closed</option>
          <option value="do_not_contact">do_not_contact</option>
        </select>
        <select name="tier" defaultValue={sp.tier ?? ""} className="input">
          <option value="">All tiers</option>
          <option value="hot">hot</option>
          <option value="warm">warm</option>
          <option value="cold">cold</option>
        </select>
        <div className="flex gap-2">
          <input name="rev_min" type="number" defaultValue={sp.rev_min ?? ""} placeholder="min $M" className="input w-full" />
          <input name="rev_max" type="number" defaultValue={sp.rev_max ?? ""} placeholder="max $M" className="input w-full" />
        </div>
        <select name="sort" defaultValue={sp.sort ?? "score"} className="input">
          <option value="score">Sort: score (desc)</option>
          <option value="revenue">Sort: revenue (desc)</option>
          <option value="name">Sort: name (asc)</option>
          <option value="researched">Sort: last researched (desc)</option>
        </select>
        <div className="flex gap-2">
          <button className="btn-primary flex-1">Apply</button>
          <Link href="/accounts" className="btn">Reset</Link>
        </div>
      </form>

      <BulkActionBar
        total={total}
        filters={{
          industry: sp.industry ?? "",
          vertical: sp.vertical ?? "",
          status: sp.status ?? "",
          tier: sp.tier ?? "",
        }}
      />

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs muted">
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Industry / Vertical</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2 text-right">Score</th>
              <th className="px-4 py-2 text-right">Revenue</th>
              <th className="px-4 py-2">Researched</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r: Record<string, unknown>) => (
              <tr key={r.id as string} className="border-b border-border/50 last:border-0 hover:bg-neutral-900/40">
                <td className="px-4 py-2 font-medium"><Link href={`/accounts/${r.tpid}`} className="hover:underline">{r.company_name as string}</Link></td>
                <td className="px-4 py-2 muted text-xs">
                  <div>{INDUSTRY_LABEL[r.industry as string] ?? r.industry as string}</div>
                  <div>{r.source_vertical as string ?? "—"}</div>
                </td>
                <td className="px-4 py-2"><span className="badge">{r.status as string}</span></td>
                <td className="px-4 py-2 muted">{r.tier as string}</td>
                <td className="px-4 py-2 text-right">{fmtScore(r.score as number | null)}</td>
                <td className="px-4 py-2 text-right">{fmtUsd(r.annual_revenue_usd as number | null)}</td>
                <td className="px-4 py-2 muted">{fmtRelative(r.last_researched as string | null)}</td>
              </tr>
            ))}
            {(rows ?? []).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center muted">No matches.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Link href={pageUrl(Math.max(1, page - 1))} className={`btn ${page === 1 ? "pointer-events-none opacity-40" : ""}`}>← Prev</Link>
          <span className="muted">Page {page} of {totalPages}</span>
          <Link href={pageUrl(Math.min(totalPages, page + 1))} className={`btn ${page === totalPages ? "pointer-events-none opacity-40" : ""}`}>Next →</Link>
        </div>
      ) : null}
    </div>
  );
}
