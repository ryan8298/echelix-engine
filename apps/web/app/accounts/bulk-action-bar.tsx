"use client";

import { useState, useTransition } from "react";
import { runBulkOnFilter } from "./bulk-actions";

type Props = {
  total: number;
  filters: { industry: string; vertical: string; status: string; tier: string };
};

export function BulkActionBar({ total, filters }: Props) {
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; url?: string } | null>(null);
  const [pending, start] = useTransition();
  const filterSummary = [
    filters.industry && `industry=${filters.industry}`,
    filters.vertical && `vertical=${filters.vertical}`,
    filters.status && `status=${filters.status}`,
    filters.tier && `tier=${filters.tier}`,
  ].filter(Boolean).join(" · ") || "no filters (all in-rotation accounts)";

  function run(action: "enrich" | "apollo_enrich") {
    start(async () => {
      const r = await runBulkOnFilter(action, filters);
      setMsg(r.error ? { kind: "err", text: r.error } : { kind: "ok", text: `Dispatched on ${total.toLocaleString()} accounts.`, url: r.runUrl });
    });
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 border-accent/40 bg-blue-950/10">
      <div className="text-sm">
        <div className="font-medium">Run on this filtered set</div>
        <div className="muted text-xs">{filterSummary} → {total.toLocaleString()} accounts</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending || total === 0} onClick={() => run("enrich")}>
          {pending ? "…" : "Refresh signals (free)"}
        </button>
        <button className="btn" disabled={pending || total === 0} onClick={() => run("apollo_enrich")} title={`Costs ~${total} Apollo credits`}>
          {pending ? "…" : `Pull Apollo (~${total} credits)`}
        </button>
      </div>
      {msg ? (
        <div className={`basis-full text-sm ${msg.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>
          {msg.text} {msg.url ? <a href={msg.url} target="_blank" rel="noreferrer" className="underline">view ↗</a> : null}
        </div>
      ) : null}
    </div>
  );
}
