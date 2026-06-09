"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBriefStatus } from "./actions";

const NEXT: Record<"draft" | "reviewed" | "sent", { label: string; next: "draft" | "reviewed" | "sent" } | null> = {
  draft: { label: "Mark reviewed", next: "reviewed" },
  reviewed: { label: "Mark sent", next: "sent" },
  sent: null,
};

export function BriefStatusButtons({ briefId, currentStatus }: { briefId: string; currentStatus: "draft" | "reviewed" | "sent" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const action = NEXT[currentStatus];
  if (!action) return <span className="badge">sent</span>;
  return (
    <button
      className="btn-primary"
      disabled={pending}
      onClick={() => start(async () => {
        const r = await setBriefStatus(briefId, action.next);
        if (r.error) alert(r.error);
        else router.refresh();
      })}
    >
      {pending ? "…" : action.label}
    </button>
  );
}
