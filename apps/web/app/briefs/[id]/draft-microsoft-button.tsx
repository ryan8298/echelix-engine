"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { draftMicrosoftOutreach, draftProspectOutreach } from "./outreach-actions";

export function DraftMicrosoftButton({ briefId, label = "Draft email" }: { briefId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn-primary" disabled={pending}
      onClick={() => start(async () => {
        const r = await draftMicrosoftOutreach(briefId);
        if (r.error) alert(r.error); else router.refresh();
      })}>
      {pending ? "Drafting…" : label}
    </button>
  );
}

export function DraftProspectButton({ briefId, label = "Draft prospect email" }: { briefId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn-primary" disabled={pending}
      onClick={() => start(async () => {
        const r = await draftProspectOutreach(briefId);
        if (r.error) alert(r.error); else router.refresh();
      })}>
      {pending ? "Drafting…" : label}
    </button>
  );
}
