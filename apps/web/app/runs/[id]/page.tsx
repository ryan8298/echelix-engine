import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtDate, fmtRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = getAdminSupabase();
  type Row = { id: string; loop_name: string; started_at: string; finished_at: string | null; status: string; details: unknown; error_message: string | null };
  const res = await sb.from("run_log").select("*").eq("id", id).maybeSingle();
  const row = res.data as unknown as Row | null;
  if (!row) return notFound();
  return (
    <div className="space-y-6">
      <div>
        <p className="label">{row.loop_name}</p>
        <h1 className="mt-1 text-2xl font-semibold">Run {row.id.slice(0, 8)}</h1>
        <p className="muted mt-1 text-sm">started {fmtRelative(row.started_at)} · {fmtDate(row.started_at)}</p>
      </div>
      <pre className="card overflow-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(row.details ?? {}, null, 2)}</pre>
      {row.error_message ? (
        <div className="card border-red-800/40 bg-red-950/20 text-sm text-red-300">
          <div className="label mb-1 text-red-400">Error</div>
          <pre className="whitespace-pre-wrap">{row.error_message}</pre>
        </div>
      ) : null}
    </div>
  );
}
