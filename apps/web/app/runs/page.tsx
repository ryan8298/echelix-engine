import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const sb = getAdminSupabase();
  type Row = { id: string; loop_name: string; started_at: string; finished_at: string | null; status: string; accounts_touched: number | null; error_message: string | null };
  const res = await sb.from("run_log")
    .select("id,loop_name,started_at,finished_at,status,accounts_touched,error_message")
    .order("started_at", { ascending: false })
    .limit(100);
  const rows = (res.data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Runs</h1>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs muted">
              <th className="px-4 py-2">Loop</th><th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Touched</th>
              <th className="px-4 py-2">Started</th><th className="px-4 py-2">Finished</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 font-mono text-xs"><Link href={`/runs/${r.id}`} className="hover:underline">{r.loop_name}</Link></td>
                <td className="px-4 py-2"><span className="badge">{r.status}</span></td>
                <td className="px-4 py-2 text-right">{r.accounts_touched ?? "—"}</td>
                <td className="px-4 py-2 muted">{fmtRelative(r.started_at)}</td>
                <td className="px-4 py-2 muted">{r.finished_at ? fmtRelative(r.finished_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
