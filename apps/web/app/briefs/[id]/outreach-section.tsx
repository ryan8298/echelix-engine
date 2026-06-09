import { getAdminSupabase } from "@/lib/supabase/server";
import { fmtRelative } from "@/lib/format";
import { OutreachCard } from "./outreach-card";
import { DraftMicrosoftButton, DraftProspectButton } from "./draft-microsoft-button";

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
            <span className="text-xs muted">{msRows.length} draft{msRows.length === 1 ? "" : "s"} · drafter v2 (signals → offering)</span>
          )}
        </div>
        {msRows.length === 0 ? (
          <p className="text-sm muted">
            No draft yet. Drafter pulls signals, matches them to the right Echelix product/pilot, and tucks in the credibility anchor for the account's industry.
          </p>
        ) : (
          msRows.map((r) => <OutreachCard key={r.id} outreach={r} />)
        )}
        {msRows.length > 0 ? <DraftMicrosoftButton briefId={briefId} label="Regenerate" /> : null}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Prospect outreach (direct)</h3>
          {prospectRows.length === 0 ? <DraftProspectButton briefId={briefId} /> : (
            <span className="text-xs muted">{prospectRows.length} draft{prospectRows.length === 1 ? "" : "s"} · contact pending Apollo people search</span>
          )}
        </div>
        {prospectRows.length === 0 ? (
          <p className="text-sm muted">
            Direct-to-buyer email. Different tone — problem-focused, no MS co-sell positioning. Recipient is blank for now (Apollo people search lands next iteration); fill in manually for today.
          </p>
        ) : (
          prospectRows.map((r) => <OutreachCard key={r.id} outreach={r} />)
        )}
        {prospectRows.length > 0 ? <DraftProspectButton briefId={briefId} label="Regenerate" /> : null}
      </div>

      {rows.length > 0 ? (
        <p className="text-xs muted">last touched {fmtRelative(rows[rows.length - 1]!.updated_at)}</p>
      ) : null}
    </section>
  );
}
