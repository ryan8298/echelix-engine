import { TriggerEnrich, TriggerSelect, TriggerGate } from "./forms";

export const dynamic = "force-dynamic";

export default function TriggersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Triggers</h1>
        <p className="muted mt-1 text-sm">
          Fire any loop on demand. Each button dispatches the corresponding GitHub Actions workflow and runs on cloud infrastructure — same code paths as the nightly cron.
        </p>
      </div>

      <section className="card space-y-4">
        <div>
          <h2 className="font-medium">Loop 1 — Enrichment</h2>
          <p className="muted text-sm">Refreshes signals from Google News + EDGAR (free). Apollo is reserved for the gate; it's not in Loop 1 yet.</p>
        </div>
        <TriggerEnrich />
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="font-medium">Loop 2 — Selection</h2>
          <p className="muted text-sm">Picks the top-N for the chosen industry, writes brief queue rows. Sets a 30-day cooldown on picks.</p>
        </div>
        <TriggerSelect />
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="font-medium">Stage 0 — Revenue Gate</h2>
          <p className="muted text-sm">
            EDGAR cascade is free. Apollo step costs ~1 credit per EDGAR miss (estimated ~564 credits on a full cascade).
            Use <span className="font-mono">edgar-only</span> for a free dry-run, or full live for real verdicts.
          </p>
        </div>
        <TriggerGate />
      </section>
    </div>
  );
}
