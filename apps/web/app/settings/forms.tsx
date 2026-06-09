"use client";

import { useState, useTransition } from "react";
import type { EngineConfig } from "@echelix/core";
import { saveConfig } from "./actions";

const ROTATION_OPTIONS = [
  "utilities", "oil_and_gas", "distribution_transportation", "manufacturing", "financial_services",
] as const;

function StatusLine({ msg }: { msg: { kind: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>;
}

export function SettingsForms({ cfg, verticals }: { cfg: EngineConfig; verticals: string[] }) {
  return (
    <div className="space-y-6">
      <RotationCard rotation={cfg.rotation} />
      <RevenueBandCard band={cfg.revenue_band} />
      <WeightsCard weights={cfg.scoring_weights} floor={cfg.quality_floor} cooldown={cfg.cooldown_days} />
      <VerticalMapCard map={cfg.vertical_map} verticals={verticals} />
    </div>
  );
}

function RotationCard({ rotation }: { rotation: EngineConfig["rotation"] }) {
  const [r, setR] = useState(rotation);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-medium">Rotation</h2>
        <p className="muted text-sm">Which industry surfaces on each weekday. Set to blank to skip that day.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 text-sm">
        {(["monday", "tuesday", "wednesday", "thursday", "friday"] as const).map((d) => (
          <label key={d} className="flex flex-col gap-1">
            <span className="label">{d}</span>
            <select className="input" value={r[d] ?? ""} onChange={(e) => setR({ ...r, [d]: e.target.value || null })}>
              <option value="">— none —</option>
              {ROTATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r2 = await saveConfig("rotation", r);
          setMsg(r2.error ? { kind: "err", text: r2.error } : { kind: "ok", text: "Saved." });
        })}>{pending ? "Saving…" : "Save rotation"}</button>
        <StatusLine msg={msg} />
      </div>
    </section>
  );
}

function RevenueBandCard({ band }: { band: EngineConfig["revenue_band"] }) {
  const [lower, setLower] = useState(String(band.lower_usd / 1_000_000));
  const [upper, setUpper] = useState(String(band.upper_usd / 1_000_000));
  const [tie, setTie] = useState(String(Math.round(band.tiebreaker_pct * 100)));
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-medium">Revenue band (Stage 0 gate)</h2>
        <p className="muted text-sm">Accounts outside the band → <span className="font-mono">out_of_range</span>. Within ±N% of either edge → <span className="font-mono">no_data_review</span>.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="flex flex-col gap-1"><span className="label">Lower ($M)</span>
          <input className="input" type="number" value={lower} onChange={(e) => setLower(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1"><span className="label">Upper ($M)</span>
          <input className="input" type="number" value={upper} onChange={(e) => setUpper(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1"><span className="label">Tiebreaker (%)</span>
          <input className="input" type="number" value={tie} onChange={(e) => setTie(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const v = { lower_usd: Number(lower) * 1_000_000, upper_usd: Number(upper) * 1_000_000, tiebreaker_pct: Number(tie) / 100 };
          const r = await saveConfig("revenue_band", v);
          setMsg(r.error ? { kind: "err", text: r.error } : { kind: "ok", text: "Saved." });
        })}>{pending ? "Saving…" : "Save band"}</button>
        <StatusLine msg={msg} />
      </div>
    </section>
  );
}

function WeightsCard({ weights, floor, cooldown }: { weights: EngineConfig["scoring_weights"]; floor: EngineConfig["quality_floor"]; cooldown: number }) {
  const [w, setW] = useState(weights);
  const [f, setF] = useState(floor);
  const [c, setC] = useState(cooldown);
  const sum = w.freshness + w.relevance + w.triggers + w.ms_fit + w.anti_repeat;
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  function num(v: string, d: number): number { const n = Number(v); return isNaN(n) ? d : n; }
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-medium">Scoring</h2>
        <p className="muted text-sm">Weights must sum to 100. Floor sets the minimum freshness/relevance for eligibility. Cooldown blocks re-picking.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-sm">
        {(["freshness", "relevance", "triggers", "ms_fit", "anti_repeat"] as const).map((k) => (
          <label key={k} className="flex flex-col gap-1"><span className="label">{k}</span>
            <input className="input" type="number" value={w[k]} onChange={(e) => setW({ ...w, [k]: num(e.target.value, w[k]) })} />
          </label>
        ))}
      </div>
      <div className={`text-xs ${sum === 100 ? "muted" : "text-amber-400"}`}>sum = {sum}{sum !== 100 ? " (should be 100)" : ""}</div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="flex flex-col gap-1"><span className="label">min freshness</span>
          <input className="input" type="number" step="0.05" value={f.min_freshness} onChange={(e) => setF({ ...f, min_freshness: num(e.target.value, f.min_freshness) })} />
        </label>
        <label className="flex flex-col gap-1"><span className="label">min relevance</span>
          <input className="input" type="number" step="0.05" value={f.min_relevance} onChange={(e) => setF({ ...f, min_relevance: num(e.target.value, f.min_relevance) })} />
        </label>
        <label className="flex flex-col gap-1"><span className="label">cooldown days</span>
          <input className="input" type="number" value={c} onChange={(e) => setC(num(e.target.value, c))} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r1 = await saveConfig("scoring_weights", w);
          if (r1.error) { setMsg({ kind: "err", text: r1.error }); return; }
          const r2 = await saveConfig("quality_floor", f);
          if (r2.error) { setMsg({ kind: "err", text: r2.error }); return; }
          const r3 = await saveConfig("cooldown_days", c);
          if (r3.error) { setMsg({ kind: "err", text: r3.error }); return; }
          setMsg({ kind: "ok", text: "Saved." });
        })}>{pending ? "Saving…" : "Save scoring"}</button>
        <StatusLine msg={msg} />
      </div>
    </section>
  );
}

function VerticalMapCard({ map, verticals }: { map: EngineConfig["vertical_map"]; verticals: string[] }) {
  const [m, setM] = useState(map);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();
  const allKeys = Array.from(new Set([...Object.keys(m), ...verticals])).sort();
  const shown = allKeys.filter((k) => !filter || k.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-medium">Vertical map ({allKeys.length} known verticals)</h2>
        <p className="muted text-sm">
          Source spreadsheet Vertical → rotation bucket. Unmapped verticals (or "other") become <span className="font-mono">status=out_of_rotation</span> — still searchable on Accounts, just not auto-surfaced.
          Reapply changes by re-running the loader (idempotent) or via a future "reapply rotation" worker job.
        </p>
      </div>
      <input className="input w-full" placeholder="filter verticals…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="max-h-[480px] overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-border bg-surface">
            <tr className="text-left text-xs muted">
              <th className="px-3 py-2">Vertical</th><th className="px-3 py-2">Maps to bucket</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((k) => (
              <tr key={k} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-1.5">{k}</td>
                <td className="px-3 py-1.5">
                  <select className="input" value={m[k] ?? ""} onChange={(e) => {
                    const v = e.target.value;
                    setM(v ? { ...m, [k]: v } : Object.fromEntries(Object.entries(m).filter(([key]) => key !== k)));
                  }}>
                    <option value="">— unmapped (other) —</option>
                    {ROTATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await saveConfig("vertical_map", m);
          setMsg(r.error ? { kind: "err", text: r.error } : { kind: "ok", text: "Saved. Re-run the loader to re-classify existing rows on the new map." });
        })}>{pending ? "Saving…" : "Save vertical map"}</button>
        <StatusLine msg={msg} />
      </div>
    </section>
  );
}
