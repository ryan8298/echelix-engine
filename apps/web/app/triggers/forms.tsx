"use client";

import { useState, useTransition } from "react";
import { triggerEnrich, triggerSelect, triggerGate } from "./actions";

const INDUSTRIES = [
  ["", "All / today's rotation"],
  ["utilities", "Utilities"],
  ["oil_and_gas", "Oil & Gas"],
  ["distribution_transportation", "Distribution & Transportation"],
  ["manufacturing", "Manufacturing"],
  ["financial_services", "Financial Services"],
] as const;

function Status({ msg }: { msg: { kind: "ok" | "err"; text: string; url?: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`rounded-md border p-2 text-sm ${msg.kind === "ok" ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200" : "border-red-700/50 bg-red-950/30 text-red-200"}`}>
      {msg.text} {msg.url ? <a href={msg.url} target="_blank" rel="noreferrer" className="underline">View runs ↗</a> : null}
    </div>
  );
}

export function TriggerEnrich() {
  const [industry, setIndustry] = useState("");
  const [force, setForce] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; url?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2"><span className="muted">Industry</span>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="input">
            {INDUSTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 muted">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Force (ignore tier cadence)
        </label>
      </div>
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await triggerEnrich({ industry, force });
        setMsg(r.error ? { kind: "err", text: r.error } : { kind: "ok", text: "Enrichment dispatched. Look in Runs in ~30s for the new row.", url: r.runUrl });
      })}>{pending ? "Dispatching…" : "Run enrichment now"}</button>
      <Status msg={msg} />
    </div>
  );
}

export function TriggerSelect() {
  const [industry, setIndustry] = useState("");
  const [date, setDate] = useState("");
  const [includePending, setIncludePending] = useState(false);
  const [top, setTop] = useState("5");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; url?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2"><span className="muted">Industry</span>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="input">
            {INDUSTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2"><span className="muted">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>
        <label className="flex items-center gap-2"><span className="muted">Top N</span>
          <input type="number" min={1} max={20} value={top} onChange={(e) => setTop(e.target.value)} className="input w-20" />
        </label>
        <label className="flex items-center gap-2 muted">
          <input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} /> Include pending accounts
        </label>
      </div>
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await triggerSelect({ industry, date, includePending, top });
        setMsg(r.error ? { kind: "err", text: r.error } : { kind: "ok", text: "Selection dispatched. Brief queue rows will appear in ~30s.", url: r.runUrl });
      })}>{pending ? "Dispatching…" : "Run selection now"}</button>
      <Status msg={msg} />
    </div>
  );
}

export function TriggerGate() {
  const [edgarOnly, setEdgarOnly] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [limit, setLimit] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; url?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2 muted">
          <input type="checkbox" checked={edgarOnly} onChange={(e) => setEdgarOnly(e.target.checked)} /> EDGAR only (free, no Apollo)
        </label>
        <label className="flex items-center gap-2 muted">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry-run (no writes)
        </label>
        <label className="flex items-center gap-2"><span className="muted">Limit</span>
          <input type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="all" className="input w-20" />
        </label>
      </div>
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await triggerGate({ edgarOnly, dryRun, limit });
        setMsg(r.error ? { kind: "err", text: r.error } : { kind: "ok", text: "Gate dispatched. Watch Runs for status.", url: r.runUrl });
      })}>{pending ? "Dispatching…" : "Run gate now"}</button>
      <Status msg={msg} />
    </div>
  );
}
