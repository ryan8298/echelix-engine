"use client";

import { useState, useTransition } from "react";
import { refreshApolloForAccount } from "./actions";

export function ApolloRefreshButton({ tpid }: { tpid: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button className="btn" disabled={pending} onClick={() => start(async () => {
        const r = await refreshApolloForAccount(tpid);
        setMsg(r.error ?? "Apollo refresh dispatched. Check Runs in ~30s.");
      })}>
        {pending ? "Dispatching…" : "Refresh Apollo data (1 credit)"}
      </button>
      {msg ? <span className="text-xs muted">{msg}</span> : null}
    </div>
  );
}
