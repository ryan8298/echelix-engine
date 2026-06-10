"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findProspectsForBrief, enrichAndSetOutreachRecipient } from "./find-prospect-actions";

type Candidate = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  organization_name: string | null;
  email: string | null;
  linkedin_url: string | null;
};

export function FindProspectButton({ briefId, outreachId }: { briefId: string; outreachId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ company: string; titles: string[] } | null>(null);

  function search() {
    setError(null);
    start(async () => {
      const r = await findProspectsForBrief(briefId);
      if (r.error) { setError(r.error); return; }
      if (r.ok) {
        setCandidates(r.ok.candidates as Candidate[]);
        setFilters({ company: r.ok.used_filters.company ?? "—", titles: r.ok.used_filters.titles.slice(0, 5) });
        setOpen(true);
      }
    });
  }

  function pick(c: Candidate) {
    start(async () => {
      const r = await enrichAndSetOutreachRecipient(outreachId, {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        organization_name: c.organization_name,
        existingEmail: c.email,
      });
      if (r.error) { setError(r.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn" onClick={search} disabled={pending} title="Searches Apollo for the best buyer at this account — costs ~1-2 credits">
        {pending ? "Searching…" : "Find best contact"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">Best-fit contacts at {filters?.company}</h3>
                <p className="text-xs muted">Searched titles: {filters?.titles.join(", ")} — pick one to enrich the email (1 credit).</p>
              </div>
              <button className="btn" onClick={() => setOpen(false)}>Close</button>
            </div>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            {candidates.length === 0 ? (
              <p className="text-sm muted">No matches. Try editing the ICP buyer titles in /settings.</p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((c) => (
                  <li key={c.id} className="rounded-md border border-border bg-bg p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{c.name || "—"}</div>
                        <div className="muted text-xs">{c.title ?? "—"} {c.seniority ? `· ${c.seniority}` : ""}</div>
                        <div className="muted text-xs">{c.organization_name ?? ""}</div>
                        {c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-xs underline">LinkedIn ↗</a> : null}
                      </div>
                      <button className="btn-primary" onClick={() => pick(c)} disabled={pending}>
                        {pending ? "…" : (c.email ? "Use" : "Enrich + use")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
