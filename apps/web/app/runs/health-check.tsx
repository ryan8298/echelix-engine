"use client";

import { useEffect, useState } from "react";

type HealthStatus = "ok" | "stale" | "missing";
type Health = {
  loop: string;
  lastRunAt: string | null;
  status: HealthStatus;
  hoursAgo: number | null;
  alert: string | null;
};

const CADENCES: Record<string, { name: string; intervalHours: number; daysAgo: number }> = {
  loop1_enrich: { name: "Loop 1 enrichment", intervalHours: 24, daysAgo: 1 },
  loop2_select: { name: "Loop 2 selection", intervalHours: 24, daysAgo: 1 },
  stage3_web: { name: "Stage 3 web resolver", intervalHours: 168, daysAgo: 7 },
};

export function HealthCheck({ runs }: { runs: Array<{ loop_name: string; finished_at: string | null; started_at: string }> }) {
  const [health, setHealth] = useState<Health[]>([]);

  useEffect(() => {
    const now = new Date();
    const statuses: Health[] = [];

    for (const [loopName, cadence] of Object.entries(CADENCES)) {
      const lastRun = runs.find((r) => r.loop_name === loopName && r.finished_at);
      const lastFinished = lastRun?.finished_at ? new Date(lastRun.finished_at).getTime() : null;
      const hoursAgo = lastFinished ? (now.getTime() - lastFinished) / 3_600_000 : null;

      let status: HealthStatus = "missing";
      let alert: string | null = null;

      if (lastFinished) {
        if (hoursAgo! > cadence.intervalHours * 2) {
          status = "stale";
          alert = `${loopName} hasn't run in ${Math.round(hoursAgo! / 24)} days`;
        } else if (hoursAgo! > cadence.intervalHours * 1.5) {
          status = "stale";
          alert = `${loopName} is overdue`;
        } else {
          status = "ok";
        }
      } else {
        alert = `${loopName} has never run`;
      }

      statuses.push({
        loop: cadence.name,
        lastRunAt: lastRun?.finished_at ?? null,
        status,
        hoursAgo,
        alert,
      });
    }

    setHealth(statuses);
  }, [runs]);

  const criticalAlerts = health.filter((h) => h.status !== "ok");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Engine Health</h3>
        <span className={`badge text-xs ${health.every((h) => h.status === "ok") ? "bg-green-900 text-green-200" : "bg-yellow-900 text-yellow-200"}`}>
          {health.filter((h) => h.status === "ok").length}/{health.length} healthy
        </span>
      </div>

      {criticalAlerts.length > 0 && (
        <div className="rounded-md border border-yellow-800 bg-yellow-900/20 p-3">
          {criticalAlerts.map((h) => (
            <p key={h.loop} className="text-xs text-yellow-300">
              ⚠️ {h.alert}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {health.map((h) => (
          <div key={h.loop} className="flex items-center justify-between rounded border border-border bg-bg/50 p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${h.status === "ok" ? "bg-green-500" : h.status === "stale" ? "bg-yellow-500" : "bg-red-500"}`} />
              <span className="font-mono">{h.loop}</span>
            </div>
            <span className="muted">{h.lastRunAt ? `${Math.round(h.hoursAgo!)} hours ago` : "never"}</span>
          </div>
        ))}
      </div>

      <p className="text-xs muted">
        Health checks refresh on page load. Crons configured in <code>vercel.json</code>. Set <code>CRON_SECRET</code> env var on Vercel to enable automated runs.
      </p>
    </div>
  );
}
