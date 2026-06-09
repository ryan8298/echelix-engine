import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtRelative } from "@/lib/format";
import { OutreachCard } from "./outreach-card";
import { DraftMicrosoftButton } from "./draft-microsoft-button";

type Outreach = {
  id: string;
  brief_id: string | null;
  channel: "microsoft" | "prospect";
  recipient: string | null;
  subject: string | null;
  body: string | null;
  status: "draft" | "approved" | "sent" | "failed";
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function OutreachSection({ briefId }: { briefId: string }) {
  const sb = getAdminSupabase();
  const { data } = await sb.from("outreach").select("*").eq("brief_id", briefId).order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Outreach[];
  const msRows = rows.filter((r) => r.channel === "microsoft");
  const prospectRows = rows.filter((r) => r.channel === "prospect");

  return (
    <section className="space-y-4">
      <h2 className="label">Outreach</h2>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Microsoft co-sell email</h3>
          {msRows.length === 0 ? <DraftMicrosoftButton briefId={briefId} /> : (
            <span className="text-xs muted">{msRows.length} draft{msRows.length === 1 ? "" : "s"} · regenerate to refresh template</span>
          )}
        </div>
        {msRows.length === 0 ? (
          <p className="text-sm muted">
            No draft yet. Click "Draft email" to generate from the account's Microsoft team + recent signals.
          </p>
        ) : (
          msRows.map((r) => <OutreachCard key={r.id} outreach={r} />)
        )}
        {msRows.length > 0 ? <DraftMicrosoftButton briefId={briefId} label="Regenerate draft" /> : null}
      </div>

      <div className="card space-y-2">
        <h3 className="text-sm font-semibold">Prospect outreach</h3>
        {prospectRows.length === 0 ? (
          <>
            <p className="text-sm muted">
              Pulls Apollo contacts matching the brief's buyer personas. Wires up after the Apollo credit cycle resets on June 11, 2026.
            </p>
            <span className="badge text-xs">queued for 2026-06-11</span>
          </>
        ) : (
          prospectRows.map((r) => <OutreachCard key={r.id} outreach={r} />)
        )}
      </div>

      {rows.length > 0 ? (
        <p className="text-xs muted">last touched {fmtRelative(rows[rows.length - 1]!.updated_at)}</p>
      ) : null}
    </section>
  );
}
