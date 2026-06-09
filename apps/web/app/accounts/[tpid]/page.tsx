import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtDate, fmtRelative, fmtScore, fmtUsd } from "@/lib/format";
import { ApolloRefreshButton } from "./apollo-refresh-button";

export const dynamic = "force-dynamic";

export default async function AccountDetail({ params }: { params: Promise<{ tpid: string }> }) {
  const { tpid } = await params;
  const sb = getAdminSupabase();
  const { data: acc } = await sb.from("accounts").select("*").eq("tpid", Number(tpid)).maybeSingle();
  if (!acc) return notFound();
  const { data: signals } = await sb.from("signals")
    .select("id,signal_type,signal_date,headline,source_url,relevance_tags,captured_at")
    .eq("account_id", acc.id as string)
    .order("signal_date", { ascending: false, nullsFirst: false })
    .limit(40);

  const team = (acc.microsoft_team as Record<string, { name?: string | null; email_alias?: string | null }> | null) ?? null;
  const teamEntries = team ? Object.entries(team).filter(([, v]) => v && typeof v === "object" && (v.name || v.email_alias)) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label">{acc.industry as string} · TPID {acc.tpid as number}</p>
          <h1 className="mt-1 text-2xl font-semibold">{acc.company_name as string}</h1>
        </div>
        <ApolloRefreshButton tpid={acc.tpid as number} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Status" value={acc.status as string} />
        <Stat label="Tier" value={acc.tier as string} />
        <Stat label="Score" value={fmtScore(acc.score as number | null)} />
        <Stat label="Revenue" value={fmtUsd(acc.annual_revenue_usd as number | null)} sub={acc.revenue_verdict as string ?? "—"} />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="label mb-2">Revenue gate</h2>
          <dl className="space-y-1 text-sm">
            <Row k="Verdict" v={acc.revenue_verdict as string ?? "—"} />
            <Row k="Source" v={(acc.revenue_metric as string) ?? "—"} />
            <Row k="Confidence" v={(acc.revenue_confidence as string) ?? "—"} />
            <Row k="As of" v={fmtDate(acc.revenue_as_of as string | null)} />
            <Row k="Ticker / domain" v={`${acc.ticker ?? "—"} · ${acc.domain ?? "—"}`} />
            {acc.revenue_source_url ? (
              <Row k="Source URL" v={<a href={acc.revenue_source_url as string} target="_blank" rel="noreferrer" className="underline">link</a>} />
            ) : null}
          </dl>
        </div>
        <div className="card">
          <h2 className="label mb-2">Microsoft account team</h2>
          {teamEntries.length === 0 ? <p className="muted text-sm">—</p> : (
            <dl className="space-y-1 text-sm">
              {teamEntries.map(([k, v]) => (
                <Row key={k} k={k.replace(/_/g, " ")}
                     v={`${v.name ?? "—"}${v.email_alias ? ` (${v.email_alias})` : ""}`} />
              ))}
            </dl>
          )}
        </div>
      </section>

      <section>
        <h2 className="label mb-2">Signals ({signals?.length ?? 0})</h2>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs muted">
              <th className="px-4 py-2 w-24">Date</th><th className="px-4 py-2 w-24">Type</th>
              <th className="px-4 py-2">Headline</th><th className="px-4 py-2">Tags</th>
            </tr></thead>
            <tbody>
              {(signals ?? []).map((s) => (
                <tr key={s.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 muted">{fmtDate(s.signal_date as string | null)}</td>
                  <td className="px-4 py-2"><span className="badge">{s.signal_type as string}</span></td>
                  <td className="px-4 py-2">
                    {s.source_url ? <a href={s.source_url as string} target="_blank" rel="noreferrer" className="hover:underline">{s.headline as string}</a> : (s.headline as string)}
                    <div className="text-xs muted">captured {fmtRelative(s.captured_at as string)}</div>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {((s.relevance_tags as string[] | null) ?? []).map((t) => (
                      <span key={t} className="badge mr-1">{t}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="mt-1 text-lg font-medium">{value}</div>
      {sub ? <div className="text-xs muted mt-0.5">{sub}</div> : null}
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="muted">{k}</dt><dd className="text-right">{v}</dd>
    </div>
  );
}
