"use client";

import { useState, useTransition } from "react";
import { runBulkOnFilter, runSelectOnFilter } from "./bulk-actions";

type Props = {
  total: number;
  filters: { industry: string; source_industry: string; vertical: string; status: string; tier: string };
};

export function BulkActionBar({ total, filters }: Props) {
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; url?: string } | null>(null);
  const [pending, start] = useTransition();
  const [pickN, setPickN] = useState("5");
  const filterSummary = [
    filters.industry && `industry=${filters.industry}`,
    filters.source_industry && `source_industry=${filters.source_industry}`,
    filters.vertical && `vertical=${filters.vertical}`,
    filters.status && `status=${filters.status}`,
    filters.tier && `tier=${filters.tier}`,
  ].filter(Boolean).join(" · ") || "no filters (all accounts)";

  function run(action: "enrich" | "apollo_enrich") {
    start(async () => {
      const r = await runBulkOnFilter(action, filters);
      setMsg(r.error ? { kind: "err", text: r.error } : { kind: "ok", text: `Dispatched on ${total.toLocaleString()} accounts.`, url: r.runUrl });
    });
  }
  function pick() {
    start(async () => {
      const r = await runSelectOnFilter({ ...filters, top: pickN });
      setMsg(r.error ? { kind: "err", text: r.error } : { kind: "ok", text: `Selection dispatched. Top ${pickN} from this filter will appear on /briefs in ~30s.`, url: r.runUrl });
    });
  }

  return (
    <div className="card space-y-3 border-accent/40 bg-blue-950/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">Run on this filtered set</div>
          <div className="muted text-xs">{filterSummary} → {total.toLocaleString()} accounts</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={pending || total === 0} onClick={() => run("enrich")}>
            {pending ? "…" : "Refresh signals (free)"}
          </button>
          <button className="btn" disabled={pending || total === 0} onClick={() => run("apollo_enrich")} title={`Costs ~${total} Apollo credits`}>
            {pending ? "…" : `Pull Apollo (~${total} credits)`}
          </button>
          <div className="flex items-center gap-1 rounded-md border border-border bg-bg pl-2 text-sm">
            <span className="muted text-xs">pick top</span>
            <input type="number" min={1} max={20} value={pickN} onChange={(e) => setPickN(e.target.value)} className="w-12 bg-transparent px-1 py-1 focus:outline-none" />
            <button className="btn-primary !rounded-l-none" disabled={pending || total === 0} onClick={pick}>
              {pending ? "…" : "Generate briefs"}
            </button>
          </div>
        </div>
      </div>
      {msg ? (
        <div className={`text-sm ${msg.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>
          {msg.text} {msg.url ? <a href={msg.url} target="_blank" rel="noreferrer" className="underline">view ↗</a> : null}
        </div>
      ) : null}
    </div>
  );
}
